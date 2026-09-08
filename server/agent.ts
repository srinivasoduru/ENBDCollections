import Anthropic from '@anthropic-ai/sdk';

import type { StatusResponse } from '../src/shared/api';
import { firstName, personaById, type Persona } from '../src/shared/personas';
import { type Classifier, classify } from './compliance/classifier';
import { readIdentity, disclosesAi } from './compliance/identity';
import { collectNumbers, extractAmounts } from './compliance/money';
import { OUTPUT_RULES_VERSION, screenOutput } from './compliance/output';
import { PREFLIGHT_VERSIONS, screen } from './compliance/preflight';
import { LOCKED_REPLY, REFUSED_REPLY, handoffFor } from './handoff';
import { SESSION_OPENER, systemPrompt } from './prompt';
import { scriptedTurn } from './script';
import { isResolvingTool, namesBank, stageForTool, statesPurpose } from './state';
import { appendTrace, type Session } from './store';
import { TOOL_DEFS, asCategory, contactPermitted, contactWindowLabel, traceTool, type ToolCall } from './tools';

/**
 * Turn orchestration.
 *
 * The pipeline the spec calls for is:
 *   1. session lookup / lock check
 *   2. pre-flight gate on customer text
 *   3. contact eligibility check
 *   4. model call with tool loop
 *   5. post-generation gate on model output
 *   6. append trace, update state, return
 *
 * All six steps are implemented. With the pre-flight gate in place,
 * escalation on a hardship, dispute, legal or stop-contact signal no longer
 * depends on the model choosing to call escalate_to_human: the server decides
 * before the model is invoked, and on a hit it is not invoked at all. The tool
 * remains available as a redundant path for cases the gate did not anticipate.
 *
 */

/** Overridable with AGENT_MODEL. */
const DEFAULT_MODEL = 'claude-opus-5';

/** Replies are one to three spoken sentences; the ceiling only covers thinking. */
const MAX_TOKENS = 4096;

/** A turn needing more tool round-trips than this is misbehaving. */
const MAX_ITERATIONS = 7;

let client: Anthropic | null = null;

export const modelId = (): string => process.env.AGENT_MODEL || DEFAULT_MODEL;

const hasCredentials = (): boolean =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export function agentStatus(): StatusResponse {
  if (!hasCredentials()) {
    return {
      live: false,
      model: null,
      reason:
        'No ANTHROPIC_API_KEY in the server environment — sessions run the offline script.',
    };
  }
  return { live: true, model: modelId() };
}

const getClient = (): Anthropic => (client ??= new Anthropic());

const apiTools = TOOL_DEFS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema as Anthropic.Tool.InputSchema,
}));

/**
 * Raised when the contact-eligibility check refuses the outbound contact.
 * Distinct from a request error: nothing is wrong with the call, the bank is
 * simply not permitted to place it.
 */
export class ContactRefusedError extends Error {
  constructor(readonly hour: number) {
    super(
      `Contact refused before placement — ${String(hour).padStart(2, '0')}:00 is outside the CBUAE window of ${contactWindowLabel()}.`,
    );
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface TurnResult {
  reply: string;
  /** Explains a mode change to the room, when one happened. */
  notice?: string;
}

/**
 * Applies one executed tool call to the session: trace, stage, escalation.
 *
 * `source` is what actually decided the escalation. Recording it accurately
 * matters: an escalation produced by the offline script, or later by a gate or
 * a system failure, must never appear in the audit as the model having judged a
 * customer to be in hardship.
 */
function absorbToolCall(session: Session, call: ToolCall, source: 'model' | 'script'): void {
  session.toolCalls.push(call);
  appendTrace(session, {
    kind: 'tool_call',
    name: call.name,
    input: call.input,
    output: call.output,
    // Populated once the gates land; the shape does not change then.
    gates: [],
  });

  const nextStage = stageForTool(call.name);
  if (nextStage) session.stage = nextStage;
  if (isResolvingTool(call.name)) session.resolved = true;

  // Record what the matrix actually served, so the post-generation gate can
  // check the agent's figures against the terms it was really given.
  if (call.name === 'get_offer_matrix') {
    for (const value of collectNumbers(call.output)) session.servedAmounts.add(value);
  }

  if (call.name === 'escalate_to_human') {
    session.escalated = true;
    session.escalationReason = call.reason ?? 'other';
    session.escalationVia = source;
    session.locked = true;
    // Once the pre-flight gate exists, the model's own call becomes the
    // redundant path rather than the primary one.
    appendTrace(session, { kind: 'escalation', reason: session.escalationReason, source });
    if (session.escalationReason === 'hardship') openOfficerPack(session);
  }
}

/**
 * The Remediation Agent's work, which begins only once the conversation has
 * stopped.
 *
 * These terms — longer tenor, larger waiver, lower settlement floor — are
 * prepared for an approving officer. They were never available to the
 * negotiation agent and are never spoken aloud. A more generous offer is not
 * the response to hardship; a person is.
 */
export function openOfficerPack(session: Session): void {
  if (session.officerPack) return;
  const persona = requirePersona(session.personaId);

  const pack = traceTool(persona, 'open_hardship_case', {});
  absorbToolCall(session, pack.call, 'script');
  session.officerPack = pack.result;

  const eosb = traceTool(persona, 'calculate_eosb_offset', {});
  absorbToolCall(session, eosb.call, 'script');
  session.eosb = eosb.result;
}

/** Records an agent turn and evaluates the disclosure check against it. */
function absorbAgentTurn(session: Session, text: string, source: 'model' | 'script' | 'canned'): void {
  const opening = session.agentTurns === 0;
  session.agentTurns += 1;

  // Identification and purpose land on different turns by design, so the two
  // halves latch. Until the holder is confirmed the agent is forbidden from
  // stating the purpose, so a missing purpose is not yet a failure — the guard
  // stays pending rather than reporting a breach the design itself requires.
  if (session.disclosed !== true) {
    session.identified = session.identified || namesBank(text);
    session.disclosed =
      session.identified && statesPurpose(text) ? true : session.identityConfirmed ? false : null;
  }
  // The CBUAE AI Guidance Note requires the agent to name itself as an AI
  // assistant at first contact. Read once, off the opening turn.
  if (opening) session.aiDisclosed = disclosesAi(text);
  appendTrace(session, { kind: 'agent_turn', text, source });
}

/** Step 4: model call with the server-side tool loop. */
async function callModel(session: Session, persona: Persona): Promise<string> {
  const startedAt = Date.now();
  let reply = '';
  let iterations = 0;
  let stopReason: string | null = null;

  for (; iterations < MAX_ITERATIONS; iterations++) {
    const response = await getClient().messages.create({
      model: modelId(),
      max_tokens: MAX_TOKENS,
      // Identical on every turn of a session, so worth caching across it.
      system: [{ type: 'text', text: systemPrompt(persona), cache_control: { type: 'ephemeral' } }],
      // Short conversational turns; responsiveness in the room is the constraint.
      output_config: { effort: 'low' },
      tools: apiTools,
      messages: session.messages,
    });

    stopReason = response.stop_reason;
    if (response.stop_reason === 'refusal') {
      throw new ApiError('The model declined to continue this conversation.', 502, 'model_refusal');
    }

    for (const block of response.content) {
      if (block.type === 'text') reply += (reply ? '\n\n' : '') + block.text;
    }
    session.messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (toolUses.length === 0) break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      // Tool inputs are parsed JSON from the SDK; never string-match them.
      const input = (use.input ?? {}) as Record<string, unknown>;
      if (use.name === 'escalate_to_human') input.reason = asCategory(input.reason);
      const { result, call } = traceTool(persona, use.name, input);
      absorbToolCall(session, call, 'model');
      results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
    }
    session.messages.push({ role: 'user', content: results });

    // Escalation ends the turn. Continuing the loop would spend another model
    // call and let the agent keep talking past the hard stop.
    if (session.escalated) break;
  }

  appendTrace(session, {
    kind: 'model_call',
    model: modelId(),
    iterations: iterations + 1,
    latencyMs: Date.now() - startedAt,
    stopReason,
  });

  if (iterations >= MAX_ITERATIONS) {
    // Fail closed rather than emitting a placeholder to the customer.
    throw new ApiError('Tool loop limit reached before the agent produced a reply.', 502, 'loop_limit');
  }
  return reply.trim() || '…';
}

/** Runs the offline script for one turn, executing the same tool handlers. */
function runScript(session: Session, persona: Persona, say: string | null): string {
  const turn = scriptedTurn(persona, session.scriptStep, say, {
    identityConfirmed: session.identityConfirmed,
    thirdParty: session.thirdParty,
  });
  session.scriptStep = turn.step;
  for (const call of turn.toolCalls) absorbToolCall(session, call, 'script');
  return turn.reply;
}

/**
 * Produces one agent turn.
 *
 * When the model is unavailable the server serves the offline script instead of
 * failing the turn: a dead panel in front of a risk committee is worse than a
 * scripted one, and the session state reports which mode produced the reply so
 * the front end can label it honestly.
 */
interface Produced {
  reply: string;
  source: 'model' | 'script' | 'canned';
  notice?: string;
}

async function produceTurn(session: Session, persona: Persona, say: string | null): Promise<Produced> {
  const wasEscalated = session.escalated;

  /**
   * Once a turn escalates, the customer gets the fixed handoff string — never
   * whatever the model or the script said on its way out. The handoff must not
   * negotiate, restate the balance or ask a follow-up question, and that is
   * only guaranteed if the text is not generated.
   */
  const settle = (reply: string, source: 'model' | 'script'): Produced => {
    const escalatedNow = !wasEscalated && session.escalated;
    return escalatedNow
      ? { reply: handoffFor(session.escalationReason), source: 'canned' }
      : { reply, source };
  };

  if (session.mode === 'offline') {
    return settle(runScript(session, persona, say), 'script');
  }

  try {
    return settle(await callModel(session, persona), 'model');
  } catch (err) {
    const why = err instanceof Error ? err.message : 'Model call failed.';
    appendTrace(session, {
      kind: 'error',
      message: why,
      action: 'demoted session to offline script',
    });
    // Demote the session: a later turn should not retry a call already failing.
    session.mode = 'offline';
    session.scriptStep = session.agentTurns;
    return {
      ...settle(runScript(session, persona, say), 'script'),
      notice: `Model call failed — ${why} Continuing on the offline script.`,
    };
  }
}

/**
 * Step 5 — the post-generation gate, then record the turn.
 *
 * Nothing the agent produces is recorded as spoken until it has passed. A
 * blocked reply is written to the audit trace marked `suppressed` — the
 * customer never sees it, but an examiner needs to know what was stopped —
 * and the fixed handoff goes out in its place.
 *
 * Canned text is not re-screened: it is fixed, reviewed, and safe by
 * construction, and running it through the gate would risk suppressing the
 * very message that handles an escalation.
 */
function finaliseTurn(session: Session, persona: Persona, produced: Produced): TurnResult {
  if (produced.source === 'canned') {
    absorbAgentTurn(session, produced.reply, 'canned');
    return { reply: produced.reply, ...(produced.notice ? { notice: produced.notice } : {}) };
  }

  const verdict = screenOutput(produced.reply, {
    served: session.servedAmounts,
    balance: persona.balance,
    customerProposed: session.customerAmounts,
    identityConfirmed: session.identityConfirmed,
    toolNames: TOOL_DEFS.map((t) => t.name),
  });

  appendTrace(session, {
    kind: 'gate',
    gate: 'postgeneration',
    decision: verdict.blocked ? 'block' : 'pass',
    latencyMs: verdict.latencyMs,
    versions: { outputRules: OUTPUT_RULES_VERSION },
    ...(verdict.blocked
      ? { rule: verdict.rule, detail: verdict.detail, evidence: verdict.evidence }
      : {}),
  });

  if (!verdict.blocked) {
    absorbAgentTurn(session, produced.reply, produced.source);
    return { reply: produced.reply, ...(produced.notice ? { notice: produced.notice } : {}) };
  }

  // Suppressed: recorded, never sent.
  appendTrace(session, {
    kind: 'agent_turn',
    text: produced.reply,
    source: produced.source,
    suppressed: true,
  });

  session.escalated = true;
  session.escalationReason = 'other';
  session.escalationVia = 'postgen';
  session.blockedRule = verdict.rule;
  session.locked = true;
  session.stage = 'close';
  appendTrace(session, { kind: 'escalation', reason: 'other', source: 'gate' });

  const handoff = handoffFor('other');
  absorbAgentTurn(session, handoff, 'canned');
  return { reply: handoff, ...(produced.notice ? { notice: produced.notice } : {}) };
}

/**
 * The Segment Agent's suppression decision, taken before any conversation.
 *
 * Recorded as real tool calls so the trace shows why no contact was placed:
 * the self-cure score, then the suppression itself. The customer receives a
 * reminder and a payment link only.
 */
export function suppressContact(session: Session): void {
  const persona = requirePersona(session.personaId);
  for (const [name, input] of [
    ['get_segment_scores', {}],
    ['suppress_contact', { reason: 'self_cure_propensity_above_threshold' }],
  ] as const) {
    const { call } = traceTool(persona, name, input);
    absorbToolCall(session, call, 'script');
  }
  session.stage = 'close';
}

/** Opening turn, produced when the session is created. */
export async function openSession(session: Session): Promise<TurnResult> {
  const persona = requirePersona(session.personaId);

  // Step 3 — contact eligibility. This runs before the outbound contact is
  // placed, not after it connects, so a refusal means no conversation ever
  // existed. The agent is never asked and cannot override it.
  const { call } = traceTool(persona, 'check_contact_eligibility', { hour: session.contactHour });
  absorbToolCall(session, call, 'script');
  if (!contactPermitted(session.contactHour)) {
    // No conversation exists, so the session is closed to turns as well: the
    // agent must not be able to talk its way past a refusal.
    session.stage = 'close';
    session.locked = true;
    throw new ContactRefusedError(session.contactHour);
  }

  session.messages = [{ role: 'user', content: SESSION_OPENER }];
  // The opening turn goes through the post-generation gate like any other — it
  // is the first thing the customer hears, and the turn where disclosing an
  // account detail before identity is confirmed would be a breach.
  return finaliseTurn(session, persona, await produceTurn(session, persona, null));
}

/** Options exist so tests can supply a classifier without a network call. */
export interface TurnOptions {
  classifier?: Classifier | null;
}

/**
 * The classifier needs the same credentials the main model does. With none
 * configured, screening runs on patterns alone rather than failing closed on
 * every turn — see the note on `screen`.
 */
const defaultClassifier = (): Classifier | null => (hasCredentials() ? classify : null);

/** One customer turn. */
export async function runTurn(
  session: Session,
  text: string,
  { classifier = defaultClassifier() }: TurnOptions = {},
): Promise<TurnResult> {
  const persona = requirePersona(session.personaId);

  // Step 1 — a locked session never reaches the model again. That covers both
  // an escalation and a contact the compliance layer refused to place.
  if (session.locked) {
    const reply = session.escalated ? LOCKED_REPLY : REFUSED_REPLY;
    appendTrace(session, { kind: 'customer_turn', text });
    appendTrace(session, { kind: 'agent_turn', text: reply, source: 'canned' });
    return { reply };
  }

  appendTrace(session, { kind: 'customer_turn', text });

  // Step 2 — pre-flight gate. Runs before anything else touches the text.
  const decision = await screen(text, classifier);
  appendTrace(session, {
    kind: 'gate',
    gate: 'preflight',
    decision: decision.escalate ? 'escalate' : 'pass',
    latencyMs: decision.latencyMs,
    versions: PREFLIGHT_VERSIONS,
    ...(decision.classifierRan
      ? {}
      : !decision.escalate
        ? { detail: 'Pattern-only screening — no classifier configured on this server.' }
        : {}),
    ...(decision.escalate
      ? { via: decision.via, category: decision.category, detail: decision.detail }
      : {}),
    ...(decision.confidence !== undefined ? { confidence: decision.confidence } : {}),
  });

  if (decision.escalate) {
    // The model is never invoked for this turn. The customer's text is not
    // added to the model history and no tool runs.
    session.escalated = true;
    session.escalationReason = decision.category;
    session.escalationVia = decision.via === 'system' ? 'system' : 'preflight';
    session.locked = true;
    session.stage = 'close';

    appendTrace(session, {
      kind: 'escalation',
      reason: decision.category,
      source: decision.via === 'system' ? 'system' : 'gate',
    });

    // The Remediation Agent's work starts however the hardship was caught. On
    // this path the model was never invoked, so escalate_to_human never ran —
    // the pack still has to be prepared for the officer.
    if (decision.category === 'hardship') openOfficerPack(session);

    const reply = handoffFor(decision.category);
    absorbAgentTurn(session, reply, 'canned');
    return { reply };
  }

  // Step 3 ran at session creation; the window is a property of placing the
  // contact, not of each turn inside a conversation the customer answered.

  // Identity signals are read before the model sees the turn, so the output
  // gate knows whether disclosure is permitted on the reply it is about to
  // screen.
  const identity = readIdentity(text, firstName(persona));
  if (identity.thirdParty) session.thirdParty = true;
  if (identity.confirmed) {
    session.identityConfirmed = true;
    if (session.stage === 'identify') session.stage = 'verify';
  }

  // Figures the customer proposes are allowed back in the agent's reply — it
  // has to be able to repeat a number in order to decline it.
  for (const amount of extractAmounts(text)) session.customerAmounts.add(amount);

  session.messages.push({ role: 'user', content: text });

  // Steps 4 and 5.
  return finaliseTurn(session, persona, await produceTurn(session, persona, text));
}

/** Exported so the locked-session path and the future gates share one source. */
export { handoffFor };

function requirePersona(personaId: string): Persona {
  const persona = personaById(personaId);
  if (!persona) throw new ApiError(`Unknown persona: ${personaId}`, 400, 'unknown_persona');
  return persona;
}

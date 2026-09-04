import Anthropic from '@anthropic-ai/sdk';

import type { StatusResponse } from '../src/shared/api';
import { personaById, type Persona } from '../src/shared/personas';
import { type Classifier, classify } from './compliance/classifier';
import { PREFLIGHT_VERSIONS, screen } from './compliance/preflight';
import { LOCKED_REPLY, handoffFor } from './handoff';
import { SESSION_OPENER, systemPrompt } from './prompt';
import { scriptedTurn } from './script';
import { checkDisclosure, isResolvingTool, stageForTool } from './state';
import { appendTrace, type Session } from './store';
import { TOOL_DEFS, asCategory, traceTool, type ToolCall } from './tools';

/**
 * Turn orchestration.
 *
 * The pipeline the spec calls for is:
 *   1. session lookup / lock check
 *   2. pre-flight gate on customer text
 *   3. contact eligibility check             ← not built yet
 *   4. model call with tool loop
 *   5. post-generation gate on model output  ← not built yet
 *   6. append trace, update state, return
 *
 * Steps 1, 2, 4 and 6 are implemented. With the pre-flight gate in place,
 * escalation on a hardship, dispute, legal or stop-contact signal no longer
 * depends on the model choosing to call escalate_to_human: the server decides
 * before the model is invoked, and on a hit it is not invoked at all. The tool
 * remains available as a redundant path for cases the gate did not anticipate.
 *
 * Steps 3 and 5 are still absent and their insertion points are marked.
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

  if (call.name === 'escalate_to_human') {
    session.escalated = true;
    session.escalationReason = call.reason ?? 'other';
    session.escalationVia = source;
    session.locked = true;
    // Once the pre-flight gate exists, the model's own call becomes the
    // redundant path rather than the primary one.
    appendTrace(session, { kind: 'escalation', reason: session.escalationReason, source });
  }
}

/** Records an agent turn and evaluates the disclosure check against it. */
function absorbAgentTurn(session: Session, text: string, source: 'model' | 'script' | 'canned'): void {
  const opening = session.agentTurns === 0;
  session.agentTurns += 1;
  if (session.disclosed === null || opening) session.disclosed = checkDisclosure(text, opening);
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
  const turn = scriptedTurn(persona, session.scriptStep, say);
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
async function produceTurn(session: Session, persona: Persona, say: string | null): Promise<TurnResult> {
  const wasEscalated = session.escalated;

  /**
   * Once a turn escalates, the customer gets the fixed handoff string — never
   * whatever the model or the script said on its way out. The handoff must not
   * negotiate, restate the balance or ask a follow-up question, and that is
   * only guaranteed if the text is not generated.
   */
  const settle = (reply: string, source: 'model' | 'script'): TurnResult => {
    const escalatedNow = !wasEscalated && session.escalated;
    const text = escalatedNow ? handoffFor(session.escalationReason) : reply;
    absorbAgentTurn(session, text, escalatedNow ? 'canned' : source);
    return { reply: text };
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

/** Opening turn, produced when the session is created. */
export async function openSession(session: Session): Promise<TurnResult> {
  const persona = requirePersona(session.personaId);
  session.messages = [{ role: 'user', content: SESSION_OPENER }];
  // ── step 3: contact eligibility check belongs here, before the outbound
  //    contact is made. Not built yet.
  return produceTurn(session, persona, null);
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

  // Step 1 — a locked session never reaches the model again.
  if (session.locked) {
    appendTrace(session, { kind: 'customer_turn', text });
    appendTrace(session, { kind: 'agent_turn', text: LOCKED_REPLY, source: 'canned' });
    return { reply: LOCKED_REPLY };
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
    session.escalationVia = decision.via === 'system' ? 'system' : 'gate';
    session.locked = true;
    session.stage = 'close';

    appendTrace(session, {
      kind: 'escalation',
      reason: decision.category,
      source: decision.via === 'system' ? 'system' : 'gate',
    });

    const reply = handoffFor(decision.category);
    absorbAgentTurn(session, reply, 'canned');
    return { reply };
  }

  // ── step 3: contact eligibility check belongs here.

  session.messages.push({ role: 'user', content: text });
  const result = await produceTurn(session, persona, text);

  // ── step 5: post-generation gate on result.reply belongs here. When it
  //    fires it suppresses the reply, escalates, and returns the canned handoff.

  return result;
}

/** Exported so the locked-session path and the future gates share one source. */
export { handoffFor };

function requirePersona(personaId: string): Persona {
  const persona = personaById(personaId);
  if (!persona) throw new ApiError(`Unknown persona: ${personaId}`, 400, 'unknown_persona');
  return persona;
}

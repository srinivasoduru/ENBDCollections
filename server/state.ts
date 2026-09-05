import type { GuardView, PipelineStep, SessionState, StageKey, ToolTraceEntry } from '../src/shared/api';
import type { Session } from './store';

/**
 * Projects a session into the shape the browser renders.
 *
 * All of this used to be computed in the front end. It lives here now so the
 * panels cannot disagree with what the server actually did, and so the API is
 * complete enough to drive from curl with no front end at all.
 */

export const PIPELINE: { key: StageKey; label: string }[] = [
  { key: 'identify', label: 'Identify & disclose' },
  { key: 'verify', label: 'Verify account' },
  { key: 'assess', label: 'Assess segment & intent' },
  { key: 'resolve', label: 'Negotiate / resolve' },
  { key: 'confirm', label: 'Confirm & log' },
  { key: 'close', label: 'Close' },
];

const STAGE_ORDER = PIPELINE.map((s) => s.key);

/** Which conversation stage each tool implies once it has been called. */
const STAGE_FOR_TOOL: Record<string, StageKey> = {
  get_account_status: 'verify',
  get_segment_scores: 'assess',
  get_offer_matrix: 'resolve',
  log_promise_to_pay: 'confirm',
  initiate_payment: 'confirm',
  escalate_to_human: 'close',
};

const RESOLVING_TOOLS = new Set(['log_promise_to_pay', 'initiate_payment']);

export const stageForTool = (name: string): StageKey | undefined => STAGE_FOR_TOOL[name];
export const isResolvingTool = (name: string): boolean => RESOLVING_TOOLS.has(name);

/** Did the agent identify Emirates NBD and state the purpose of contact? */
export function checkDisclosure(text: string, opening: boolean): boolean {
  const named = /emirates nbd/i.test(text);
  if (!opening) return named;
  return named && /(outstanding|overdue|past due|payment|amount due|collect)/i.test(text);
}

function buildPipeline(session: Session): PipelineStep[] {
  const idx = STAGE_ORDER.indexOf(session.stage);
  return PIPELINE.map((step, i) => {
    const done = i < idx || (session.resolved && i <= idx);
    const active = i === idx && !session.escalated && !done;
    return { ...step, status: done ? 'done' : active ? 'active' : 'pending' };
  });
}

/**
 * The compliance floor as observed on this conversation.
 *
 * Three of these hold structurally — the tool surface makes the alternative
 * impossible. The rest are read off the agent's actual behaviour this session.
 * When the pre-flight and post-generation gates land they report here too.
 */
function buildGuards(session: Session): GuardView[] {
  const used = (name: string): boolean => session.toolCalls.some((t) => t.name === name);
  const { disclosed, escalated, escalationReason, escalationVia, blockedRule, resolved } = session;

  /** The post-generation gate's most recent block, if any. */
  const blocked = (...rules: typeof blockedRule[]): boolean =>
    blockedRule !== null && rules.includes(blockedRule);

  // How the hard stop fired matters more than that it fired. Caught by the gate
  // means the model was never asked to respond to that turn at all; caught by
  // the model's own tool call means the deterministic layer did not anticipate
  // the phrasing and the redundant path did the work.
  const hardStopDetail = escalated
    ? escalationVia === 'preflight'
      ? `Caught by the pre-flight gate — ${escalationReason}. The model was never invoked for that turn.`
      : escalationVia === 'postgen'
        ? 'The agent produced a non-compliant reply. It was suppressed before the customer saw it and the session was handed to an officer.'
        : escalationVia === 'system'
          ? 'Screening could not complete, so the turn escalated on the fail-closed rule. The model was never invoked.'
          : `Triggered by the agent itself — reason: ${escalationReason}. The pre-flight gate did not match this phrasing.`
    : resolved
      ? 'Not required — resolved without a hardship or dispute signal.'
      : 'Every customer turn is screened for hardship, dispute, legal and stop-contact signals before the model sees it.';

  return [
    {
      id: 'disclosure',
      status: disclosed === null ? 'pending' : disclosed ? 'pass' : 'flag',
      title: 'Identification & purpose disclosure',
      detail:
        disclosed === null
          ? "Checked against the agent's opening turn."
          : disclosed
            ? 'Detected — the agent identified Emirates NBD and stated the purpose of contact.'
            : 'Not detected in the opening turn. In production this would fail QA before the call connected.',
    },
    {
      id: 'sourced_claims',
      status: used('get_account_status') ? 'pass' : 'pending',
      title: 'No un-sourced account claims',
      detail: 'The agent must call get_account_status before stating any balance or DPD figure.',
    },
    {
      id: 'offer_matrix',
      status: blocked('off_matrix_offer') ? 'flag' : used('get_offer_matrix') ? 'pass' : 'pending',
      title: 'Offer matrix enforcement',
      detail: blocked('off_matrix_offer')
        ? 'A reply stated a figure the matrix did not return for this account. It was suppressed before the customer saw it.'
        : 'Terms may only come from the pre-approved cluster matrix. Every reply is checked against the figures the matrix actually served before it is sent.',
    },
    {
      id: 'tokenised_payment',
      status: 'pass',
      title: 'Payment data tokenised',
      detail:
        'initiate_payment accepts an amount only. The model has no path to a card number or IBAN.',
    },
    {
      id: 'hard_stop',
      status: escalated ? 'info' : resolved ? 'pass' : 'pending',
      title: 'Hardship / dispute hard stop',
      detail: hardStopDetail,
    },
    {
      id: 'contact_window',
      status: 'pass',
      title: 'CBUAE contact window & frequency',
      detail:
        'Permitted hours and attempt caps are enforced by the orchestrator before a call is placed, not by the agent.',
    },
    {
      id: 'third_party',
      status: blocked('legal_threat', 'third_party_contact', 'bureau_promise') ? 'flag' : 'pass',
      title: 'No third-party contact, no legal threat',
      detail: blocked('legal_threat')
        ? 'A reply referred to legal or criminal consequences. It was suppressed before the customer saw it.'
        : blocked('third_party_contact')
          ? 'A reply referred to contacting an employer, sponsor, family member or reference. It was suppressed before the customer saw it.'
          : blocked('bureau_promise')
            ? 'A reply appeared to promise a change to the customer’s Al Etihad Credit Bureau record. It was suppressed before the customer saw it.'
            : 'Employer, family and reference contact are unavailable as tools, and every reply is scanned for legal threats, third-party contact and credit-bureau promises before it is sent.',
    },
  ];
}

const toDisplay = (session: Session): ToolTraceEntry[] =>
  session.toolCalls.map((t) => ({ name: t.name, inp: t.inp, out: t.out }));

export function buildState(session: Session): SessionState {
  return {
    sessionId: session.id,
    personaId: session.personaId,
    mode: session.mode,
    model: session.model,
    stage: session.stage,
    pipeline: buildPipeline(session),
    guards: buildGuards(session),
    trace: toDisplay(session),
    escalated: session.escalated,
    escalationReason: session.escalationReason,
    escalationVia: session.escalationVia,
    blockedRule: session.blockedRule,
    resolved: session.resolved,
    disclosed: session.disclosed,
    locked: session.locked,
  };
}

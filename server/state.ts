import type {
  GuardView,
  OfficerPack,
  PipelineStep,
  SessionState,
  StageKey,
  ToolTraceEntry,
} from '../src/shared/api';
import { personaById } from '../src/shared/personas';
import { contactPermitted, contactWindowLabel } from './tools';
import type { Session } from './store';

/**
 * Projects a session into the shape the browser renders.
 *
 * All of this used to be computed in the front end. It lives here now so the
 * panels cannot disagree with what the server actually did, and so the API is
 * complete enough to drive from curl with no front end at all.
 */

export const PIPELINE: { key: StageKey; label: string }[] = [
  { key: 'identify', label: 'AI disclosure & identity check' },
  { key: 'verify', label: 'Confirm holder, then state purpose' },
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

/** Does this turn name the bank? Identification is expected on the opening turn. */
export const namesBank = (text: string): boolean => /emirates nbd/i.test(text);

/**
 * Does this turn state the purpose of the contact?
 *
 * This cannot be read off the opening turn. Identity-before-disclosure means the
 * opening turn may not name the debt at all — the post-generation gate blocks a
 * reply that does. So the two halves of the disclosure obligation land on
 * different turns and have to be latched across the session rather than
 * evaluated on one.
 */
export const statesPurpose = (text: string): boolean =>
  /(outstanding|overdue|past due|payment|amount due|collect)/i.test(text);

function buildPipeline(session: Session): PipelineStep[] {
  // A contact that was refused or suppressed jumps straight to `close`, and
  // marking everything before it done would tick off steps that never ran —
  // claiming the holder was confirmed and the outcome logged on a call that was
  // never placed. Nothing was conducted, so nothing is complete.
  const neverPlaced = !contactPermitted(session.contactHour) || session.suppressed;
  if (neverPlaced) {
    return PIPELINE.map((step) => ({
      ...step,
      status: step.key === 'close' ? 'active' : 'pending',
    }));
  }

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

  const permitted = contactPermitted(session.contactHour);
  const hourLabel = String(session.contactHour).padStart(2, '0') + ':00';
  const persona = personaById(session.personaId);

  // Identity before disclosure is the breach that happens on the first turn,
  // before anything else can. `flag` here is a real BREACH, not a warning.
  const identityDetail =
    blockedRule === 'premature_disclosure'
      ? 'BREACH CAUGHT — the agent disclosed account detail before the holder was confirmed. The reply was suppressed before the customer saw it.'
      : session.thirdParty
        ? 'Third party detected — contact ended without disclosing any account detail.'
        : session.identityConfirmed
          ? 'Account holder confirmed. Only then were product, balance and arrears discussed.'
          : 'The agent may not name a product, balance or arrears until the person confirms they are the account holder.';

  return [
    {
      id: 'identity_before_disclosure',
      status:
        blockedRule === 'premature_disclosure'
          ? 'flag'
          : session.thirdParty
            ? 'info'
            : session.identityConfirmed
              ? 'pass'
              : 'pending',
      title: 'Identity confirmed before disclosure',
      detail: identityDetail,
    },
    {
      id: 'ai_disclosure',
      status: session.aiDisclosed === null ? 'pending' : session.aiDisclosed ? 'pass' : 'flag',
      title: 'AI disclosure',
      detail:
        'CBUAE AI Guidance Note (Feb 2026) — the agent must name itself as an AI assistant of Emirates NBD at first contact, in Arabic and English.',
    },
    {
      id: 'contact_window',
      status: permitted ? 'pass' : 'flag',
      title: `Contact window ${contactWindowLabel()}`,
      detail: permitted
        ? `Requested time ${hourLabel} is inside the permitted window. Checked before placement, not after.`
        : `Requested time ${hourLabel} is OUTSIDE the window. The contact is refused before placement — the agent is never asked and cannot override it.`,
    },
    {
      id: 'contact_clock_30',
      status: persona && persona.dpd <= 30 ? 'pass' : 'info',
      title: '30-day contact clock',
      detail: persona
        ? `Account is at ${persona.dpd} DPD. CBUAE requires contact within 30 days of arrears; the clock runs in DCORE.`
        : 'Runs in DCORE from day 1 of arrears.',
    },
    {
      id: 'written_notice_60',
      status: 'pending',
      title: '60-day written notice',
      detail:
        'Notice with amounts and consequences generated from DCORE data at day 60, sent and logged automatically.',
    },
    {
      id: 'disclosure',
      status: disclosed === null ? 'pending' : disclosed ? 'pass' : 'flag',
      title: 'Identification & purpose disclosure',
      detail:
        disclosed === null
          ? 'Emirates NBD is named at first contact; the purpose of the call follows once the holder is confirmed, not before.'
          : disclosed
            ? 'Detected — the agent identified Emirates NBD and stated the purpose of contact.'
            : 'The holder was confirmed but the purpose of the call was not stated. In production this would fail QA.',
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
      id: 'third_party',
      status: blocked('legal_threat', 'third_party_contact', 'bureau_promise', 'narration')
        ? 'flag'
        : 'pass',
      title: 'No third-party contact, no legal threat',
      detail: blocked('legal_threat')
        ? 'A reply referred to legal or criminal consequences. It was suppressed before the customer saw it.'
        : blocked('third_party_contact')
          ? 'A reply referred to contacting an employer, sponsor, family member or reference. It was suppressed before the customer saw it.'
          : blocked('bureau_promise')
            ? 'A reply appeared to promise a change to the customer’s Al Etihad Credit Bureau record. It was suppressed before the customer saw it.'
            : blocked('narration')
              ? 'A reply narrated the agent’s own actions or named an internal function. It was suppressed before the customer saw it.'
              : 'Employer, family and reference contact are unavailable as tools, and every reply is scanned for legal threats, third-party contact, credit-bureau promises and self-narration before it is sent.',
    },
  ];
}

/**
 * Flattens the Remediation Agent's case file for the officer panel.
 *
 * Returned in session state only so the demo can show that the work continued
 * after the conversation stopped. These terms were never available to the
 * negotiation agent and never spoken aloud.
 */
function buildOfficerPack(session: Session): OfficerPack | null {
  const pack = session.officerPack;
  if (!pack) return null;
  const options = pack.prepared_options as Record<string, Record<string, number>>;
  const eosb = session.eosb as Record<string, number> | null;
  return {
    caseId: String(pack.case_id),
    status: 'Awaiting officer approval',
    extendedPlanMonths: options.plan_12_month.months,
    extendedPlanMonthlyAed: options.plan_12_month.monthly_aed,
    arrearsWaiverPct: options.pay_in_full.arrears_waiver_pct,
    settlementFloorAed: options.settlement.floor_aed,
    eosbEstimateAed: eosb ? eosb.eosb_estimate_aed : null,
    netAfterOffsetAed: eosb ? eosb.net_exposure_after_offset_aed : null,
  };
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
    suppressed: session.suppressed && !session.overrodeSuppression,
    contactRefused: !contactPermitted(session.contactHour),
    contactHour: session.contactHour,
    contactWindow: contactWindowLabel(),
    identityConfirmed: session.identityConfirmed,
    thirdParty: session.thirdParty,
    aiDisclosed: session.aiDisclosed,
    officerPack: buildOfficerPack(session),
  };
}

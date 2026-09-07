import type { EscalationCategory } from '../src/shared/api';
import type { Persona } from '../src/shared/personas';

const CATEGORIES: EscalationCategory[] = [
  'hardship',
  'dispute',
  'legal_representation',
  'stop_contact_request',
  'other',
];

/** Narrows a model-supplied reason; anything unrecognised becomes `other`. */
export const asCategory = (value: unknown): EscalationCategory =>
  CATEGORIES.includes(value as EscalationCategory) ? (value as EscalationCategory) : 'other';

/**
 * The agent's entire callable surface. Narrow, typed functions: the model never
 * sees a card number, never writes SQL, and never invents an offer.
 *
 * Shared verbatim between the server (which runs the real agentic loop) and the
 * browser (which runs the offline fallback), so the tool trace on screen means
 * the same thing in both modes.
 */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'get_account_status',
    description:
      "Look up this customer's ENBD account: product, outstanding balance in AED, days past due, bucket, salary transfer status, and prior promise-to-pay history.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_segment_scores',
    description:
      'Retrieve the risk model outputs for this account: probability of default band, self-cure propensity, and assigned collections cluster. You consume these; you never estimate them yourself.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_offer_matrix',
    description:
      "Return the pre-approved Debt Assist options for this account's cluster. You may ONLY offer terms this returns. You must never invent, improve, extend or round a term. This tool has no hardship variant by design: hardship is not a better offer, it is a hard stop — if the customer indicates hardship you must call escalate_to_human instead of this tool.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'log_promise_to_pay',
    description:
      'Record a promise-to-pay the customer has verbally committed to, into the collections system of record.',
    input_schema: {
      type: 'object',
      properties: {
        amount_aed: { type: 'number' },
        date: { type: 'string', description: 'date committed to, plain text' },
      },
      required: ['amount_aed', 'date'],
    },
  },
  {
    name: 'initiate_payment',
    description:
      'Take an immediate payment through the PCI-scoped gateway. Call only after the customer explicitly agrees to pay now. You never see card or IBAN details — the gateway is tokenised.',
    input_schema: {
      type: 'object',
      properties: { amount_aed: { type: 'number' } },
      required: ['amount_aed'],
    },
  },
  {
    name: 'issue_letter',
    description:
      'Request a liability, no-liability or clearance letter. CBUAE mandates issuance within seven working days.',
    input_schema: {
      type: 'object',
      properties: { type: { type: 'string', enum: ['liability', 'no_liability', 'clearance'] } },
      required: ['type'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Immediately stop autonomous handling and transfer to a human Financial Remediation officer. You MUST call this the moment the customer indicates financial hardship or job loss, disputes the debt, mentions a lawyer or legal representation, or asks not to be contacted again. After calling it, give one short handoff line and stop.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['hardship', 'dispute', 'legal_representation', 'stop_contact_request', 'other'],
        },
      },
      required: ['reason'],
    },
  },
];

/**
 * Functions the orchestrator runs on its own account, never offered to the
 * conversational agent.
 *
 * `suppress_contact` and `check_contact_eligibility` are decisions taken before
 * a conversation exists. `open_hardship_case` and `calculate_eosb_offset` are
 * the Remediation Agent's work, which begins only once the conversation has
 * stopped — putting them in the agent's tool list would make the enhanced terms
 * reachable from a live call, which is exactly what must not happen.
 */
export const ORCHESTRATOR_TOOLS = [
  'suppress_contact',
  'check_contact_eligibility',
  'open_hardship_case',
  'calculate_eosb_offset',
] as const;

/**
 * A executed tool call, carrying both the raw values for the audit trace and
 * the truncated strings the on-screen trace panel renders.
 */
export interface ToolCall {
  name: string;
  /** Truncated for display. */
  inp: string;
  /** Truncated for display. */
  out: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  /** Set on escalate_to_human. */
  reason?: EscalationCategory;
}

/**
 * The CBUAE permitted contact window. Checked before a call is placed, not
 * after — the agent has no way to override it because it never gets asked.
 */
export const CONTACT_WINDOW = { openHour: 9, closeHour: 20, timezone: 'Asia/Dubai' } as const;

const pad = (h: number): string => String(h).padStart(2, '0');

export const contactPermitted = (hour: number): boolean =>
  hour >= CONTACT_WINDOW.openHour && hour < CONTACT_WINDOW.closeHour;

export const contactWindowLabel = (): string =>
  `${pad(CONTACT_WINDOW.openHour)}:00–${pad(CONTACT_WINDOW.closeHour)}:00`;

const bucketFor = (dpd: number): string =>
  dpd <= 30 ? 'Bucket 1' : dpd <= 60 ? 'Bucket 2' : dpd <= 90 ? 'Bucket 3' : 'Bucket 4';

/**
 * Executes one tool against the simulated ENBD estate.
 *
 * Account data, payment processing and letter issuance are simulated — in
 * production these are the tool-calling adapters into Finacle, the collections
 * system of record, the PCI gateway and document services.
 */
export function runTool(
  persona: Persona,
  name: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  switch (name) {
    case 'get_account_status':
      return {
        account: persona.acct,
        name: persona.name,
        product: persona.product,
        outstanding_aed: persona.balance,
        days_past_due: persona.dpd,
        bucket: bucketFor(persona.dpd),
        salary_transfer: persona.salary,
        prior_broken_ptp: persona.priorPTP,
      };

    case 'get_segment_scores':
      return {
        cluster: persona.cluster,
        self_cure_propensity: persona.selfcure,
        pd_band: persona.pd,
      };

    case 'get_offer_matrix': {
      // Deliberately has no hardship variant. Enhanced terms exist, but they are
      // prepared for an approving officer after handover — never reachable from
      // a live conversation. A more generous offer is not the response to
      // hardship; stopping is.
      const b = persona.balance;
      return {
        pay_in_full: { amount_aed: b, arrears_waiver_pct: 5 },
        plan_3_month: { months: 3, monthly_aed: Math.round(b / 3) },
        plan_6_month: { months: 6, monthly_aed: Math.round(b / 6) },
        settlement: {
          min_acceptable_aed: Math.round(b * 0.85),
          requires_approval: 'collections_manager',
        },
        note: 'No hardship variant exists in this matrix. Hardship routes to a person, not to a larger waiver.',
      };
    }

    case 'log_promise_to_pay':
      return {
        status: 'logged',
        amount_aed: input.amount_aed,
        date: input.date,
        monitoring: 'broken_promise_escalation_armed',
      };

    case 'initiate_payment':
      return {
        status: 'success',
        amount_aed: input.amount_aed,
        reference: 'PMT-' + Math.floor(100000 + Math.random() * 899999),
      };

    case 'issue_letter':
      return { status: 'queued', type: input.type, sla_working_days: 7 };

    case 'escalate_to_human':
      return { status: 'transferred', queue: 'FR_officer_priority', reason: input.reason };

    /* ---- orchestrator-only, never in the agent's tool list ---- */

    case 'suppress_contact':
      return {
        decision: 'no_contact',
        channel_allowed: 'reminder_and_payment_link_only',
        reason: input.reason,
      };

    case 'check_contact_eligibility': {
      const hour = Number(input.hour);
      const permitted = hour >= CONTACT_WINDOW.openHour && hour < CONTACT_WINDOW.closeHour;
      return {
        permitted,
        requested_hour: hour,
        window: `${pad(CONTACT_WINDOW.openHour)}:00-${pad(CONTACT_WINDOW.closeHour)}:00 ${CONTACT_WINDOW.timezone}`,
        action: permitted ? 'proceed' : 'REFUSED_BEFORE_PLACEMENT',
      };
    }

    case 'open_hardship_case': {
      const b = persona.balance;
      return {
        case_id: 'DA-' + Math.floor(10000 + Math.random() * 89999),
        status: 'prepared_for_officer_approval',
        prepared_options: {
          pay_in_full: { amount_aed: b, arrears_waiver_pct: 15 },
          plan_12_month: { months: 12, monthly_aed: Math.round(((b / 12) * 0.9)) },
          settlement: { floor_aed: Math.round(b * 0.72) },
        },
        visibility: 'OFFICER ONLY — not disclosed to the customer by any agent',
      };
    }

    case 'calculate_eosb_offset': {
      const eosb = Math.round(persona.balance * 0.34);
      return {
        eosb_estimate_aed: eosb,
        salary_transfer: persona.salary,
        net_exposure_after_offset_aed: persona.balance - eosb,
        status: 'attached_to_case_file',
      };
    }

    default:
      return { status: 'unknown_tool' };
  }
}

const truncate = (s: string, n = 150): string => (s.length > n ? s.slice(0, n) + '…' : s);

/** Runs a tool and formats it as a trace entry in one step. */
export function traceTool(
  persona: Persona,
  name: string,
  input: Record<string, unknown>,
): { result: Record<string, unknown>; call: ToolCall } {
  const safeInput = input ?? {};
  const result = runTool(persona, name, safeInput);
  const call: ToolCall = {
    name,
    inp: truncate(JSON.stringify(safeInput)),
    out: truncate(JSON.stringify(result)),
    input: safeInput,
    output: result,
  };
  if (name === 'escalate_to_human') call.reason = asCategory(safeInput.reason);
  return { result, call };
}

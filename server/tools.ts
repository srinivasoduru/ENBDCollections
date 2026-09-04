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
      "Return the pre-approved payment plan, tenor extension, arrears waiver and settlement options available for this account's cluster. You may ONLY offer terms this returns. You must never invent, improve, or round a term.",
    input_schema: {
      type: 'object',
      properties: { hardship_indicated: { type: 'boolean' } },
      required: ['hardship_indicated'],
    },
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
      const hardship = Boolean(input.hardship_indicated);
      const b = persona.balance;
      return {
        pay_in_full: { amount_aed: b, arrears_waiver_pct: hardship ? 15 : 5 },
        plan_3_month: { months: 3, monthly_aed: Math.round(b / 3) },
        plan_6_month: { months: 6, monthly_aed: Math.round(b / 6) },
        plan_12_month: hardship ? { months: 12, monthly_aed: Math.round(b / 12) } : null,
        settlement: {
          min_acceptable_aed: Math.round(b * (hardship ? 0.72 : 0.85)),
          requires_approval: 'collections_manager',
        },
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

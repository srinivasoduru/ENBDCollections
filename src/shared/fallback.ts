import type { Persona } from './personas';
import { traceTool, type ToolCall } from './tools';

/**
 * Offline fallback for the Live Agent view.
 *
 * The pitch may be given without connectivity, and a dead tab in front of a
 * risk committee is worse than a scripted one. This runs entirely in the
 * browser, drives the same tool functions as the live path — so the pipeline,
 * compliance panel and tool trace all still move — and the UI labels the
 * session OFFLINE SCRIPT so nobody is misled about what they are watching.
 *
 * It is keyword-aware rather than purely linear: a hardship, dispute, legal or
 * stop-contact signal escalates from any point in any persona's flow, which is
 * the behaviour the view exists to demonstrate.
 */

interface ScriptStep {
  /** Tools to call, in order, before speaking. */
  tools?: { name: string; input: Record<string, unknown> }[];
  text: (p: Persona) => string;
}

const aed = (n: number): string => n.toLocaleString('en-US');

const ESCALATION_TRIGGERS: { reason: string; test: RegExp }[] = [
  {
    reason: 'hardship',
    test: /\b(lost my job|let me go|laid off|no income|redundan\w*|terminated|unemploy\w*|hardship|can'?t afford|cannot afford|salary stopped|no salary|out of work)\b/i,
  },
  {
    reason: 'dispute',
    test: /\b(not mine|aren'?t mine|isn'?t mine|never made|didn'?t make|did not make|dispute\w*|cancelled|canceled|fraud\w*|investigat\w*|wrong charge\w*)\b/i,
  },
  { reason: 'legal_representation', test: /\b(lawyer|solicitor|advocate|legal counsel|my legal|take you to court)\b/i },
  {
    reason: 'stop_contact_request',
    test: /\b(stop contacting|stop calling|don'?t contact|do not contact|leave me alone|remove my number)\b/i,
  },
];

const detectEscalation = (text: string): string | null =>
  ESCALATION_TRIGGERS.find((t) => t.test.test(text))?.reason ?? null;

const ESCALATION_LINE: Record<string, string> = {
  hardship:
    "Thank you for telling me — I'm stopping here and passing you to a Financial Remediation officer who can look at hardship support properly.",
  dispute:
    "Understood — I won't discuss payment while the charges are disputed. I'm transferring you to a Financial Remediation officer to raise the investigation.",
  legal_representation:
    "Understood. As you have legal representation I'm ending the automated call and transferring you to a Financial Remediation officer.",
  stop_contact_request:
    "That's noted. I'm passing your request to a Financial Remediation officer and ending this call now.",
  other: "I'm transferring you to a Financial Remediation officer who will take this from here.",
};

/** The linear happy path per persona, used until a trigger fires. */
const FLOWS: Record<string, ScriptStep[]> = {
  early: [
    {
      tools: [{ name: 'get_account_status', input: {} }],
      text: (p) =>
        `Good afternoon, this is Emirates NBD calling about your ${p.product} account regarding an outstanding amount. Our records show AED ${aed(p.balance)} is ${p.dpd} days past due. Is now a convenient time?`,
    },
    {
      tools: [{ name: 'get_segment_scores', input: {} }],
      text: () =>
        'Thank you — that happens. Your account history with us is strong, so this is a straightforward one to clear. Would you like to settle it today?',
    },
    {
      tools: [{ name: 'get_offer_matrix', input: { hardship_indicated: false } }],
      text: (p) =>
        `I can take the full AED ${aed(p.balance)} now, or set up three instalments of AED ${aed(Math.round(p.balance / 3))}. Which suits you better?`,
    },
    {
      tools: [{ name: 'initiate_payment', input: {} }],
      text: (p) =>
        `That's gone through — AED ${aed(p.balance)} received and the account is clear. You'll get a confirmation by SMS shortly. Thank you for your time.`,
    },
  ],
  hardship: [
    {
      tools: [{ name: 'get_account_status', input: {} }],
      text: (p) =>
        `Good afternoon, this is Emirates NBD calling regarding the collection of an outstanding amount on your ${p.product}. The balance is AED ${aed(p.balance)}, currently ${p.dpd} days past due. May I ask what's happened with the payments?`,
    },
  ],
  dispute: [
    {
      tools: [{ name: 'get_account_status', input: {} }],
      text: (p) =>
        `Good afternoon, this is Emirates NBD calling about an outstanding amount on your ${p.product}. Our records show AED ${aed(p.balance)} outstanding at ${p.dpd} days past due. Can we talk about clearing it?`,
    },
  ],
  negotiate: [
    {
      tools: [{ name: 'get_account_status', input: {} }],
      text: (p) =>
        `Good afternoon, this is Emirates NBD calling regarding the collection of the outstanding amount on your ${p.product}. AED ${aed(p.balance)} is ${p.dpd} days past due, and I can see ${p.priorPTP} previous arrangements that weren't kept. What can we do about it today?`,
    },
    {
      tools: [{ name: 'get_segment_scores', input: {} }],
      text: () =>
        "I'd rather set up something you can actually hold to than take another one-off promise. Can you tell me what you can manage each month?",
    },
    {
      tools: [{ name: 'get_offer_matrix', input: { hardship_indicated: false } }],
      text: (p) =>
        `From the approved options for your account I can do six months at AED ${aed(Math.round(p.balance / 6))}, or three at AED ${aed(Math.round(p.balance / 3))}. I can't go outside those.`,
    },
    {
      tools: [{ name: 'log_promise_to_pay', input: {} }],
      text: () =>
        "That's logged against the account. The first instalment is due on the date we agreed — if it's missed the arrangement breaks and the account moves on. Thank you.",
    },
  ],
};

const CLOSED_LINE =
  "I've covered everything I can on this call. A Financial Remediation officer can pick up anything further.";

export interface OfflineTurn {
  reply: string;
  toolCalls: ToolCall[];
  /** Cursor into the persona's flow for the next turn. */
  step: number;
  escalated: boolean;
}

/**
 * Produces one agent turn offline.
 *
 * `step` is the caller's cursor: pass 0 for the opening turn, then feed back
 * the `step` returned by the previous call.
 */
export function offlineTurn(persona: Persona, step: number, say: string | null): OfflineTurn {
  const toolCalls: ToolCall[] = [];

  const reason = say ? detectEscalation(say) : null;
  if (reason) {
    const { call } = traceTool(persona, 'escalate_to_human', { reason });
    toolCalls.push(call);
    return {
      reply: ESCALATION_LINE[reason] ?? ESCALATION_LINE.other,
      toolCalls,
      step,
      escalated: true,
    };
  }

  const flow = FLOWS[persona.id] ?? FLOWS.early;
  const current = flow[step];
  if (!current) return { reply: CLOSED_LINE, toolCalls, step, escalated: false };

  for (const t of current.tools ?? []) {
    // Amounts are resolved here rather than in the script so they always agree
    // with the persona's balance.
    const input =
      t.name === 'initiate_payment'
        ? { amount_aed: persona.balance }
        : t.name === 'log_promise_to_pay'
          ? { amount_aed: Math.round(persona.balance / 6), date: 'the 5th of next month' }
          : t.input;
    toolCalls.push(traceTool(persona, t.name, input).call);
  }

  return { reply: current.text(persona), toolCalls, step: step + 1, escalated: false };
}

import { firstName, type Persona } from '../src/shared/personas';
import { looksLikeConfirmation, looksLikeThirdParty } from './compliance/identity';
import { traceTool, type ToolCall } from './tools';

/**
 * Deterministic fallback for the Live Agent view.
 *
 * The pitch may be given without connectivity, and a dead tab in front of a
 * risk committee is worse than a scripted one. This runs server-side, drives
 * the same tool handlers as the live path — so the pipeline, compliance panel
 * and tool trace all still move — and the session reports OFFLINE SCRIPT so
 * nobody is misled about what they are watching.
 *
 * It follows the same conduct rules the model is held to: identity before
 * disclosure, no hardship variant of the offer matrix, and a hard stop rather
 * than a better offer when hardship appears.
 */

const aed = (n: number): string => n.toLocaleString('en-US');

/** Signals that route to a person rather than to a negotiation. */
const TRIGGERS: { reason: string; test: RegExp }[] = [
  {
    reason: 'hardship',
    test: /\b(lost my job|let me go|laid off|made redundant|redundan\w*|terminated|no income|unemploy\w*|hardship|can'?t afford|cannot afford|cannot pay|can'?t pay|salary stopped|no salary|out of work|struggling|situation has changed|between roles)\b/i,
  },
  {
    reason: 'dispute',
    test: /\b(not mine|aren'?t mine|isn'?t mine|never made|didn'?t make|did not make|dispute\w*|already paid|i paid|cancelled|canceled|fraud\w*|investigat\w*|wrong amount|don'?t recognise|don'?t recognize)\b/i,
  },
  { reason: 'legal_representation', test: /\b(lawyer|solicitor|advocate|attorney|legal counsel|my legal|take you to court)\b/i },
  {
    reason: 'stop_contact_request',
    test: /\b(stop contacting|stop calling|don'?t contact|do not call|leave me alone|remove my number|take me off)\b/i,
  },
];

const detectTrigger = (text: string): string | null =>
  TRIGGERS.find((t) => t.test.test(text))?.reason ?? null;

const HANDOFF_LINE: Record<string, string> = {
  hardship:
    "Thank you for telling me. Because of what you've described, I'm going to pass you to a colleague in our Financial Remediation team who can properly discuss the options available to you.",
  dispute:
    "Understood — since you're disputing the amount, I'm not going to discuss payment any further. I'm transferring you to a colleague who can raise this formally and look into it properly.",
  legal_representation:
    "Thank you for letting me know. As you have legal representation, I'll stop here and pass this to a colleague who will handle it appropriately.",
  stop_contact_request:
    "Noted, and I'm sorry to have troubled you. I'm passing this to a colleague to action your request properly.",
  other: "I'm passing you to a colleague in our Financial Remediation team who will take this from here.",
};

const INTENT = {
  payNow: /\b(pay (it |this )?(now|today)|pay in full|clear it now|settle (it )?now|can i pay|auto-?pay)\b/i,
  plan: /\b(plan|instal?ment|instal?ments|monthly|restructur\w*|spread|split|half|part payment|reschedul\w*|few months)\b/i,
  balance: /\b(balance|how much|what do i owe|outstanding|amount|late fee|charged)\b/i,
};

export interface ScriptedTurn {
  reply: string;
  toolCalls: ToolCall[];
  /** Cursor into the flow for the next turn. Unused now the script is stateful. */
  step: number;
  escalated: boolean;
}

export interface ScriptState {
  identityConfirmed: boolean;
  thirdParty: boolean;
}

/**
 * Produces one agent turn offline.
 *
 * `say` is null for the opening turn, which — like the model's — may not name a
 * product, a balance or arrears, because nobody has confirmed who answered.
 */
export function scriptedTurn(
  persona: Persona,
  step: number,
  say: string | null,
  state: ScriptState = { identityConfirmed: false, thirdParty: false },
): ScriptedTurn {
  const toolCalls: ToolCall[] = [];
  const first = firstName(persona);
  const call = (name: string, input: Record<string, unknown> = {}): Record<string, unknown> => {
    const { result, call: entry } = traceTool(persona, name, input);
    toolCalls.push(entry);
    return result;
  };

  // Opening turn: AI disclosure and an identity question, nothing else.
  if (say === null) {
    return {
      reply: `Good afternoon, I am an AI assistant of Emirates NBD. Before I say anything further, may I confirm — am I speaking with ${first}?`,
      toolCalls,
      step: step + 1,
      escalated: false,
    };
  }

  // Identity gate. Third party is checked first: "no, this is his brother"
  // contains tokens that look like confirmation.
  if (!state.identityConfirmed) {
    if (looksLikeThirdParty(say)) {
      return {
        reply:
          'I understand, thank you. I am not able to discuss this account with anyone other than the account holder, so I will end the call here. Apologies for the interruption.',
        toolCalls,
        step,
        escalated: false,
      };
    }
    if (!looksLikeConfirmation(say, first)) {
      return {
        reply: `Apologies — I do need to confirm I am speaking with ${first} before I can discuss the account. Am I speaking with them?`,
        toolCalls,
        step,
        escalated: false,
      };
    }
    // Confirmed: only now may the purpose of the call be stated.
    call('get_account_status');
    return {
      reply: `Thank you. I am calling because there is an outstanding amount of AED ${aed(persona.balance)} on your ${persona.product}, now ${persona.dpd} days past due. Can we look at how you would like to resolve it?`,
      toolCalls,
      step: step + 1,
      escalated: false,
    };
  }

  // Hardship, dispute, legal and stop-contact all route to a person. Note that
  // no offer matrix is pulled on this path — stopping is the response.
  const trigger = detectTrigger(say);
  if (trigger) {
    call('escalate_to_human', { reason: trigger });
    return {
      reply: HANDOFF_LINE[trigger] ?? HANDOFF_LINE.other,
      toolCalls,
      step,
      escalated: true,
    };
  }

  if (INTENT.payNow.test(say)) {
    call('get_offer_matrix');
    call('initiate_payment', { amount_aed: persona.balance });
    return {
      reply: `That's taken care of — AED ${aed(persona.balance)} has been processed and the account is now clear. You'll get a written confirmation shortly.`,
      toolCalls,
      step: step + 1,
      escalated: false,
    };
  }

  if (INTENT.plan.test(say)) {
    const matrix = call('get_offer_matrix') as Record<string, { monthly_aed: number }>;
    return {
      reply: `I can set that up. Under Debt Assist I am able to offer six months at AED ${aed(matrix.plan_6_month.monthly_aed)} a month, or three months at AED ${aed(matrix.plan_3_month.monthly_aed)}. Which of those works better for you?`,
      toolCalls,
      step: step + 1,
      escalated: false,
    };
  }

  if (INTENT.balance.test(say)) {
    return {
      reply: `The current outstanding is AED ${aed(persona.balance)}, and the account is ${persona.dpd} days past due. Would you like to clear it today, or would a payment plan suit you better?`,
      toolCalls,
      step: step + 1,
      escalated: false,
    };
  }

  return {
    reply: `I understand. The outstanding balance is AED ${aed(persona.balance)} and the account is ${persona.dpd} days past due. Can we look at how you'd like to resolve it — settling in full, or a payment plan?`,
    toolCalls,
    step: step + 1,
    escalated: false,
  };
}

/**
 * Right-party verification.
 *
 * The agent does not know who picked up. CBUAE prohibits disclosing account
 * details to anyone but the customer, so until the person confirms they are the
 * account holder the agent may not name a product, a balance or arrears —
 * and if a third party answers, the contact ends without disclosing anything.
 *
 * This is the most-cited conduct failure in collections and the one the tool
 * surface alone cannot prevent: nothing stops a model from reading a balance
 * aloud. It has to be checked in the text.
 */

/**
 * Signals that whoever answered is not the account holder.
 *
 * Checked before the affirmative pattern, because "no, this is his brother"
 * contains tokens that look like confirmation.
 */
const THIRD_PARTY =
  /\b(no|not him|not her|wrong (number|person)|isn'?t here|is not here|not available|away|brother|sister|husband|wife|father|mother|son|daughter|friend|colleague|nobody|who is this|speaking on behalf)\b/i;

/** Signals that the person has confirmed they are the account holder. */
const AFFIRMATIVE =
  /^(\s*(yes|yeah|yep|yup|speaking|correct|that is right|thats right)\b|.{0,14}\b(that'?s me|it'?s me|this is he|this is she|i am he|i am she|you are|you're speaking to)\b)/i;

/** Account specifics the agent must not utter before identity is confirmed. */
const ACCOUNT_DETAIL =
  /\b(outstanding|overdue|past due|arrears|balance|amount due|instal?ment|repayment|debt|credit card|personal loan|skywards|platinum|aed\s*[\d٠-٩])/i;

/** The mandatory AI self-identification. */
const AI_DISCLOSURE =
  /\b(ai|a\.i\.|artificial intelligence|automated|virtual|digital)\s+(assistant|agent)\b|assistant of emirates nbd/i;

export const looksLikeThirdParty = (text: string): boolean => THIRD_PARTY.test(text);

export function looksLikeConfirmation(text: string, first: string): boolean {
  if (AFFIRMATIVE.test(text)) return true;
  // "I'm Maya" / "this is Maya"
  return new RegExp(String.raw`\b(i am|i'?m|this is)\s+${escapeRegExp(first)}\b`, 'i').test(text);
}

export const mentionsAccountDetail = (text: string): boolean => ACCOUNT_DETAIL.test(text);

export const disclosesAi = (text: string): boolean => AI_DISCLOSURE.test(text);

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface IdentityRead {
  confirmed: boolean;
  thirdParty: boolean;
}

/**
 * Reads one customer turn for identity signals. Third party wins over
 * affirmative — a wrong-person answer must never be read as confirmation.
 */
export function readIdentity(text: string, first: string): IdentityRead {
  if (looksLikeThirdParty(text)) return { confirmed: false, thirdParty: true };
  return { confirmed: looksLikeConfirmation(text, first), thirdParty: false };
}

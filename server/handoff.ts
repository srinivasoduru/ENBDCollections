import type { EscalationCategory } from '../src/shared/api';

/**
 * Fixed handoff strings, never model-generated.
 *
 * These must not negotiate, restate the balance, ask a follow-up question, or
 * apologise excessively.
 *
 * English only for now. The Arabic set lands with the compliance gates, at
 * which point these become the canned responses the pre-flight gate returns
 * without invoking the model at all. Today they serve the locked session.
 */
export const HANDOFF: Record<EscalationCategory, string> = {
  hardship:
    "Thank you for telling me. Because of what you've described, I'm going to pass you to a colleague in our Financial Remediation team who can properly discuss the options available to you. They'll have everything we've talked about, so you won't need to repeat yourself.",
  dispute:
    "Thank you for raising that. I'm passing you to a colleague in our Financial Remediation team who can look into the charges properly. They'll have everything we've talked about, so you won't need to repeat yourself.",
  legal_representation:
    "Understood. I'm passing you to a colleague in our Financial Remediation team, who will handle this from here. They'll have everything we've talked about.",
  stop_contact_request:
    "That's noted. I'm passing your request to a colleague in our Financial Remediation team, who will take it from here.",
  other:
    "I'm passing you to a colleague in our Financial Remediation team who will take this from here. They'll have everything we've talked about, so you won't need to repeat yourself.",
};

/** What a locked session replies with on any further turn. */
export const LOCKED_REPLY =
  'This conversation has been passed to a colleague in our Financial Remediation team. They will be in touch, and they already have everything we discussed.';

/** What a session whose contact was refused replies with, if anything asks. */
export const REFUSED_REPLY =
  'No contact was placed on this account. The requested time falls outside the hours Emirates NBD is permitted to make collections contact.';

export const handoffFor = (category: EscalationCategory | null): string =>
  HANDOFF[category ?? 'other'];

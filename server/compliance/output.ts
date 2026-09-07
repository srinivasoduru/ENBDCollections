import type { OutputRule } from '../../src/shared/api';
import { mentionsAccountDetail } from './identity';
import { extractAmounts, hasSpelledAmount, normaliseDigits } from './money';

/**
 * The post-generation gate.
 *
 * Scans what the agent is about to say, before it reaches the customer. On a
 * hit the reply is suppressed — never shown — the session escalates, and the
 * customer gets the fixed handoff line instead.
 *
 * The pre-flight gate screens what the customer says; this screens what the
 * bank says back, which is where the conduct breach would actually occur.
 */

export const OUTPUT_RULES_VERSION = '2026-09-07.1';

export type { OutputRule } from '../../src/shared/api';

export type OutputVerdict =
  | { blocked: false; latencyMs: number }
  | {
      blocked: true;
      rule: OutputRule;
      /** Legible to an auditor without reading the regex. */
      detail: string;
      /** The offending fragment or figure, for the trace. */
      evidence: string;
      latencyMs: number;
    };

/**
 * Amounts the agent is permitted to state, gathered from the session:
 * the terms the offer matrix actually served, the account balance, and any
 * figure the customer themselves proposed (the agent must be able to repeat a
 * customer's number back in order to decline it).
 */
export interface AllowedAmounts {
  served: Set<number>;
  balance: number;
  customerProposed: Set<number>;
}

export interface OutputContext extends AllowedAmounts {
  /**
   * False until the person has confirmed they are the account holder. While
   * false, the reply may not contain account specifics at all.
   */
  identityConfirmed: boolean;
  /** Tool names, so a reply that says one aloud can be caught. */
  toolNames: string[];
}

/** Rounding slack: a matrix value of 1083.33 may be spoken as 1,083. */
const ROUNDING_TOLERANCE = 1;

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/* ------------------------------------------------------------ rule 1 --- */

const LEGAL_THREAT =
  /\b(court|courts|police|prosecut\w*|jail|prison|imprison\w*|criminal (?:case|charge|proceeding|record)|travel ban|absconding|abscond|cheque case|bounced cheque|legal action|sue you|take you to)\b/i;

/* ------------------------------------------------------------ rule 2 --- */

const BUREAU =
  /\b(aecb|al etihad credit bureau|credit bureau|credit report|credit record|credit file|credit history|credit score|credit rating)\b/i;
const BUREAU_PROMISE =
  /\b(remove|removed|removing|delete|deleted|deleting|clear|cleared|clearing|erase|erased|wipe|wiped|fix|fixed|clean|cleaned|expunge|amend|reverse|restore|improve)\b/i;

/* ------------------------------------------------------------ rule 3 --- */

const CONTACT_VERB =
  /\b(contact|contacting|call|calling|inform|informing|notify|notifying|speak to|speaking to|reach out to|get in touch with|write to|approach|tell)\b/i;
// `reference` is excluded deliberately: "quote your reference number" is not a
// third-party contact, and the person sense is covered by the plural.
const THIRD_PARTY =
  /\b(employer|your company|your workplace|sponsor|your family|next of kin|guarantor|references|your spouse|your wife|your husband|your father|your mother|your brother|your sister|hr department|human resources|your manager|your colleagues?)\b/i;

/* ------------------------------------------------------------ rule 4 --- */

function isAllowed(amount: number, allowed: AllowedAmounts): boolean {
  const near = (candidate: number): boolean =>
    Math.abs(candidate - amount) <= ROUNDING_TOLERANCE;

  if (near(allowed.balance)) return true;
  for (const value of allowed.served) if (near(value)) return true;
  for (const value of allowed.customerProposed) if (near(value)) return true;
  return false;
}

const formatAed = (n: number): string => 'AED ' + n.toLocaleString('en-US');

/* ------------------------------------------------------------ rule 5 --- */

/**
 * The agent is speaking aloud on a phone call. Narrating its own tool use —
 * "one moment, let me pull up your account" — is not a compliance breach but it
 * destroys the illusion in front of a client, and naming a function or a system
 * is a genuine leak of internals to a customer.
 */
const NARRATION =
  /\b(let me (just )?(check|look|pull|see|retrieve|verify|confirm)|i'?ll (just )?(check|look|pull|retrieve)|i am going to (check|look|call|pull)|one moment|just a moment|bear with me|please hold|hold on|checking (the |your )?(system|record|account)|pulling up|looking that up|retrieving|querying|calling the (system|api|tool|function))\b/i;

/** A literal function call written into speech: `get_account_status(...)`. */
const FUNCTION_SYNTAX = /\b[a-z][a-z0-9]*_[a-z0-9_]+\s*\(/i;

/* ------------------------------------------------------------ rule 6 --- */

const ORCHESTRATION_NOUN = /\b(tool|function|api|endpoint|schema|database|system prompt)\b/i;

/* ------------------------------------------------------------- gate ---- */

export function screenOutput(rawReply: string, ctx: OutputContext): OutputVerdict {
  const startedAt = Date.now();
  const elapsed = (): number => Date.now() - startedAt;
  const reply = normaliseDigits(rawReply);
  const allowed: AllowedAmounts = ctx;

  // Rule 5 — identity before disclosure. Checked first because it is the one
  // breach that happens on the very first turn, before anything else can.
  if (!ctx.identityConfirmed) {
    if (mentionsAccountDetail(reply)) {
      return {
        blocked: true,
        rule: 'premature_disclosure',
        detail:
          'The reply disclosed account detail before the account holder was confirmed. CBUAE prohibits disclosing details to any person other than the customer, and the agent does not yet know who answered.',
        evidence: reply.slice(0, 160),
        latencyMs: elapsed(),
      };
    }
  }

  // Rule 6 — the agent narrating itself, or naming its own internals aloud.
  const spokenTool = ctx.toolNames.find((n) => reply.toLowerCase().includes(n.toLowerCase()));
  const narration = NARRATION.exec(reply);
  if (spokenTool || narration || FUNCTION_SYNTAX.test(reply) || ORCHESTRATION_NOUN.test(reply)) {
    return {
      blocked: true,
      rule: 'narration',
      detail:
        'The reply narrated the agent’s own actions or named an internal function or system. The customer is on a phone call and must hear only spoken words.',
      evidence: spokenTool ?? narration?.[0] ?? reply.slice(0, 120),
      latencyMs: elapsed(),
    };
  }

  const legal = LEGAL_THREAT.exec(reply);
  if (legal) {
    return {
      blocked: true,
      rule: 'legal_threat',
      detail:
        'The reply referred to legal or criminal consequences, which CBUAE conduct rules prohibit in collections contact.',
      evidence: legal[0],
      latencyMs: elapsed(),
    };
  }

  for (const sentence of splitSentences(reply)) {
    if (BUREAU.test(sentence) && BUREAU_PROMISE.test(sentence)) {
      return {
        blocked: true,
        rule: 'bureau_promise',
        detail:
          'The reply appeared to promise a change to the customer’s Al Etihad Credit Bureau record. The bank cannot offer that.',
        evidence: sentence.slice(0, 160),
        latencyMs: elapsed(),
      };
    }
    if (CONTACT_VERB.test(sentence) && THIRD_PARTY.test(sentence)) {
      return {
        blocked: true,
        rule: 'third_party_contact',
        detail:
          'The reply referred to contacting a third party — an employer, sponsor, family member or reference.',
        evidence: sentence.slice(0, 160),
        latencyMs: elapsed(),
      };
    }
  }

  if (hasSpelledAmount(reply)) {
    return {
      blocked: true,
      rule: 'off_matrix_offer',
      detail:
        'The reply stated an amount in words. Amounts must be given in digits so they can be checked against the served offer matrix.',
      evidence: reply.slice(0, 160),
      latencyMs: elapsed(),
    };
  }

  for (const amount of extractAmounts(reply)) {
    if (!isAllowed(amount, allowed)) {
      return {
        blocked: true,
        rule: 'off_matrix_offer',
        detail:
          `The reply stated ${formatAed(amount)}, which is not a term the offer matrix returned for this account, ` +
          'not the outstanding balance, and not a figure the customer proposed.',
        evidence: formatAed(amount),
        latencyMs: elapsed(),
      };
    }
  }

  return { blocked: false, latencyMs: elapsed() };
}

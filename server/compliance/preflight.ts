import type { EscalationCategory } from '../../src/shared/api';
import {
  CLASSIFIER_MODEL,
  CLASSIFIER_PROMPT_VERSION,
  CONFIDENCE_THRESHOLD,
  type Classifier,
} from './classifier';
import { PATTERNS_VERSION, matchPatterns } from './patterns';

/**
 * The pre-flight gate.
 *
 * Runs on every customer turn before the model is invoked. On a hit the caller
 * must lock the session and return a fixed handoff line — the model is never
 * asked to respond to that turn at all.
 *
 * Order is the security property, not an optimisation:
 *
 *   1. Deterministic patterns. If these fire, the gate escalates and the
 *      classifier is never consulted — so no instruction embedded in the
 *      customer's message can talk the classifier out of a pattern hit.
 *   2. Classifier, only if the patterns were silent. It can add escalations,
 *      never remove one.
 *   3. Any failure in step 2 escalates anyway. It is filed as `other` with
 *      via: 'system' — never as a customer signal the customer did not give.
 */

export type PreflightVia = 'pattern' | 'classifier' | 'system';

export type PreflightDecision =
  | { escalate: false; latencyMs: number; classifierRan: boolean; confidence?: number }
  | {
      escalate: true;
      category: EscalationCategory;
      via: PreflightVia;
      /** Why, in terms an auditor can follow: the pattern, or the failure. */
      detail: string;
      confidence?: number;
      latencyMs: number;
      classifierRan: boolean;
    };

/** Recorded on every gate decision so the audit shows what was in force. */
export const PREFLIGHT_VERSIONS = {
  patterns: PATTERNS_VERSION,
  classifierModel: CLASSIFIER_MODEL,
  classifierPrompt: CLASSIFIER_PROMPT_VERSION,
  confidenceThreshold: CONFIDENCE_THRESHOLD,
};

/**
 * `classify` may be null, meaning no classifier is configured on this server at
 * all — the offline demo, with no credentials.
 *
 * That is deliberately NOT the fail-closed case. Fail-closed exists to stop a
 * live model negotiating with a distressed customer; when there is no model
 * there is nothing to fail closed against, and escalating every turn would make
 * the offline demo unusable while proving nothing. The patterns still run, and
 * the trace records that screening was pattern-only so the difference is
 * visible in the audit rather than silent.
 */
export async function screen(
  text: string,
  classify: Classifier | null,
): Promise<PreflightDecision> {
  const startedAt = Date.now();
  const elapsed = (): number => Date.now() - startedAt;

  // 1 — deterministic. Not overridable by anything downstream.
  const hit = matchPatterns(text);
  if (hit) {
    return {
      escalate: true,
      category: hit.category,
      via: 'pattern',
      detail: `Matched ${hit.category} pattern: ${hit.matched}`,
      latencyMs: elapsed(),
      classifierRan: false,
    };
  }

  if (!classify) {
    return { escalate: false, latencyMs: elapsed(), classifierRan: false };
  }

  // 2 — paraphrase.
  let verdict;
  try {
    verdict = await classify(text);
  } catch (err) {
    // 3 — fail closed, but honestly. A timeout is not a hardship disclosure,
    // so it is never filed as one.
    const why = err instanceof Error ? err.message : 'Classifier failed.';
    return {
      escalate: true,
      category: 'other',
      via: 'system',
      detail: `Screening could not complete (${why}) — escalated on the fail-closed rule.`,
      latencyMs: elapsed(),
      classifierRan: true,
    };
  }

  if (verdict.escalate && verdict.confidence >= CONFIDENCE_THRESHOLD) {
    return {
      escalate: true,
      category: verdict.category ?? 'other',
      via: 'classifier',
      detail: `Classifier flagged ${verdict.category ?? 'other'} at confidence ${verdict.confidence.toFixed(2)}.`,
      confidence: verdict.confidence,
      latencyMs: elapsed(),
      classifierRan: true,
    };
  }

  return {
    escalate: false,
    latencyMs: elapsed(),
    classifierRan: true,
    confidence: verdict.confidence,
  };
}

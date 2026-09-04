import type { EscalationCategory } from '../../src/shared/api';

/**
 * The deterministic escalation patterns.
 *
 * This file is deliberately the whole list, in one place, so Legal can review
 * it as a single artifact. Nothing else in the codebase decides what counts as
 * a hardship, dispute, legal-representation or stop-contact signal.
 *
 * These catch the obvious phrasings. Paraphrase is the classifier's job
 * (see classifier.ts) — but a pattern hit here is not overridable by it.
 *
 * Version this string whenever the lists change: the audit trace records it, so
 * an examiner can tell which list was in force for a given conversation.
 */
export const PATTERNS_VERSION = '2026-09-04.1';

/**
 * Arabic needs normalising before matching: JS word boundaries do not apply to
 * Arabic script, and the same word appears with different alef, yaa and taa
 * marbuta forms, with or without diacritics.
 */
export function normaliseArabic(text: string): string {
  return text
    .replace(/[ً-ْٰ]/g, '') // tashkeel
    .replace(/ـ/g, '') // tatweel
    .replace(/[آأإٱ]/g, 'ا') // alef forms → ا
    .replace(/ى/g, 'ي') // alef maqsura → ي
    .replace(/ة/g, 'ه'); // taa marbuta → ه
}

interface CategoryPatterns {
  /** Matched case-insensitively against the raw text, with word boundaries. */
  english: RegExp[];
  /** Matched as substrings against the Arabic-normalised text. */
  arabic: string[];
}

const PATTERNS: Record<EscalationCategory, CategoryPatterns> = {
  hardship: {
    english: [
      /\blost my job\b/i,
      /\bjob loss\b/i,
      /\blaid off\b/i,
      /\blet me go\b/i,
      /\bmade redundant\b/i,
      /\bredundan(?:t|cy)\b/i,
      /\bterminated\b/i,
      /\bno income\b/i,
      /\bno money\b/i,
      /\bcannot afford\b|\bcan'?t afford\b/i,
      /\bcannot pay anything\b|\bcan'?t pay anything\b/i,
      /\bsalary stopped\b|\bstopped paying my salary\b/i,
      /\bstruggling financially\b|\bfinancial hardship\b|\bhardship\b/i,
      /\bmedical emergency\b/i,
      /\bhospital\b/i,
      /\bunemployed\b|\bout of work\b/i,
    ],
    arabic: [
      'فقدت وظيفتي',
      'فقدت عملي',
      'خسرت وظيفتي',
      'فصلوني',
      'تم فصلي',
      'عاطل عن العمل',
      'ما عندي شغل',
      'ما في راتب',
      'مافي راتب',
      'انقطع راتبي',
      'ما اقدر ادفع',
      'لا استطيع الدفع',
      'ظروف ماليه صعبه',
      'المستشفي',
      'حاله طارئه',
    ],
  },
  dispute: {
    english: [
      /\bnot my account\b/i,
      /\bnot mine\b|\baren'?t mine\b|\bisn'?t mine\b/i,
      /\balready paid\b/i,
      /\bi paid this\b|\bi have paid this\b/i,
      /\bfraud(?:ulent)?\b/i,
      /\bunauthorised\b|\bunauthorized\b/i,
      /\bdidn'?t make these charges\b|\bdid not make these charges\b/i,
      /\bwrong amount\b/i,
      /\bi cancelled\b|\bi canceled\b/i,
      /\bidentity theft\b/i,
    ],
    arabic: [
      'ليس حسابي',
      'ليست حسابي',
      'ليست لي',
      'ما هي لي',
      'دفعت المبلغ',
      'سبق ان دفعت',
      'احتيال',
      'نصب',
      'لم اقم بهذه العمليات',
      'مبلغ خاطي',
      'الغيت البطاقه',
      'سرقه هويه',
    ],
  },
  legal_representation: {
    english: [
      /\blawyer\b/i,
      /\battorney\b/i,
      /\badvocate\b/i,
      /\blegal counsel\b/i,
      /\bmy solicitor\b|\bsolicitor\b/i,
      /\bspeak to my legal\b/i,
      /\bcourt\b/i,
      /\bsue you\b|\bsue the bank\b|\bi'?ll sue\b|\bi will sue\b/i,
    ],
    arabic: ['محامي', 'محاميي', 'المحكمه', 'مستشار قانوني', 'ساقاضيكم', 'سوف اقاضي'],
  },
  stop_contact_request: {
    english: [
      /\bstop calling\b/i,
      /\bstop contacting\b/i,
      /\bdon'?t contact me\b|\bdo not contact me\b/i,
      /\bdo not call\b|\bdon'?t call me\b/i,
      /\bremove my number\b/i,
      /\bleave me alone\b/i,
      /\btake me off your list\b/i,
    ],
    arabic: ['لا تتصلوا بي', 'توقفوا عن الاتصال', 'احذفوا رقمي', 'اتركوني'],
  },
  // Never pattern-matched: `other` exists for classifier and system escalations.
  other: { english: [], arabic: [] },
};

export interface PatternHit {
  category: EscalationCategory;
  /** The pattern that fired, for the audit trace. */
  matched: string;
}

/**
 * Returns the first category whose patterns match, or null.
 *
 * Categories are checked in a fixed order so the same text always produces the
 * same category — an examiner asking "why was this filed as a dispute?" gets a
 * stable answer.
 */
export function matchPatterns(text: string): PatternHit | null {
  const arabic = normaliseArabic(text);

  for (const category of [
    'hardship',
    'dispute',
    'legal_representation',
    'stop_contact_request',
  ] as const) {
    const { english, arabic: arabicTerms } = PATTERNS[category];

    for (const re of english) {
      if (re.test(text)) return { category, matched: re.source };
    }
    for (const term of arabicTerms) {
      if (arabic.includes(term)) return { category, matched: term };
    }
  }
  return null;
}

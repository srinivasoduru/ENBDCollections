/**
 * Monetary figure extraction for the off-matrix check.
 *
 * A naive "pull every numeral out of the reply" check is unusable: a compliant
 * sentence is full of numbers that are not offers — days past due, the day of
 * the month, tenor in months, percentages, times, the account number. Every
 * false positive here suppresses a good reply and terminally locks the session,
 * so this extracts *money* and nothing else.
 */

/** Arabic-Indic and extended Arabic-Indic digits map to ASCII before matching. */
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

export function normaliseDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** Currency markers that make a number unambiguously an amount. */
const CURRENCY = String.raw`(?:AED|aed|د\.إ|درهم|dirhams?|DHS|dhs)`;

/** A number with optional thousands separators and decimals. */
const NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;

const CURRENCY_BEFORE = new RegExp(String.raw`${CURRENCY}\s*(${NUMBER})`, 'g');
const CURRENCY_AFTER = new RegExp(String.raw`(${NUMBER})\s*${CURRENCY}`, 'g');

/**
 * Words that make a bare number in the same sentence an amount rather than a
 * date, a tenor or a count.
 */
const MONEY_CONTEXT =
  /\b(pay|paying|payment|instal?ment|instal?ments|settle|settlement|monthly|deposit|transfer|waiver|waive|discount|balance|outstanding|amount|owe|owing|clear|upfront|down\s?payment|give|giving|send|sending|offer|accept|take|manage|afford|cover|contribute|put down)\b/i;

/**
 * Numbers that look like money but are something else. Checked against the
 * text immediately following the number.
 */
const NOT_MONEY_SUFFIX =
  /^\s*(?:%|percent|months?|days?|weeks?|years?|hours?|am\b|pm\b|st\b|nd\b|rd\b|th\b|dpd\b|installments?\b|instalments?\b)/i;

/** A bare number small enough to be a count, a tenor or a day of the month. */
const MIN_BARE_AMOUNT = 100;

const toNumber = (raw: string): number => Number(raw.replace(/,/g, ''));

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Extracts the monetary amounts a reply states.
 *
 * Currency-tagged figures always count. A bare figure counts only when it is
 * large enough not to be a count, sits in a sentence about money, and is not
 * immediately followed by a unit that makes it something else.
 */
export function extractAmounts(rawText: string): number[] {
  const text = normaliseDigits(rawText);
  const found = new Set<number>();

  for (const re of [CURRENCY_BEFORE, CURRENCY_AFTER]) {
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) found.add(toNumber(match[1]));
  }

  for (const sentence of splitSentences(text)) {
    if (!MONEY_CONTEXT.test(sentence)) continue;

    const bare = new RegExp(NUMBER, 'g');
    for (const match of sentence.matchAll(bare)) {
      const start = match.index ?? 0;
      const before = sentence.slice(Math.max(0, start - 1), start);
      // Part of an identifier such as ENBD-4471, not an amount.
      if (/[A-Za-z\-/]/.test(before)) continue;

      const after = sentence.slice(start + match[0].length);
      if (NOT_MONEY_SUFFIX.test(after)) continue;

      const value = toNumber(match[0]);
      if (value >= MIN_BARE_AMOUNT) found.add(value);
    }
  }

  return [...found];
}

/**
 * Amounts written as words rather than digits.
 *
 * The agent is instructed to always use digits for money, so a spelled-out
 * amount is treated as a violation rather than parsed — parsing it reliably is
 * not worth the false-negative risk on a compliance check.
 */
const NUMBER_WORD = String.raw`(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)`;

/**
 * Only an unbroken run of number words touching the currency counts. "three
 * thousand dirhams" is a spelled amount; "three payments of AED 1,083" is a
 * count followed by a perfectly checkable figure, and blocking it would
 * suppress a compliant reply.
 */
const NUMBER_PHRASE = String.raw`${NUMBER_WORD}(?:[\s-]+(?:and[\s-]+)?${NUMBER_WORD})*`;

const SPELLED_MONEY = new RegExp(
  String.raw`\b${NUMBER_PHRASE}\s+${CURRENCY}\b|\b${CURRENCY}\s+${NUMBER_PHRASE}\b`,
  'i',
);

export const hasSpelledAmount = (text: string): boolean => SPELLED_MONEY.test(text);

/** Collects every number appearing anywhere in a tool result, at any depth. */
export function collectNumbers(value: unknown, into = new Set<number>()): Set<number> {
  if (typeof value === 'number' && Number.isFinite(value)) into.add(value);
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, into);
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectNumbers(v, into);
  }
  return into;
}

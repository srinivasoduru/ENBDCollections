import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectNumbers, extractAmounts, hasSpelledAmount } from '../server/compliance/money';
import { screenOutput, type OutputContext } from '../server/compliance/output';

/**
 * Post-generation gate — unit tests.
 *
 * Two halves matter here. Blocking the four prohibited things is the obvious
 * one. The other is not blocking compliant replies: every false positive
 * suppresses a good answer and terminally locks the session, so the
 * "must not fire" cases carry as much weight as the "must fire" ones.
 */

const allowed = (over: Partial<OutputContext> = {}): OutputContext => ({
  served: new Set(),
  balance: 3250,
  customerProposed: new Set(),
  // Most rules are exercised on a conversation where identity is already
  // confirmed; premature disclosure has its own block below.
  identityConfirmed: true,
  toolNames: [],
  ...over,
});

const verdict = (reply: string, over?: Partial<OutputContext>) => screenOutput(reply, allowed(over));

describe('monetary figure extraction', () => {
  const money: [string, number[]][] = [
    ['You owe AED 3,250.', [3250]],
    ['You owe 3,250 AED.', [3250]],
    ['The balance is AED3250 today.', [3250]],
    ['Pay AED 1,083.33 monthly.', [1083.33]],
    ['I can take 3000 as a payment now.', [3000]],
    ['The outstanding amount is 47800.', [47800]],
  ];

  for (const [text, expected] of money) {
    it(`extracts ${JSON.stringify(expected)} from "${text}"`, () => {
      assert.deepEqual(extractAmounts(text).sort(), expected.sort());
    });
  }

  const notMoney = [
    'Your account is 47 days past due.',
    'I can set that up over 6 months.',
    'We can apply a 5% arrears waiver.',
    'Payment is due on the 5th.',
    'I will call you at 3pm tomorrow.',
    'Your account number is ENBD-4471.',
    'That is 12 DPD.',
    'You have made 2 payments so far.',
  ];

  for (const text of notMoney) {
    it(`finds no amount in "${text}"`, () => {
      assert.deepEqual(extractAmounts(text), [], 'a false positive here suppresses a good reply');
    });
  }

  it('reads Arabic-Indic digits', () => {
    assert.deepEqual(extractAmounts('المبلغ ٣٢٥٠ درهم'), [3250]);
  });

  it('detects amounts written as words', () => {
    assert.equal(hasSpelledAmount('I can accept three thousand dirhams.'), true);
    assert.equal(hasSpelledAmount('I can accept AED 3,000.'), false);
  });

  it('collects every number from a served matrix, at any depth', () => {
    const matrix = {
      pay_in_full: { amount_aed: 3250, arrears_waiver_pct: 5 },
      plan_3_month: { months: 3, monthly_aed: 1083 },
      plan_12_month: null,
      settlement: { min_acceptable_aed: 2763, requires_approval: 'collections_manager' },
    };
    const numbers = collectNumbers(matrix);
    for (const n of [3250, 5, 3, 1083, 2763]) assert.ok(numbers.has(n), `missing ${n}`);
  });
});

describe('legal and criminal threats', () => {
  const threats = [
    "we'll take you to court",
    'This may result in a police case.',
    'A travel ban could be placed on you.',
    'This could lead to prosecution.',
    'You may face a criminal case.',
    'We will begin legal action next week.',
    'This is treated as absconding.',
  ];

  for (const reply of threats) {
    it(`blocks: "${reply}"`, () => {
      const v = verdict(reply);
      assert.equal(v.blocked, true);
      assert.equal(v.blocked && v.rule, 'legal_threat');
    });
  }

  const fine = [
    'Of course, I can arrange that for you.',
    'I will send you written confirmation.',
    'A colleague will call you back.',
  ];

  for (const reply of fine) {
    it(`allows: "${reply}"`, () => {
      assert.equal(verdict(reply).blocked, false);
    });
  }
});

describe('credit bureau promises', () => {
  const promises = [
    'We can remove this from your AECB record once you pay.',
    'I can have the entry deleted from your credit report.',
    'That will clear your credit file completely.',
    'We will fix your credit score after settlement.',
  ];

  for (const reply of promises) {
    it(`blocks: "${reply}"`, () => {
      const v = verdict(reply);
      assert.equal(v.blocked, true);
      assert.equal(v.blocked && v.rule, 'bureau_promise');
    });
  }

  it('allows a factual statement about the bureau', () => {
    assert.equal(
      verdict('The arrears are reported to the Al Etihad Credit Bureau each month.').blocked,
      false,
    );
  });
});

describe('third-party contact', () => {
  const hits = [
    'We may need to contact your employer about this.',
    'I will call your sponsor to discuss it.',
    'We can inform your family of the outstanding amount.',
    'We will speak to your guarantor.',
  ];

  for (const reply of hits) {
    it(`blocks: "${reply}"`, () => {
      const v = verdict(reply);
      assert.equal(v.blocked, true);
      assert.equal(v.blocked && v.rule, 'third_party_contact');
    });
  }

  const fine = [
    'Please quote your reference number when you call us.',
    'I will contact you again next week.',
    'You can call us on the number on the back of your card.',
  ];

  for (const reply of fine) {
    it(`allows: "${reply}"`, () => {
      assert.equal(verdict(reply).blocked, false, 'must not fire on a reference number');
    });
  }
});

describe('off-matrix offers', () => {
  const served = new Set([3250, 1083, 542, 2763, 5]);

  it('allows a figure the matrix served', () => {
    assert.equal(verdict('I can set up three payments of AED 1,083.', { served }).blocked, false);
  });

  it('allows the outstanding balance', () => {
    assert.equal(verdict('The balance is AED 3,250.', { served }).blocked, false);
  });

  it('blocks a figure the matrix never returned', () => {
    const v = verdict('I could do AED 900 a month for you.', { served });
    assert.equal(v.blocked, true);
    assert.equal(v.blocked && v.rule, 'off_matrix_offer');
    assert.match(v.blocked ? v.detail : '', /not a term the offer matrix returned/);
  });

  it('blocks an invented settlement even when it sounds reasonable', () => {
    assert.equal(verdict('I can settle this today for AED 2,000.', { served }).blocked, true);
  });

  it('allows a figure the customer proposed, so the agent can decline it', () => {
    const v = verdict('I am afraid I cannot accept AED 500 as a settlement.', {
      served,
      customerProposed: new Set([500]),
    });
    assert.equal(v.blocked, false);
  });

  it('tolerates rounding of a served value', () => {
    assert.equal(
      verdict('That is AED 1,083 a month.', { served: new Set([1083.33]) }).blocked,
      false,
    );
  });

  it('blocks an amount written in words, which cannot be checked', () => {
    const v = verdict('I can accept two thousand dirhams.', { served });
    assert.equal(v.blocked, true);
    assert.equal(v.blocked && v.rule, 'off_matrix_offer');
  });

  it('does not fire on tenor, percentages or dates alongside a served figure', () => {
    const v = verdict(
      'Over 6 months that is AED 542 each, with a 5% arrears waiver, starting on the 5th.',
      { served },
    );
    assert.equal(v.blocked, false);
  });
});

describe('rule precedence', () => {
  it('reports the legal threat when a reply breaks several rules at once', () => {
    const v = verdict('We will take you to court and contact your employer about AED 999.');
    assert.equal(v.blocked && v.rule, 'legal_threat');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  disclosesAi,
  looksLikeConfirmation,
  looksLikeThirdParty,
  mentionsAccountDetail,
  readIdentity,
} from '../server/compliance/identity';
import { screenOutput, type OutputContext } from '../server/compliance/output';

/**
 * Right-party verification and the two output rules that ride on it.
 *
 * The agent does not know who answered. Until the person confirms they are the
 * account holder it may not name a product, a balance or arrears — and if a
 * third party answers, the contact ends without disclosing anything.
 */

const ctx = (over: Partial<OutputContext> = {}): OutputContext => ({
  served: new Set(),
  balance: 22100,
  customerProposed: new Set(),
  identityConfirmed: false,
  toolNames: ['get_account_status', 'get_offer_matrix', 'escalate_to_human'],
  ...over,
});

describe('third-party detection', () => {
  const thirdParty = [
    'No, this is his brother.',
    "He isn't here right now.",
    'Wrong number.',
    'You have the wrong person.',
    'This is his wife.',
    'Who is this?',
    'She is away at the moment.',
  ];

  for (const text of thirdParty) {
    it(`detects a third party: "${text}"`, () => {
      assert.equal(looksLikeThirdParty(text), true);
      assert.equal(readIdentity(text, 'Mohammed').thirdParty, true);
      assert.equal(readIdentity(text, 'Mohammed').confirmed, false);
    });
  }

  it('a negative answer never reads as confirmation, even with affirmative tokens', () => {
    // "no, yes this is his brother speaking" would confirm on a naive check.
    const read = readIdentity('No, yes — this is his brother speaking.', 'Mohammed');
    assert.equal(read.confirmed, false, 'third party must win over affirmative tokens');
    assert.equal(read.thirdParty, true);
  });
});

describe('holder confirmation', () => {
  const confirmations = [
    'Yes.',
    'Yes, speaking.',
    'Speaking.',
    'Yep, that is right.',
    "That's me.",
    'This is Mohammed.',
    "I'm Mohammed.",
  ];

  for (const text of confirmations) {
    it(`accepts: "${text}"`, () => {
      assert.equal(looksLikeConfirmation(text, 'Mohammed'), true);
      assert.equal(readIdentity(text, 'Mohammed').confirmed, true);
    });
  }

  const ambiguous = ['Hello?', 'Who wants to know?', 'What is this about?', 'Hold on a second.'];

  for (const text of ambiguous) {
    it(`does not accept: "${text}"`, () => {
      assert.equal(readIdentity(text, 'Mohammed').confirmed, false);
    });
  }
});

describe('AI disclosure', () => {
  const discloses = [
    'Good afternoon, I am an AI assistant of Emirates NBD.',
    'This is an automated assistant calling from Emirates NBD.',
    'I am a virtual agent for the bank.',
  ];
  for (const text of discloses) {
    it(`detects: "${text}"`, () => assert.equal(disclosesAi(text), true));
  }

  it('does not detect a plain human-sounding opener', () => {
    assert.equal(disclosesAi('Good afternoon, this is Emirates NBD calling.'), false);
  });
});

describe('premature disclosure', () => {
  const detail = [
    'There is an outstanding amount of AED 22,100 on your account.',
    'Your personal loan is 74 days past due.',
    'You have arrears on the credit card.',
    'The balance is due today.',
  ];

  for (const reply of detail) {
    it(`blocks before identity is confirmed: "${reply}"`, () => {
      const v = screenOutput(reply, ctx());
      assert.equal(v.blocked, true);
      assert.equal(v.blocked && v.rule, 'premature_disclosure');
      assert.match(v.blocked ? v.detail : '', /before the account holder was confirmed/i);
    });

    it(`allows the same line once confirmed: "${reply.slice(0, 34)}…"`, () => {
      const v = screenOutput(reply, ctx({ identityConfirmed: true, served: new Set([22100]) }));
      assert.equal(v.blocked, false);
    });
  }

  it('allows a compliant opening turn', () => {
    const v = screenOutput(
      'Good afternoon, I am an AI assistant of Emirates NBD. Am I speaking with Mohammed?',
      ctx(),
    );
    assert.equal(v.blocked, false, 'AI disclosure plus an identity question discloses nothing');
  });

  it('allows ending the call politely on a third party', () => {
    const v = screenOutput(
      'I understand, thank you. I am not able to discuss this with anyone other than the account holder, so I will end the call here.',
      ctx(),
    );
    assert.equal(v.blocked, false);
  });

  it('agrees with mentionsAccountDetail, which is the shared definition', () => {
    assert.equal(mentionsAccountDetail('your outstanding balance'), true);
    assert.equal(mentionsAccountDetail('Am I speaking with Mohammed?'), false);
  });
});

describe('narration', () => {
  const narrated = [
    'One moment, let me pull up your account.',
    "I'll check the system for you.",
    'Let me look that up.',
    'Please hold while I retrieve your details.',
    'Calling get_account_status now.',
    'I will run get_offer_matrix(cluster=2).',
    'The tool returned three options.',
  ];

  for (const reply of narrated) {
    it(`blocks: "${reply}"`, () => {
      const v = screenOutput(reply, ctx({ identityConfirmed: true }));
      assert.equal(v.blocked, true);
      assert.equal(v.blocked && v.rule, 'narration');
    });
  }

  const spoken = [
    'Good afternoon, am I speaking with Mohammed?',
    'Thank you. How would you like to resolve it?',
    'I can offer six months or three months. Which suits you?',
    'That is processed and the account is clear.',
  ];

  for (const reply of spoken) {
    it(`allows: "${reply}"`, () => {
      assert.equal(screenOutput(reply, ctx({ identityConfirmed: true })).blocked, false);
    });
  }

  it('catches a tool name even when the sentence reads naturally', () => {
    const v = screenOutput('I have checked escalate_to_human for you.', ctx({ identityConfirmed: true }));
    assert.equal(v.blocked, true);
    assert.equal(v.blocked && v.evidence, 'escalate_to_human');
  });
});

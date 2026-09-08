import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import type { Classifier } from '../server/compliance/classifier';
import type { CreateSessionResponse, TraceEntry, TurnResponse } from '../src/shared/api';

/**
 * Post-generation gate — integration tests over HTTP.
 *
 * The claim under test is that a blocked reply never leaves the server. These
 * make the stand-in model say the prohibited thing on purpose, then assert the
 * offending text appears nowhere in the HTTP response — while still appearing
 * in the audit trace, marked suppressed, because an examiner needs to see what
 * was stopped.
 */

let upstream: Server;
let app: Server;
let base: string;

/** Set per test to steer what the stand-in model says. */
let nextReply = 'This is Emirates NBD regarding the outstanding amount on your account.';
/** Tool calls the stand-in should make before speaking, once. */
let pendingTools: { name: string; input: unknown }[] = [];

function startUpstream(): Promise<number> {
  upstream = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      const send = (content: unknown[], stop: string): void => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'msg_stub',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5',
            content,
            stop_reason: stop,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        );
      };

      if (pendingTools.length > 0) {
        const tools = pendingTools.map((t, i) => ({
          type: 'tool_use',
          id: `toolu_${i}`,
          name: t.name,
          input: t.input,
        }));
        pendingTools = [];
        send(tools, 'tool_use');
        return;
      }
      // The opening turn must itself pass the gate, so keep it clean: an AI
      // disclosure and an identity question, with no account detail at all.
      const messages = (parsed.messages ?? []) as { content: unknown }[];
      const last = messages[messages.length - 1];
      const isOpening =
        typeof last?.content === 'string' && last.content.includes('SESSION CONNECTED');
      send(
        [
          {
            type: 'text',
            text: isOpening
              ? 'Good afternoon, I am an AI assistant of Emirates NBD. Am I speaking with Mohammed?'
              : nextReply,
          },
        ],
        'end_turn',
      );
    });
  });
  return new Promise((resolve) => {
    upstream.listen(0, () => resolve((upstream.address() as AddressInfo).port));
  });
}

/** Never escalates, so the pre-flight gate stays out of the way. */
const quietClassifier: Classifier = async () => ({
  escalate: false,
  category: null,
  confidence: 0.01,
});

/** `negotiate` is used throughout: `early` is suppressed and opens no session. */
const openSession = async (personaId = 'negotiate'): Promise<CreateSessionResponse> => {
  const res = await fetch(`${base}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personaId, contactHour: 14 }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as CreateSessionResponse;
};

/**
 * Opens a session and confirms the account holder, because until identity is
 * confirmed every reply naming an amount is blocked by its own rule — which is
 * correct, and not what these tests are about.
 */
const openConfirmed = async (): Promise<string> => {
  const { sessionId } = await openSession();
  nextReply = 'Thank you. How would you like to proceed?';
  await turn(sessionId, 'Yes, speaking.');
  return sessionId;
};

/** Returns the raw body too, so we can assert the blocked text is nowhere in it. */
const turn = async (
  sessionId: string,
  text: string,
): Promise<{ data: TurnResponse; raw: string }> => {
  const res = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, text }),
  });
  assert.equal(res.status, 200);
  const raw = await res.text();
  return { data: JSON.parse(raw) as TurnResponse, raw };
};

const trace = async (sessionId: string): Promise<TraceEntry[]> =>
  ((await (await fetch(`${base}/api/session/${sessionId}/trace`)).json()) as {
    entries: TraceEntry[];
  }).entries;

// One stub and one app for the whole file: the SDK caches its client on first
// use, so restarting upstream per describe would leave later suites pointed at
// a closed port.
before(async () => {
  const port = await startUpstream();
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  const { createApp } = await import('../server/app');
  app = createApp({ classifier: quietClassifier }).listen(0);
  await new Promise((r) => app.once('listening', r));
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});

after(() => {
  app?.close();
  upstream?.close();
});

describe('post-generation gate', () => {
  it('lets a compliant reply through untouched', async () => {
    const sessionId = await openConfirmed();
    nextReply = 'I can look at that with you. What would work for you this month?';

    const { data } = await turn(sessionId, 'What can we do?');
    assert.equal(data.reply, nextReply);
    assert.equal(data.escalated, false);
    assert.equal(data.locked, false);
  });

  const blockedCases: [string, string, string][] = [
    ['a legal threat', "If this continues we'll take you to court.", 'legal_threat'],
    [
      'a credit bureau promise',
      'Pay today and we will remove this from your AECB record.',
      'bureau_promise',
    ],
    [
      'third-party contact',
      'If you do not pay we may contact your employer about this.',
      'third_party_contact',
    ],
    ['an off-matrix offer', 'I can settle the whole thing for AED 900 today.', 'off_matrix_offer'],
  ];

  for (const [label, reply, rule] of blockedCases) {
    it(`suppresses ${label} and the customer never sees it`, async () => {
      const sessionId = await openConfirmed();
      nextReply = reply;

      const { data, raw } = await turn(sessionId, 'What can we do?');

      // The whole point: the offending text is nowhere in the response.
      assert.notEqual(data.reply, reply);
      assert.ok(!raw.includes(reply), 'the blocked reply must not appear in the response at all');

      const { HANDOFF } = await import('../server/handoff');
      assert.equal(data.reply, HANDOFF.other, 'the customer gets the fixed handoff instead');
      assert.equal(data.escalated, true);
      assert.equal(data.locked, true);
      assert.equal(data.state.escalationVia, 'postgen');
      assert.equal(data.state.blockedRule, rule);
    });
  }

  it('records the suppressed reply in the audit trace', async () => {
    const sessionId = await openConfirmed();
    nextReply = 'We will begin legal action and take you to court.';
    await turn(sessionId, 'What can we do?');

    const entries = await trace(sessionId);

    const suppressed = entries.find((e) => e.kind === 'agent_turn' && e.suppressed);
    assert.ok(suppressed, 'the blocked reply must be recorded, not discarded');
    assert.equal(suppressed.kind === 'agent_turn' && suppressed.text, nextReply);

    const postGates = entries.filter((e) => e.kind === 'gate' && e.gate === 'postgeneration');
    const gate = postGates[postGates.length - 1];
    assert.ok(gate);
    assert.equal(gate.kind === 'gate' && gate.decision, 'block');
    assert.equal(gate.kind === 'gate' && gate.rule, 'legal_threat');
    assert.ok(gate.kind === 'gate' && gate.evidence, 'the offending fragment is recorded');

    // What the customer actually heard is the last, unsuppressed, canned turn.
    const spoken = entries.filter((e) => e.kind === 'agent_turn' && !e.suppressed);
    const last = spoken[spoken.length - 1];
    assert.equal(last.kind === 'agent_turn' && last.source, 'canned');
  });

  it('records the gate on every turn, not only when it blocks', async () => {
    const sessionId = await openConfirmed();
    nextReply = 'Of course. What would suit you?';
    await turn(sessionId, 'What can we do?');

    const gates = (await trace(sessionId)).filter(
      (e) => e.kind === 'gate' && e.gate === 'postgeneration',
    );
    // The opening turn, the identity confirmation and this turn each produce a
    // reply to screen.
    assert.equal(gates.length, 3);
    for (const g of gates) assert.equal(g.kind === 'gate' && g.decision, 'pass');
  });

  it('validates figures against the matrix the server actually served', async () => {
    const sessionId = await openConfirmed();

    // Serve the matrix first, then quote one of its values. Mohammed's balance
    // is 22,100, so the three-month plan is 7,367.
    pendingTools = [{ name: 'get_offer_matrix', input: {} }];
    nextReply = 'I can set up three payments of AED 7,367.';
    const served = await turn(sessionId, 'Can we split it?');
    assert.equal(served.data.escalated, false, 'a served figure must be allowed');

    // A figure the matrix never returned, on a fresh session.
    const second = await openConfirmed();
    pendingTools = [{ name: 'get_offer_matrix', input: {} }];
    nextReply = 'I can set up three payments of AED 777.';
    const invented = await turn(second, 'Can we split it?');
    assert.equal(invented.data.escalated, true);
    assert.equal(invented.data.state.blockedRule, 'off_matrix_offer');
  });

  it('allows the agent to repeat a figure the customer proposed', async () => {
    const sessionId = await openConfirmed();
    nextReply = 'I am sorry, I cannot accept AED 450 as a settlement.';

    const { data } = await turn(sessionId, 'What if I give you 450 today?');
    assert.equal(data.escalated, false, 'the agent must be able to decline the customer’s number');
  });

  it('locks the session after a block — the next turn never reaches the model', async () => {
    const sessionId = await openConfirmed();
    nextReply = 'We will take you to court.';
    await turn(sessionId, 'What can we do?');

    nextReply = 'This should never be produced.';
    const { data } = await turn(sessionId, 'Please wait.');
    assert.equal(data.locked, true);
    assert.notEqual(data.reply, nextReply);
  });

  it('flags the specific rule in the compliance panel', async () => {
    const sessionId = await openConfirmed();
    nextReply = 'We may contact your employer about the arrears.';
    const { data } = await turn(sessionId, 'What can we do?');

    const guard = data.state.guards.find((g) => g.id === 'third_party');
    assert.ok(guard);
    assert.equal(guard.status, 'flag');
    assert.match(guard.detail, /suppressed before the customer saw it/i);

    const hardStop = data.state.guards.find((g) => g.id === 'hard_stop');
    assert.match(hardStop!.detail, /suppressed before the customer saw it/i);
  });
});

/**
 * Identification and purpose land on different turns, because identity-before-
 * disclosure forbids naming the debt in the opening turn. Reading both halves
 * off the opening turn made the guard report a breach on the very behaviour the
 * design requires — a red compliance panel in front of a risk committee, caused
 * by the agent doing the right thing.
 */
describe('disclosure guard', () => {
  const disclosure = (state: { guards: { id: string; status: string; detail: string }[] }) => {
    const guard = state.guards.find((g) => g.id === 'disclosure');
    assert.ok(guard, 'the disclosure guard must be present');
    return guard;
  };

  it('is pending, not flagged, while the holder is still unconfirmed', async () => {
    const { state } = await openSession();
    assert.equal(disclosure(state).status, 'pending');
  });

  it('passes once the purpose is stated after the holder is confirmed', async () => {
    const { sessionId } = await openSession();
    nextReply = 'Thank you. There is an outstanding amount on the account we should resolve.';
    const { data } = await turn(sessionId, 'Yes, speaking.');
    assert.equal(disclosure(data.state).status, 'pass');
  });

  it('stays passed on later turns that do not restate the purpose', async () => {
    const { sessionId } = await openSession();
    nextReply = 'Thank you. There is an outstanding amount on the account we should resolve.';
    await turn(sessionId, 'Yes, speaking.');

    nextReply = 'Understood. Which of those would suit you?';
    const { data } = await turn(sessionId, 'Let me think.');
    assert.equal(disclosure(data.state).status, 'pass');
  });

  it('flags when the holder is confirmed and the purpose is never stated', async () => {
    const { sessionId } = await openSession();
    nextReply = 'Thank you. How would you like to proceed?';
    const { data } = await turn(sessionId, 'Yes, speaking.');
    assert.equal(disclosure(data.state).status, 'flag');
    assert.match(disclosure(data.state).detail, /purpose of the call was not stated/i);
  });
});

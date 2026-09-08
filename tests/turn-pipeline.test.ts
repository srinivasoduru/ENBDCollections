import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import type { CreateSessionResponse, TraceEntry, TurnResponse } from '../src/shared/api';
import type { Classifier } from '../server/compliance/classifier';

/**
 * Pre-flight gate — integration tests over HTTP.
 *
 * The point of these is the claim the gate exists to make: on a hit, the model
 * is never invoked. A unit test cannot show that. Here a stub stands in for the
 * Anthropic API and counts every request it receives, so "the model was not
 * called" is asserted against the wire rather than assumed.
 */

let upstream: Server;
let upstreamCalls = 0;
let app: Server;
let base: string;

/** Minimal Messages API stand-in: replies with plain text, no tool use. */
function startUpstream(): Promise<number> {
  upstream = createServer((req, res) => {
    upstreamCalls += 1;
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      // Deliberately compliant and content-free: an AI disclosure plus an
      // identity question. Anything naming a balance would be blocked by the
      // premature-disclosure rule, which is tested on its own elsewhere.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'msg_stub',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          content: [
            {
              type: 'text',
              text: 'Good afternoon, I am an AI assistant of Emirates NBD. Am I speaking with the account holder?',
            },
          ],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    });
  });
  return new Promise((resolve) => {
    upstream.listen(0, () => resolve((upstream.address() as AddressInfo).port));
  });
}

/** Escalates on anything containing "flagme", so the classifier path is testable. */
const stubClassifier: Classifier = async (text) => ({
  escalate: /flagme/i.test(text),
  category: /flagme/i.test(text) ? 'hardship' : null,
  confidence: /flagme/i.test(text) ? 0.9 : 0.01,
});

const failingClassifier: Classifier = async () => {
  throw new Error('classifier unavailable');
};

async function startApp(classifier: Classifier): Promise<void> {
  // Imported after the env is set so the SDK client picks up the stub upstream.
  const { createApp } = await import('../server/app');
  app = createApp({ classifier }).listen(0);
  await new Promise((r) => app.once('listening', r));
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
}

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

const turn = async (sessionId: string, text: string): Promise<TurnResponse> => {
  const res = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, text }),
  });
  assert.equal(res.status, 200);
  return (await res.json()) as TurnResponse;
};

const trace = async (sessionId: string): Promise<TraceEntry[]> => {
  const res = await fetch(`${base}/api/session/${sessionId}/trace`);
  assert.equal(res.status, 200);
  return ((await res.json()) as { entries: TraceEntry[] }).entries;
};

describe('turn pipeline with the pre-flight gate', () => {
  before(async () => {
    const port = await startUpstream();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
    await startApp(stubClassifier);
  });

  after(() => {
    app?.close();
    upstream?.close();
  });

  beforeEach(() => {
    upstreamCalls = 0;
  });

  it('opens a session by calling the model', async () => {
    const session = await openSession();
    assert.equal(session.state.mode, 'live');
    assert.ok(upstreamCalls > 0, 'the opening turn should reach the model');
  });

  it('lets an ordinary turn through to the model', async () => {
    const { sessionId } = await openSession();
    upstreamCalls = 0;

    const result = await turn(sessionId, 'Can I pay 500 now and the rest next month?');
    assert.equal(result.escalated, false);
    assert.equal(result.locked, false);
    assert.ok(upstreamCalls > 0, 'a clean turn should reach the model');
  });

  it('NEVER invokes the model on a pattern hit', async () => {
    const { sessionId } = await openSession();
    upstreamCalls = 0;

    const result = await turn(sessionId, 'I lost my job last month.');
    assert.equal(upstreamCalls, 0, 'the model must not be called on a gate hit');
    assert.equal(result.escalated, true);
    assert.equal(result.locked, true);
    assert.equal(result.state.escalationReason, 'hardship');
    assert.equal(result.state.escalationVia, 'preflight');
  });

  it('NEVER invokes the model on a classifier hit', async () => {
    const { sessionId } = await openSession();
    upstreamCalls = 0;

    const result = await turn(sessionId, 'things have been different since flagme happened');
    assert.equal(upstreamCalls, 0);
    assert.equal(result.escalated, true);
    assert.equal(result.state.escalationVia, 'preflight');
  });

  it('NEVER invokes the model on an Arabic pattern hit', async () => {
    const { sessionId } = await openSession();
    upstreamCalls = 0;

    const result = await turn(sessionId, 'فقدت وظيفتي الشهر الماضي');
    assert.equal(upstreamCalls, 0);
    assert.equal(result.state.escalationReason, 'hardship');
  });

  it('returns the fixed handoff line, not model text', async () => {
    const { sessionId } = await openSession();
    const result = await turn(sessionId, 'These charges are not mine.');

    const { HANDOFF } = await import('../server/handoff');
    assert.equal(result.reply, HANDOFF.dispute);
    // The handoff must not negotiate or restate the balance.
    assert.doesNotMatch(result.reply, /\d/, 'no figures in the handoff');
    assert.doesNotMatch(result.reply, /\?/, 'no follow-up question in the handoff');
  });

  it('locks the session — later turns never reach the model', async () => {
    const { sessionId } = await openSession();
    const locked = await turn(sessionId, 'I lost my job last month.');
    upstreamCalls = 0;

    const next = await turn(sessionId, 'Wait, I can pay something after all.');
    assert.equal(upstreamCalls, 0, 'a locked session must not call the model');
    assert.equal(next.locked, true);
    assert.equal(
      next.trace.length,
      locked.trace.length,
      'no tool may execute on a locked session',
    );
  });

  it('escalates and does not call the model when screening fails', async () => {
    // A separate app whose classifier always throws.
    const { createApp } = await import('../server/app');
    const failApp = createApp({ classifier: failingClassifier }).listen(0);
    after(() => failApp.close());
    await new Promise((r) => failApp.once('listening', r));
    const failBase = `http://127.0.0.1:${(failApp.address() as AddressInfo).port}`;

    const created = (await (
      await fetch(`${failBase}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personaId: 'negotiate', contactHour: 14 }),
      })
    ).json()) as CreateSessionResponse;

    upstreamCalls = 0;
    const result = (await (
      await fetch(`${failBase}/api/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: created.sessionId, text: 'What is my balance?' }),
      })
    ).json()) as TurnResponse;

    assert.equal(upstreamCalls, 0, 'fail closed means the model is not consulted');
    assert.equal(result.escalated, true);
    // The audit must not record a hardship signal the customer never gave.
    assert.equal(result.state.escalationReason, 'other');
    assert.equal(result.state.escalationVia, 'system');
    failApp.close();
  });

  it('screens on patterns alone when no classifier is configured', async () => {
    const { createApp } = await import('../server/app');
    const bare = createApp({ classifier: null }).listen(0);
    after(() => bare.close());
    await new Promise((r) => bare.once('listening', r));
    const bareBase = `http://127.0.0.1:${(bare.address() as AddressInfo).port}`;

    const post = async (path: string, body: unknown) =>
      (await (
        await fetch(`${bareBase}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json()) as never;

    const created = (await post('/api/session', {
      personaId: 'negotiate',
      contactHour: 14,
    })) as CreateSessionResponse;

    // Benign turns must still get through, or the demo escalates on every turn.
    const ordinary = (await post('/api/turn', {
      sessionId: created.sessionId,
      text: 'What is my balance?',
    })) as TurnResponse;
    assert.equal(ordinary.escalated, false);

    const flagged = (await post('/api/turn', {
      sessionId: created.sessionId,
      text: 'I lost my job last month.',
    })) as TurnResponse;
    assert.equal(flagged.escalated, true);
    assert.equal(flagged.state.escalationReason, 'hardship');

    bare.close();
  });

  it('records the gate in the audit trace whether or not it fired', async () => {
    const { sessionId } = await openSession();
    await turn(sessionId, 'What is my balance?');
    await turn(sessionId, 'I lost my job last month.');

    const entries = await trace(sessionId);
    const gates = entries.filter((e) => e.kind === 'gate' && e.gate === 'preflight');

    assert.equal(gates.length, 2, 'both turns should record a pre-flight decision');
    assert.equal(gates[0].kind === 'gate' && gates[0].decision, 'pass');
    assert.equal(gates[1].kind === 'gate' && gates[1].decision, 'escalate');
    assert.equal(gates[1].kind === 'gate' && gates[1].via, 'pattern');

    // Versions must be recorded, or the audit cannot be reproduced later.
    const versions = gates[0].kind === 'gate' ? gates[0].versions : {};
    assert.ok(versions.patterns, 'pattern list version is recorded');
    assert.ok(versions.classifierModel, 'classifier model is recorded');
  });

  it('orders the trace so the gate precedes the escalation and the handoff', async () => {
    const { sessionId } = await openSession();
    await turn(sessionId, 'my lawyer told me not to discuss this');

    const kinds = (await trace(sessionId)).map((e) => e.kind);
    const customer = kinds.lastIndexOf('customer_turn');
    const gate = kinds.lastIndexOf('gate');
    const escalation = kinds.lastIndexOf('escalation');
    const agent = kinds.lastIndexOf('agent_turn');

    assert.ok(customer < gate, 'gate runs after the customer turn is recorded');
    assert.ok(gate < escalation, 'escalation follows the gate decision');
    assert.ok(escalation < agent, 'the handoff is spoken last');
    assert.ok(!kinds.slice(gate).includes('model_call'), 'no model call after a gate hit');
  });

  it('reports in the compliance panel that the gate caught it pre-model', async () => {
    const { sessionId } = await openSession();
    const result = await turn(sessionId, 'please stop calling me');

    const guard = result.state.guards.find((g) => g.id === 'hard_stop');
    assert.ok(guard);
    assert.equal(guard.status, 'info');
    assert.match(guard.detail, /pre-flight gate/i);
    assert.match(guard.detail, /never invoked/i);
  });
});

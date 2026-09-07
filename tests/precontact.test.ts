import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import type { Classifier } from '../server/compliance/classifier';
import type { CreateSessionResponse, TraceEntry, TurnResponse } from '../src/shared/api';

/**
 * Decisions taken before a conversation exists.
 *
 * Two of them, and both have the same shape: the outbound contact is never
 * placed, so there is nothing for the agent to get wrong. Contact eligibility
 * refuses outside the CBUAE window; the Segment Agent suppresses outreach on an
 * account the self-cure model expects to pay unaided.
 *
 * As with the gates, the claim is asserted against the wire — the stand-in
 * model counts every request it receives.
 */

let upstream: Server;
let upstreamCalls = 0;
let app: Server;
let base: string;

function startUpstream(): Promise<number> {
  upstream = createServer((req, res) => {
    upstreamCalls += 1;
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
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

const quietClassifier: Classifier = async () => ({
  escalate: false,
  category: null,
  confidence: 0.01,
});

const open = async (body: Record<string, unknown>): Promise<CreateSessionResponse> => {
  const res = await fetch(`${base}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 201, 'a refused or suppressed contact is an outcome, not an error');
  return (await res.json()) as CreateSessionResponse;
};

const trace = async (sessionId: string): Promise<TraceEntry[]> =>
  ((await (await fetch(`${base}/api/session/${sessionId}/trace`)).json()) as {
    entries: TraceEntry[];
  }).entries;

const toolNames = (entries: TraceEntry[]): string[] =>
  entries.filter((e) => e.kind === 'tool_call').map((e) => (e.kind === 'tool_call' ? e.name : ''));

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

beforeEach(() => {
  upstreamCalls = 0;
});

describe('contact eligibility', () => {

  const insideHours = [9, 12, 14, 19];
  for (const hour of insideHours) {
    it(`places the contact at ${hour}:00, inside the window`, async () => {
      const session = await open({ personaId: 'negotiate', contactHour: hour });
      assert.equal(session.state.contactRefused, false);
      assert.ok(session.openingTurn.length > 0, 'a conversation opened');
      assert.ok(upstreamCalls > 0, 'the model was asked to speak');
    });
  }

  const outsideHours = [6, 8, 20, 23];
  for (const hour of outsideHours) {
    it(`refuses the contact at ${hour}:00, and never invokes the model`, async () => {
      const session = await open({ personaId: 'negotiate', contactHour: hour });
      assert.equal(upstreamCalls, 0, 'refused before placement — no model call at all');
      assert.equal(session.state.contactRefused, true);
      assert.equal(session.openingTurn, '', 'no conversation exists');
      assert.match(session.notice ?? '', /outside the CBUAE window/i);
    });
  }

  it('records the eligibility check in the trace even when it passes', async () => {
    const session = await open({ personaId: 'negotiate', contactHour: 14 });
    assert.ok(toolNames(await trace(session.sessionId)).includes('check_contact_eligibility'));
  });

  it('records the refusal in the trace, with the hour that was refused', async () => {
    const session = await open({ personaId: 'negotiate', contactHour: 22 });
    const entries = await trace(session.sessionId);
    const check = entries.find((e) => e.kind === 'tool_call' && e.name === 'check_contact_eligibility');
    assert.ok(check);
    const output = check.kind === 'tool_call' ? (check.output as Record<string, unknown>) : {};
    assert.equal(output.permitted, false);
    assert.equal(output.requested_hour, 22);
    assert.equal(output.action, 'REFUSED_BEFORE_PLACEMENT');
  });

  it('the agent cannot talk its way past a refusal — there is no session to talk in', async () => {
    const session = await open({ personaId: 'negotiate', contactHour: 3 });
    upstreamCalls = 0;

    const res = await fetch(`${base}/api/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId, text: 'Please call me anyway.' }),
    });
    await res.text();
    assert.equal(upstreamCalls, 0, 'still no model call after a refused contact');
  });

  it('rejects an out-of-range hour', async () => {
    const res = await fetch(`${base}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personaId: 'negotiate', contactHour: 25 }),
    });
    assert.equal(res.status, 400);
  });
});

describe('contact suppression', () => {
  it('opens no conversation on a self-cure account, and never invokes the model', async () => {
    const session = await open({ personaId: 'early', contactHour: 14 });
    assert.equal(upstreamCalls, 0, 'the single largest saving is the call not made');
    assert.equal(session.state.suppressed, true);
    assert.equal(session.openingTurn, '');
  });

  it('records the score that drove the decision, then the suppression', async () => {
    const session = await open({ personaId: 'early', contactHour: 14 });
    const names = toolNames(await trace(session.sessionId));
    assert.deepEqual(names, ['get_segment_scores', 'suppress_contact']);
  });

  it('leaves the customer a reminder and a payment link only', async () => {
    const session = await open({ personaId: 'early', contactHour: 14 });
    const entries = await trace(session.sessionId);
    const call = entries.find((e) => e.kind === 'tool_call' && e.name === 'suppress_contact');
    const output = call?.kind === 'tool_call' ? (call.output as Record<string, unknown>) : {};
    assert.equal(output.decision, 'no_contact');
    assert.equal(output.channel_allowed, 'reminder_and_payment_link_only');
  });

  it('an override opens the conversation for demonstration', async () => {
    const session = await open({ personaId: 'early', contactHour: 14, override: true });
    assert.equal(session.state.suppressed, false);
    assert.ok(session.openingTurn.length > 0);
    assert.ok(upstreamCalls > 0);
  });

  it('does not suppress accounts the model expects to need contact', async () => {
    for (const personaId of ['hardship', 'dispute', 'negotiate']) {
      const session = await open({ personaId, contactHour: 14 });
      assert.equal(session.state.suppressed, false, `${personaId} must not be suppressed`);
    }
  });

  it('suppression outranks the clock — neither places a call', async () => {
    const session = await open({ personaId: 'early', contactHour: 22 });
    assert.equal(upstreamCalls, 0);
    assert.equal(session.state.suppressed, true);
  });
});

describe('the officer handover pack', () => {
  const hardshipTurn = async (): Promise<TurnResponse> => {
    const session = await open({ personaId: 'hardship', contactHour: 14 });
    const res = await fetch(`${base}/api/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId, text: 'I lost my job in March.' }),
    });
    return (await res.json()) as TurnResponse;
  };

  it('is prepared only after the conversation has stopped', async () => {
    const result = await hardshipTurn();
    assert.equal(result.escalated, true);
    assert.equal(result.locked, true);
    assert.ok(result.state.officerPack, 'the work continues after the call ends');
  });

  it('carries terms more generous than anything the agent could offer', async () => {
    const result = await hardshipTurn();
    const pack = result.state.officerPack!;

    // The live matrix gives a 5% waiver, no 12-month plan and an 85% floor.
    assert.equal(pack.arrearsWaiverPct, 15);
    assert.equal(pack.extendedPlanMonths, 12);
    assert.ok(pack.settlementFloorAed < 47800 * 0.85, 'a lower floor than the live matrix');
    assert.equal(pack.status, 'Awaiting officer approval');
  });

  it('never puts those terms in the reply the customer hears', async () => {
    const result = await hardshipTurn();
    const pack = result.state.officerPack!;
    for (const figure of [pack.extendedPlanMonthlyAed, pack.settlementFloorAed]) {
      assert.ok(
        !result.reply.includes(String(figure)),
        'enhanced terms must never be spoken aloud',
      );
    }
    assert.doesNotMatch(result.reply, /\d/, 'the handoff carries no figures at all');
  });

  it('attaches the EOSB offset position to the case file', async () => {
    const result = await hardshipTurn();
    const pack = result.state.officerPack!;
    assert.ok(pack.eosbEstimateAed && pack.eosbEstimateAed > 0);
    assert.equal(pack.netAfterOffsetAed, 47800 - pack.eosbEstimateAed);
  });

  it('is not prepared for a dispute — only hardship routes to Debt Assist', async () => {
    const session = await open({ personaId: 'dispute', contactHour: 14 });
    const res = await fetch(`${base}/api/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId, text: "These charges aren't mine." }),
    });
    const result = (await res.json()) as TurnResponse;
    assert.equal(result.escalated, true);
    assert.equal(result.state.officerPack, null);
  });
});

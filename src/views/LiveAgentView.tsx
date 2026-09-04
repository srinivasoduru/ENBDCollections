import { useEffect, useRef, useState } from 'react';

import { Hero, Panel } from '../components/primitives';
import { PIPELINE_STEPS, useLiveAgent, type LiveAgentState } from '../hooks/useLiveAgent';
import { C } from '../shared/colors';
import { PERSONAS } from '../shared/personas';

type GuardState = 'pass' | 'flag' | 'info' | 'pending';

const GUARD_MARK: Record<GuardState, string> = { pass: '✓', flag: '!', info: '→', pending: '·' };

/**
 * The compliance floor as observed on this conversation.
 *
 * Three of these are structural — they hold whatever the model does, because
 * the tool surface makes the alternative impossible. The rest are read off the
 * agent's actual behaviour this session.
 */
function guardsFor(live: LiveAgentState): { s: GuardState; title: string; detail: string }[] {
  if (!live.persona) return [];
  const { disclosed, escalated, escReason, resolved, usedTool } = live;

  return [
    {
      s: disclosed === null ? 'pending' : disclosed ? 'pass' : 'flag',
      title: 'Identification & purpose disclosure',
      detail:
        disclosed === null
          ? "Checked against the agent's opening turn."
          : disclosed
            ? 'Detected — the agent identified Emirates NBD and stated the purpose of contact.'
            : 'Not detected in the opening turn. In production this would fail QA before the call connected.',
    },
    {
      s: usedTool('get_account_status') ? 'pass' : 'pending',
      title: 'No un-sourced account claims',
      detail: 'The agent must call get_account_status before stating any balance or DPD figure.',
    },
    {
      s: usedTool('get_offer_matrix') ? 'pass' : 'pending',
      title: 'Offer matrix enforcement',
      detail:
        'Terms may only come from the pre-approved cluster matrix. Off-matrix concessions are structurally impossible.',
    },
    {
      s: 'pass',
      title: 'Payment data tokenised',
      detail:
        'initiate_payment accepts an amount only. The model has no path to a card number or IBAN.',
    },
    {
      s: escalated ? 'info' : resolved ? 'pass' : 'pending',
      title: 'Hardship / dispute hard stop',
      detail: escalated
        ? `Triggered correctly — reason: ${escReason}.`
        : resolved
          ? 'Not required — resolved without a hardship or dispute signal.'
          : 'Monitoring every customer turn for hardship, dispute or legal signals.',
    },
    {
      s: 'pass',
      title: 'CBUAE contact window & frequency',
      detail:
        'Permitted hours and attempt caps are enforced by the orchestrator before a call is placed, not by the agent.',
    },
    {
      s: 'pass',
      title: 'No third-party contact, no legal threat',
      detail:
        'Employer, family and reference contact are unavailable as tools. Legal, travel-ban and cheque language is prohibited in the system prompt.',
    },
  ];
}

export function LiveAgentView() {
  const live = useLiveAgent();
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [live.transcript.length, live.busy]);

  const { persona, started, busy, escalated } = live;
  const locked = busy || escalated;

  const send = (text: string) => {
    live.say(text);
    setDraft('');
  };

  const dot = escalated ? C.red : started ? '#4ADE80' : C.grey;
  const modeLabel = live.mode === 'live' ? 'LIVE MODEL' : 'OFFLINE SCRIPT';

  return (
    <div>
      <Hero
        eyebrow="04 · LIVE — REAL MODEL, REAL TOOL CALLS"
        title="Talk to the agent as the customer."
        lede="This is not a scripted walkthrough. Pick a customer, then type anything. The agent reasons live, decides for itself which tools to call, and the panels on the right update from its actual behaviour — including when it correctly refuses to continue."
        ledeWidth={880}
      />

      <div className="shell shell--wide view" style={{ paddingTop: 44 }}>
        <div className="persona-grid">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={'persona' + (persona?.id === p.id ? ' persona--active' : '')}
              onClick={() => live.pickPersona(p)}
            >
              <div className="persona__label">{p.label}</div>
              <div className="persona__desc">{p.desc}</div>
              <div className="persona__meta">
                AED {p.balance.toLocaleString('en-US')} · {p.dpd} DPD · {p.priorPTP} broken PTP
              </div>
            </button>
          ))}
        </div>

        <div className="live-grid">
          <div className="session">
            <div className="session__bar">
              <div className="session__id">
                <span className="session__dot" style={{ background: dot }} aria-hidden="true" />
                <span>SESSION — {persona ? `${persona.name} · ${persona.acct}` : 'select a customer'}</span>
              </div>
              <div className="session__actions">
                <span
                  className="session__mode"
                  title={
                    live.mode === 'live'
                      ? `Real model calls${live.serverStatus?.model ? ` · ${live.serverStatus.model}` : ''}`
                      : (live.serverStatus?.reason ?? 'Running the in-browser fallback script.')
                  }
                >
                  {modeLabel}
                </span>
                <button type="button" className="session__reset" onClick={live.reset} disabled={!persona}>
                  RESET
                </button>
              </div>
            </div>

            {!persona && (
              <div className="session__placeholder">Select a customer profile above to begin.</div>
            )}

            {persona && !started && (
              <div className="session__ready">
                <div className="session__ready-text">
                  Ready to open the session with <b>{persona.name}</b>.
                </div>
                <button type="button" className="btn-primary" onClick={live.start} disabled={busy}>
                  Start session
                </button>
              </div>
            )}

            {persona && started && (
              <>
                <div className="transcript" ref={scroller}>
                  {live.transcript.map((m, i) => (
                    <div className={`bubble bubble--${m.role}`} key={i}>
                      {m.role === 'agent' && <div className="bubble__who">ENBD COLLECTIONS AGENT</div>}
                      {m.role === 'cust' && (
                        <div className="bubble__who">{persona.name.toUpperCase()}</div>
                      )}
                      {m.text}
                    </div>
                  ))}
                  {busy && <div className="transcript__busy">agent reasoning · · ·</div>}
                </div>

                <div className="composer">
                  <div className="composer__chips">
                    {!escalated &&
                      persona.chips.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="composer__chip"
                          onClick={() => send(c)}
                          disabled={locked}
                        >
                          {c}
                        </button>
                      ))}
                  </div>
                  <div className="composer__row">
                    <input
                      type="text"
                      className="composer__input"
                      value={draft}
                      placeholder={escalated ? 'Session closed — transferred to a human officer.' : 'Type as the customer…'}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') send(draft);
                      }}
                      disabled={locked}
                    />
                    <button
                      type="button"
                      className="composer__send"
                      onClick={() => send(draft)}
                      disabled={locked || !draft.trim()}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="stack">
            <Panel title="CONVERSATION STATE">
              <div className="pipeline">
                {PIPELINE_STEPS.map((step, i) => {
                  const done = i < live.stageIndex || (live.resolved && i <= live.stageIndex);
                  const active = i === live.stageIndex && !escalated && !done;
                  return (
                    <div
                      key={step.k}
                      className={
                        'pipeline__step' +
                        (done ? ' pipeline__step--done' : active ? ' pipeline__step--active' : '')
                      }
                    >
                      <div className="pipeline__mark">{done ? '✓' : i + 1}</div>
                      <div className="pipeline__label">{step.label}</div>
                    </div>
                  );
                })}
                <div className={'pipeline__escalation' + (escalated ? ' pipeline__escalation--fired' : '')}>
                  {escalated
                    ? `ESCALATED TO FR OFFICER — reason: ${live.escReason}. Autonomous handling has stopped.`
                    : 'Escalation branch — fires on hardship, dispute, legal representation, or a request to stop contact.'}
                </div>
              </div>
            </Panel>

            <Panel title="COMPLIANCE FLOOR">
              <div className="guards">
                {guardsFor(live).map((g) => (
                  <div className={`guard guard--${g.s}`} key={g.title}>
                    <div className="guard__mark">{GUARD_MARK[g.s]}</div>
                    <div>
                      <div className="guard__title">{g.title}</div>
                      <div className="guard__detail">{g.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="TOOL CALL TRACE">
              <div className="trace">
                {live.toolCalls.length === 0 && (
                  <div className="panel__empty" style={{ padding: '8px 0' }}>
                    No tool calls yet.
                  </div>
                )}
                {live.toolCalls.map((t, i) => (
                  <div className="trace__row" key={i}>
                    <div className="trace__arrow">▸</div>
                    <div className="trace__call">
                      <b>{t.name}</b>({t.inp}) → {t.out}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <p className="footnote">
          {live.mode === 'live'
            ? 'The model, its instructions, its tool-calling decisions and its language are live.'
            : 'This session is running the offline fallback script, not a live model — the tool calls and panels are driven by the same functions, but the agent’s language is scripted.'}{' '}
          Account data, payment processing and letter issuance are simulated in-browser rather than
          hitting a core banking system. In production the compliance floor would be enforced
          server-side by the orchestrator rather than relying on the agent to call the escalation
          tool itself.
        </p>
      </div>
    </div>
  );
}

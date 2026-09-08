import { useEffect, useRef, useState } from 'react';

import { Hero, Panel } from '../components/primitives';
import { useLiveAgent } from '../hooks/useLiveAgent';
import type { GuardStatus } from '../shared/api';
import { C } from '../shared/colors';
import { PERSONAS } from '../shared/personas';

const GUARD_MARK: Record<GuardStatus, string> = { pass: '✓', flag: '!', info: '→', pending: '·' };

export function LiveAgentView() {
  const live = useLiveAgent();
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [live.transcript.length, live.busy]);

  const { persona, started, busy, state, status } = live;
  const escalated = state?.escalated ?? false;
  const locked = state?.locked ?? false;
  const inputLocked = busy || locked;
  const suppressed = state?.suppressed ?? false;
  const refused = state?.contactRefused ?? false;

  const send = (text: string) => {
    live.say(text);
    setDraft('');
  };

  // Before a session exists the badge reflects the server's capability probe;
  // after that it reflects what actually produced the replies. While the probe
  // is still in flight the badge claims neither — asserting OFFLINE SCRIPT
  // before we know would misstate the mode to the room.
  const mode = state?.mode ?? (status ? (status.live ? 'live' : 'offline') : null);
  const modeLabel = mode === null ? 'CHECKING…' : mode === 'live' ? 'LIVE MODEL' : 'OFFLINE SCRIPT';
  const modelName = state?.model ?? status?.model;
  const dot = escalated ? C.red : started ? '#4ADE80' : C.grey;

  return (
    <div>
      <Hero
        eyebrow="04 · LIVE — REAL MODEL, REAL TOOL CALLS"
        title="Talk to the agent as the customer."
        lede="This is not a scripted walkthrough. Pick a customer, then type anything. The agent reasons live, decides for itself which tools to call, and the panels on the right update from its actual behaviour. Four moments to watch: it leaves Maya alone, it refuses an out-of-hours contact, it rescues a broken promise, and it stops the instant Ahmed mentions hardship."
        ledeWidth={920}
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

        <div className="preflight">
          <div className="preflight__label">PRE-FLIGHT · COMPLIANCE LAYER</div>
          <label className="preflight__clock">
            CONTACT TIME
            <input
              type="range"
              min={6}
              max={23}
              step={1}
              value={live.contactHour}
              onChange={(e) => live.setContactHour(Number(e.target.value))}
              disabled={busy}
            />
            <b style={{ color: refused ? 'var(--red)' : 'var(--green)' }}>
              {String(live.contactHour).padStart(2, '0')}:00 — {refused ? 'REFUSED' : 'permitted'}
            </b>
          </label>
          <div className="preflight__note">
            CBUAE window {state?.contactWindow ?? '09:00–20:00'} · enforced before placement
          </div>
        </div>

        {suppressed && persona && (
          <div className="suppress">
            <div className="suppress__kicker">SEGMENT AGENT · CONTACT SUPPRESSED</div>
            <div className="suppress__headline">The model decided not to chase her.</div>
            <p className="suppress__body">
              Self-cure score <b>{persona.selfcure.replace(/\s*\(.*\)/, '')}</b> — very likely to
              pay on her own. No call, no collector queue, no dialer time. She receives a reminder
              and a payment link only. Roughly three in four first-missed-payment card accounts never
              reach a second, so chasing them is pure cost.
            </p>
            <div className="suppress__message">
              <div className="suppress__message-head">SECURE IN-APP MESSAGE · ENBD X · DAY {persona.dpd}</div>
              <div>
                Your AED {persona.balance.toLocaleString('en-US')} card payment is {persona.dpd} days
                late. Pay within 48 hours and the fee is waived.
              </div>
            </div>
            <button type="button" className="btn-primary" onClick={live.override} disabled={busy}>
              Override — contact her anyway
            </button>
            <span className="suppress__aside">
              for demonstration: see the inbound conversation instead
            </span>
          </div>
        )}

        <div className="live-grid">
          <div className="session">
            <div className="session__bar">
              <div className="session__id">
                <span className="session__dot" style={{ background: dot }} aria-hidden="true" />
                <span>
                  SESSION — {persona ? `${persona.name} · ${persona.acct}` : 'select a customer'}
                </span>
              </div>
              <div className="session__actions">
                <span
                  className="session__mode"
                  title={
                    mode === null
                      ? 'Asking the orchestrator whether model calls are available.'
                      : mode === 'live'
                        ? `Real model calls${modelName ? ` · ${modelName}` : ''}`
                        : (status?.reason ?? 'The orchestrator is serving its offline script.')
                  }
                >
                  {modeLabel}
                </span>
                <button
                  type="button"
                  className="session__reset"
                  onClick={live.reset}
                  disabled={!persona || busy}
                >
                  RESET
                </button>
              </div>
            </div>

            {!persona && (
              <div className="session__placeholder">Select a customer profile above to begin.</div>
            )}

            {persona && busy && !started && (
              <div className="session__placeholder">Placing the contact…</div>
            )}

            {persona && suppressed && (
              <div className="session__placeholder">
                No outbound session opened for <b style={{ color: 'var(--navy)' }}>{persona.name}</b>.
                <br />
                <span className="session__aside">Segment Agent suppressed contact — see above.</span>
              </div>
            )}

            {persona && refused && !suppressed && (
              <div className="session__placeholder session__placeholder--refused">
                Contact refused by the compliance layer.
                <br />
                <span className="session__aside">
                  Requested time {String(live.contactHour).padStart(2, '0')}:00 is outside the CBUAE
                  window of {state?.contactWindow ?? '09:00–20:00'}.
                  <br />
                  The action is refused before placement. The agent cannot override it.
                </span>
              </div>
            )}

            {persona && started && !suppressed && !refused && (
              <>
                <div className="transcript" ref={scroller}>
                  {live.transcript.map((m, i) => (
                    <div className={`bubble bubble--${m.role}`} key={i}>
                      {m.role === 'agent' && (
                        <div className="bubble__who">ENBD COLLECTIONS AGENT</div>
                      )}
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
                    {!locked &&
                      persona.chips.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="composer__chip"
                          onClick={() => send(c)}
                          disabled={inputLocked}
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
                      placeholder={
                        locked
                          ? 'Session closed — transferred to a human officer.'
                          : 'Type as the customer…'
                      }
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') send(draft);
                      }}
                      disabled={inputLocked}
                    />
                    <button
                      type="button"
                      className="composer__send"
                      onClick={() => send(draft)}
                      disabled={inputLocked || !draft.trim()}
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
                {(state?.pipeline ?? PLACEHOLDER_PIPELINE).map((step, i) => (
                  <div
                    key={step.key}
                    className={
                      'pipeline__step' +
                      (step.status === 'done'
                        ? ' pipeline__step--done'
                        : step.status === 'active'
                          ? ' pipeline__step--active'
                          : '')
                    }
                  >
                    <div className="pipeline__mark">{step.status === 'done' ? '✓' : i + 1}</div>
                    <div className="pipeline__label">{step.label}</div>
                  </div>
                ))}
                <div
                  className={
                    'pipeline__escalation' + (escalated ? ' pipeline__escalation--fired' : '')
                  }
                >
                  {escalated
                    ? `ESCALATED TO FR OFFICER — reason: ${state?.escalationReason}. Autonomous handling has stopped.`
                    : 'Escalation branch — fires on hardship, dispute, legal representation, or a request to stop contact.'}
                </div>
              </div>
            </Panel>

            <Panel title="COMPLIANCE FLOOR">
              <div className="guards">
                {(state?.guards ?? []).map((g) => (
                  <div className={`guard guard--${g.status}`} key={g.id}>
                    <div className="guard__mark">{GUARD_MARK[g.status]}</div>
                    <div>
                      <div className="guard__title">{g.title}</div>
                      <div className="guard__detail">{g.detail}</div>
                    </div>
                  </div>
                ))}
                {!state && (
                  <div className="panel__empty" style={{ padding: '8px 0' }}>
                    Open a session to evaluate the compliance floor.
                  </div>
                )}
              </div>
            </Panel>

            {state?.officerPack && (
              <Panel title="REMEDIATION AGENT · OFFICER HANDOVER PACK">
                <div className="pack">
                  <p className="pack__intro">
                    The conversation stopped. The work did not. Prepared for an approving officer —{' '}
                    <b>never disclosed to the customer by any agent</b>.
                  </p>
                  <div className="kv kv--flush">
                    {[
                      ['CASE ID', state.officerPack.caseId],
                      ['STATUS', state.officerPack.status],
                      [
                        'EXTENDED PLAN',
                        `${state.officerPack.extendedPlanMonths} months · AED ${state.officerPack.extendedPlanMonthlyAed.toLocaleString('en-US')}/mo`,
                      ],
                      ['ARREARS WAIVER', `${state.officerPack.arrearsWaiverPct}% (vs 5% standard)`],
                      [
                        'SETTLEMENT FLOOR',
                        `AED ${state.officerPack.settlementFloorAed.toLocaleString('en-US')}`,
                      ],
                      ...(state.officerPack.eosbEstimateAed !== null
                        ? ([
                            [
                              'EOSB OFFSET',
                              `AED ${state.officerPack.eosbEstimateAed.toLocaleString('en-US')}`,
                            ],
                            [
                              'NET AFTER OFFSET',
                              `AED ${(state.officerPack.netAfterOffsetAed ?? 0).toLocaleString('en-US')}`,
                            ],
                          ] as [string, string][])
                        : []),
                    ].map(([k, v]) => (
                      <div className="kv__row" key={k}>
                        <span className="kv__k">{k}</span>
                        <span className="kv__v">{v}</span>
                      </div>
                    ))}
                  </div>
                  <p className="pack__note">
                    These terms were never available to the negotiation agent and were never spoken
                    aloud. A more generous offer is not the response to hardship — a person is.
                  </p>
                </div>
              </Panel>
            )}

            <Panel title="TOOL CALL TRACE">
              <div className="trace">
                {(state?.trace.length ?? 0) === 0 && (
                  <div className="panel__empty" style={{ padding: '8px 0' }}>
                    No tool calls yet.
                  </div>
                )}
                {(state?.trace ?? []).map((t, i) => (
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
          {mode === 'live'
            ? 'The model, its instructions, its tool-calling decisions and its language are live.'
            : 'This session is running the orchestrator’s offline script, not a live model — the tool calls and panels are driven by the same server-side handlers, but the agent’s language is scripted.'}{' '}
          The model, the tools and the session state all run server-side; the browser holds no
          credentials and computes none of the panels. Account data, payment processing and letter
          issuance are simulated rather than hitting a core banking system.
        </p>
      </div>
    </div>
  );
}

/** Rendered before a session exists, so the panel is never empty. */
const PLACEHOLDER_PIPELINE = [
  { key: 'identify', label: 'Identify & disclose', status: 'pending' },
  { key: 'verify', label: 'Verify account', status: 'pending' },
  { key: 'assess', label: 'Assess segment & intent', status: 'pending' },
  { key: 'resolve', label: 'Negotiate / resolve', status: 'pending' },
  { key: 'confirm', label: 'Confirm & log', status: 'pending' },
  { key: 'close', label: 'Close', status: 'pending' },
] as const;

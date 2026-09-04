import { useEffect, useRef } from 'react';

import { Hero, Meter, Panel } from '../components/primitives';
import { BUCKETS, dpdToPct } from '../data/simulation';
import { useSimulation } from '../hooks/useSimulation';
import { AGENT_COLORS, type AgentKey } from '../shared/colors';

export function JourneyView() {
  const sim = useSimulation();
  const feed = useRef<HTMLDivElement>(null);

  // Follow the run: each event should arrive in view without anyone scrolling.
  useEffect(() => {
    const el = feed.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sim.events.length]);

  let left = 0;
  const buckets = BUCKETS.map((b, i) => {
    const placed = { ...b, left, isLegal: i === 4, band: i % 2 === 1 };
    left += b.w;
    return placed;
  });

  const tallyEntries = Object.entries(sim.tally) as [AgentKey, number][];
  const maxTally = Math.max(1, ...tallyEntries.map(([, v]) => v));

  return (
    <div>
      <Hero
        eyebrow="05 · PORTFOLIO SIMULATION"
        title="One account, ninety days, no human touch until it needs one."
        lede="The same contact scale from the collections playbook — day 0 through day 90 — executed by the agent fleet. Watch which agent acts, when, and where the escalation lands."
      />

      <div className="shell shell--hero" style={{ padding: '40px var(--gutter) 24px' }}>
        <div className="sim-controls">
          <button type="button" className="btn-primary" onClick={sim.run}>
            Run simulation
          </button>
          <button type="button" className="btn-secondary" onClick={sim.reset}>
            Reset
          </button>
          <div className="sim-controls__status">STATUS · {sim.status}</div>
        </div>

        <div className="track-frame">
          <div className="track-frame__head">
            <div className="track-frame__label">DELINQUENCY TRACK — DAYS PAST DUE</div>
            <div className="track-frame__readout">
              <div className="track-frame__dpd">{sim.dpd}</div>
              <div className="track-frame__unit">DPD</div>
            </div>
          </div>
          <div className="track">
            {buckets.map((b) => (
              <div
                key={b.name}
                className={'track__bucket' + (b.isLegal ? ' track__bucket--legal' : '')}
                style={{
                  left: `${b.left}%`,
                  width: `${b.w}%`,
                  background: b.isLegal ? 'var(--tint-red)' : b.band ? 'var(--band)' : 'var(--surface)',
                }}
              >
                <div className="track__bucket-name">{b.name}</div>
                <div className="track__bucket-range">{b.range}</div>
              </div>
            ))}
            <div className="track__marker" style={{ left: `${dpdToPct(sim.dpd)}%` }} />
          </div>
        </div>
      </div>

      <div className="shell shell--hero" style={{ padding: '0 var(--gutter) 88px' }}>
        <div className="journey-grid">
          <div className="stack">
            <Panel title="ACCOUNT">
              <div className="kv">
                {[
                  { k: 'CUSTOMER', v: 'Rahul Menon' },
                  { k: 'PRODUCT', v: 'Credit Card — Platinum' },
                  { k: 'BALANCE', v: 'AED 18,400' },
                  { k: 'SALARY TRANSFER', v: 'Yes — ENBD' },
                  { k: 'CLUSTER', v: sim.cluster },
                  { k: 'SELF-CURE SCORE', v: sim.selfcure },
                  { k: 'PD BAND', v: sim.pd },
                  { k: 'CURRENT DPD', v: String(sim.dpd) },
                  { k: 'STATUS', v: sim.acctStatus },
                ].map((row) => (
                  <div className="kv__row" key={row.k}>
                    <span className="kv__k">{row.k}</span>
                    <span className="kv__v">{row.v}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="AGENT ACTIVITY THIS RUN">
              <div className="tally">
                {tallyEntries.length === 0 && (
                  <div className="panel__empty">No agent actions recorded.</div>
                )}
                {tallyEntries.map(([name, count]) => (
                  <Meter
                    key={name}
                    label={name}
                    value={String(count)}
                    width={`${(count / maxTally) * 100}%`}
                    color={AGENT_COLORS[name]}
                  />
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="EVENT FEED">
            <div className="feed" ref={feed}>
              {sim.events.length === 0 && (
                <div className="feed__empty">Press run to start the simulation.</div>
              )}
              {sim.events.map((e, i) => (
                <div className="feed__row" key={i}>
                  <div className="feed__day">{e.d < 0 ? `D${e.d}` : `D+${e.d}`}</div>
                  <div className="feed__agent" style={{ color: AGENT_COLORS[e.a] }}>
                    {e.a}
                  </div>
                  <div className="feed__msg">{e.m}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';

import { SIM_SCRIPT, SIM_TICK_MS, type SimEvent } from '../data/simulation';
import type { AgentKey } from '../shared/colors';

export type SimStatus = 'idle' | 'running' | 'complete';

export interface SimState {
  events: SimEvent[];
  status: SimStatus;
  dpd: number;
  tally: Partial<Record<AgentKey, number>>;
  cluster: string;
  selfcure: string;
  pd: string;
  acctStatus: string;
}

const IDLE: SimState = {
  events: [],
  status: 'idle',
  dpd: 0,
  tally: {},
  cluster: '—',
  selfcure: '—',
  pd: '—',
  acctStatus: 'Current',
};

/** Account state after `count` events of the script have played. */
function project(events: SimEvent[]): Omit<SimState, 'events' | 'status'> {
  const last = events[events.length - 1];
  if (!last) return { dpd: 0, tally: {}, cluster: '—', selfcure: '—', pd: '—', acctStatus: 'Current' };

  const tally: Partial<Record<AgentKey, number>> = {};
  for (const e of events) {
    if (e.a !== 'SYSTEM') tally[e.a] = (tally[e.a] ?? 0) + 1;
  }

  // Scores appear once the Segment Agent has pulled them, and are re-scored
  // when the Supervisor detects the broken promise.
  const scored = events.length >= 2;
  const rescored = events.length >= 10;

  const acctStatus =
    last.d >= 86
      ? 'Hardship — human FR'
      : last.d >= 26
        ? 'Arrangement in force'
        : last.d >= 15
          ? 'PTP captured'
          : last.d >= 1
            ? 'In treatment'
            : 'Current';

  return {
    dpd: Math.max(0, last.d),
    tally,
    cluster: scored ? 'Cluster 2 — moderate' : '—',
    pd: scored ? 'Moderate' : '—',
    selfcure: rescored ? '0.18 (re-scored)' : scored ? '0.41' : '—',
    acctStatus,
  };
}

export interface Simulation extends SimState {
  run: () => void;
  reset: () => void;
}

export function useSimulation(): Simulation {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<SimStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const reset = useCallback(() => {
    stop();
    setCount(0);
    setStatus('idle');
  }, [stop]);

  const run = useCallback(() => {
    stop();
    setCount(0);
    setStatus('running');
  }, [stop]);

  // Advancing in an effect keeps the timer honest across resets and unmounts.
  useEffect(() => {
    if (status !== 'running') return;
    if (count >= SIM_SCRIPT.length) {
      setStatus('complete');
      return;
    }
    timer.current = setTimeout(() => setCount((c) => c + 1), count === 0 ? 0 : SIM_TICK_MS);
    return stop;
  }, [status, count, stop]);

  if (status === 'idle') return { ...IDLE, run, reset };

  const events = SIM_SCRIPT.slice(0, count);
  return { events, status, ...project(events), run, reset };
}

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentReply, AgentStatus } from '../shared/api';
import { offlineTurn } from '../shared/fallback';
import type { Persona } from '../shared/personas';
import type { ToolCall } from '../shared/tools';

export type TranscriptRole = 'agent' | 'cust' | 'esc' | 'sys';

export interface TranscriptEntry {
  role: TranscriptRole;
  text: string;
}

export type SessionMode = 'live' | 'offline';

export const PIPELINE_STEPS = [
  { k: 'identify', label: 'Identify & disclose' },
  { k: 'verify', label: 'Verify account' },
  { k: 'assess', label: 'Assess segment & intent' },
  { k: 'resolve', label: 'Negotiate / resolve' },
  { k: 'confirm', label: 'Confirm & log' },
  { k: 'close', label: 'Close' },
] as const;

export type StageKey = (typeof PIPELINE_STEPS)[number]['k'];

const STAGE_ORDER: StageKey[] = PIPELINE_STEPS.map((s) => s.k);

/** Which conversation stage each tool call implies once it has been made. */
const STAGE_FOR_TOOL: Record<string, StageKey> = {
  get_account_status: 'verify',
  get_segment_scores: 'assess',
  get_offer_matrix: 'resolve',
  log_promise_to_pay: 'confirm',
  initiate_payment: 'confirm',
  escalate_to_human: 'close',
};

const RESOLVING_TOOLS = new Set(['log_promise_to_pay', 'initiate_payment']);

interface Session {
  persona: Persona | null;
  started: boolean;
  busy: boolean;
  transcript: TranscriptEntry[];
  toolCalls: ToolCall[];
  /** Opaque model history, echoed back to the server each turn. */
  wire: unknown[];
  /** Cursor into the persona's offline script. */
  offlineStep: number;
  /** Null until the agent's opening turn has been checked. */
  disclosed: boolean | null;
  mode: SessionMode;
}

const emptySession = (persona: Persona | null, mode: SessionMode): Session => ({
  persona,
  started: false,
  busy: false,
  transcript: [],
  toolCalls: [],
  wire: [],
  offlineStep: 0,
  disclosed: null,
  mode,
});

/** Did the agent identify Emirates NBD and state the purpose of contact? */
const checkDisclosure = (text: string, opening: boolean): boolean => {
  const named = /emirates nbd/i.test(text);
  if (!opening) return named;
  return named && /(outstanding|overdue|past due|payment|amount due|collect)/i.test(text);
};

export interface LiveAgentState {
  persona: Persona | null;
  started: boolean;
  busy: boolean;
  transcript: TranscriptEntry[];
  toolCalls: ToolCall[];
  mode: SessionMode;
  /** Null while the server has not answered the capability probe yet. */
  serverStatus: AgentStatus | null;
  stage: StageKey;
  stageIndex: number;
  escalated: boolean;
  escReason: string | null;
  resolved: boolean;
  disclosed: boolean | null;
  usedTool: (name: string) => boolean;
  pickPersona: (p: Persona) => void;
  start: () => void;
  say: (text: string) => void;
  reset: () => void;
}

export function useLiveAgent(): LiveAgentState {
  const [session, setSession] = useState<Session>(() => emptySession(null, 'offline'));
  const [serverStatus, setServerStatus] = useState<AgentStatus | null>(null);
  /** Read inside async callbacks, which must not close over a stale session. */
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Probe once: the view needs to say which mode it is in before anyone clicks.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let status: AgentStatus = {
        live: false,
        model: null,
        reason: 'No agent endpoint on this host — running the offline script.',
      };
      try {
        const res = await fetch('/api/agent/status');
        if (res.ok) status = (await res.json()) as AgentStatus;
      } catch {
        // Left as the offline default.
      }
      if (cancelled) return;
      setServerStatus(status);
      setSession((s) => ({ ...s, mode: status.live ? 'live' : 'offline' }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultMode = (): SessionMode => (serverStatus?.live ? 'live' : 'offline');

  const pickPersona = useCallback((p: Persona) => {
    if (sessionRef.current.busy) return;
    setSession((s) => emptySession(p, s.mode));
  }, []);

  const reset = useCallback(() => {
    setSession((s) => emptySession(s.persona, s.mode));
  }, []);

  /**
   * Runs one turn. `say` is null for the opening turn.
   *
   * Tries the server first when it is available; a failure demotes this session
   * to the offline script rather than dead-ending the demo, and says so in the
   * transcript.
   */
  const runTurn = useCallback(async (say: string | null) => {
    const start = sessionRef.current;
    const persona = start.persona;
    if (!persona || start.busy) return;

    setSession((s) => ({
      ...s,
      busy: true,
      started: true,
      transcript: say ? [...s.transcript, { role: 'cust', text: say }] : s.transcript,
      wire: say ? s.wire : [],
      toolCalls: say ? s.toolCalls : [],
    }));

    const applyAgentTurn = (
      reply: string,
      toolCalls: ToolCall[],
      wire: unknown[] | null,
      mode: SessionMode,
      notice?: string,
    ): void => {
      setSession((s) => {
        const opening = !s.transcript.some((t) => t.role === 'agent');
        const transcript: TranscriptEntry[] = [...s.transcript];
        if (notice) transcript.push({ role: 'sys', text: notice });
        transcript.push({ role: 'agent', text: reply });

        const escalating = toolCalls.some((t) => t.name === 'escalate_to_human');
        if (escalating) {
          transcript.push({
            role: 'esc',
            text: 'TRANSFERRED TO HUMAN FR OFFICER — autonomous handling ends here.',
          });
        }

        return {
          ...s,
          busy: false,
          mode,
          transcript,
          toolCalls: [...s.toolCalls, ...toolCalls],
          wire: wire ?? s.wire,
          disclosed:
            s.disclosed === null || opening ? checkDisclosure(reply, opening) : s.disclosed,
        };
      });
    };

    const runOffline = (step: number, notice?: string): void => {
      const turn = offlineTurn(persona, step, say);
      setSession((prev) => ({ ...prev, offlineStep: turn.step }));
      applyAgentTurn(turn.reply, turn.toolCalls, null, 'offline', notice);
    };

    if (start.mode !== 'live') {
      runOffline(say ? start.offlineStep : 0);
      return;
    }

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: persona.id,
          messages: say ? start.wire : [],
          ...(say ? { say } : {}),
        }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error || `Agent endpoint returned ${res.status}.`);
      }
      const data = (await res.json()) as AgentReply;
      applyAgentTurn(data.reply, data.toolCalls, data.messages, 'live');
    } catch (err) {
      const why = err instanceof Error ? err.message : 'Model call failed.';
      // Demote the session rather than the whole app: a later turn should not
      // retry a call we already know is failing. Resume the script roughly
      // where the live conversation had reached.
      const step = countAgentTurns(sessionRef.current.transcript);
      setSession((s) => ({ ...s, mode: 'offline' }));
      runOffline(step, `Model call failed — ${why} Continuing on the offline script.`);
    }
  }, []);

  const start = useCallback(() => {
    void runTurn(null);
  }, [runTurn]);

  const say = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const s = sessionRef.current;
      if (!s.started || s.busy || hasEscalated(s.toolCalls)) return;
      void runTurn(trimmed);
    },
    [runTurn],
  );

  const escalation = session.toolCalls.find((t) => t.name === 'escalate_to_human');
  const stage = deriveStage(session.toolCalls);

  return {
    persona: session.persona,
    started: session.started,
    busy: session.busy,
    transcript: session.transcript,
    toolCalls: session.toolCalls,
    mode: session.persona ? session.mode : defaultMode(),
    serverStatus,
    stage,
    stageIndex: STAGE_ORDER.indexOf(stage),
    escalated: Boolean(escalation),
    escReason: escalation?.reason ?? null,
    resolved: session.toolCalls.some((t) => RESOLVING_TOOLS.has(t.name)),
    disclosed: session.disclosed,
    usedTool: (name) => session.toolCalls.some((t) => t.name === name),
    pickPersona,
    start,
    say,
    reset,
  };
}

const countAgentTurns = (transcript: TranscriptEntry[]): number =>
  transcript.filter((t) => t.role === 'agent').length;

const hasEscalated = (calls: ToolCall[]): boolean =>
  calls.some((t) => t.name === 'escalate_to_human');

/** The stage implied by the last stage-moving tool the agent called. */
function deriveStage(calls: ToolCall[]): StageKey {
  let stage: StageKey = 'identify';
  for (const call of calls) {
    const next = STAGE_FOR_TOOL[call.name];
    if (next) stage = next;
  }
  return stage;
}

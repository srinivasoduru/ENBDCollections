import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ApiError,
  CreateSessionResponse,
  SessionState,
  StatusResponse,
  TurnResponse,
} from '../shared/api';
import type { Persona } from '../shared/personas';

/**
 * Transport for the Live Agent view.
 *
 * This hook derives nothing. Pipeline stage, guardrail statuses, escalation and
 * the tool trace all arrive from the orchestrator; the browser sends a string
 * and renders what comes back. The transcript is accumulated locally because it
 * is presentation — the authoritative record is the server's audit trace.
 */

export type TranscriptRole = 'agent' | 'cust' | 'esc' | 'sys';

export interface TranscriptEntry {
  role: TranscriptRole;
  text: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(detail?.error || `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

export interface LiveAgentClient {
  persona: Persona | null;
  /** Hour of day the contact is attempted, driving the eligibility check. */
  contactHour: number;
  setContactHour: (hour: number) => void;
  /** Open a suppressed account's conversation anyway, for demonstration. */
  override: () => void;
  started: boolean;
  busy: boolean;
  transcript: TranscriptEntry[];
  /** Null until a session exists; the panels render from this. */
  state: SessionState | null;
  status: StatusResponse | null;
  pickPersona: (p: Persona) => void;
  say: (text: string) => void;
  reset: () => void;
}

export function useLiveAgent(): LiveAgentClient {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [contactHour, setHour] = useState(14);
  const overrideRef = useRef(false);

  // Read inside async callbacks, which must not close over a stale value.
  const sessionId = useRef<string | null>(null);
  const busyRef = useRef(false);
  const setBusyBoth = (v: boolean): void => {
    busyRef.current = v;
    setBusy(v);
  };

  // Probe once so the badge can say which mode the room is in before anyone clicks.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let probed: StatusResponse = {
        live: false,
        model: null,
        reason: 'No orchestrator on this host — sessions run the offline script.',
      };
      try {
        const res = await fetch('/api/status');
        if (res.ok) probed = (await res.json()) as StatusResponse;
      } catch {
        // Left as the offline default.
      }
      if (!cancelled) setStatus(probed);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearSession = useCallback((next: Persona | null) => {
    sessionId.current = null;
    overrideRef.current = false;
    setPersona(next);
    setState(null);
    setTranscript([]);
    setBusyBoth(false);
  }, []);

  /**
   * Opening happens as soon as a persona is chosen, because the interesting
   * outcomes — suppression and a refused contact — are decided before anyone
   * would press a button, and the panels have to show them.
   */
  const openFor = useCallback(
    (p: Persona, hour: number, override: boolean) => {
      setBusyBoth(true);
      void (async () => {
        try {
          const data = await postJson<CreateSessionResponse>('/api/session', {
            personaId: p.id,
            contactHour: hour,
            ...(override ? { override: true } : {}),
          });
          sessionId.current = data.sessionId;
          setState(data.state);
          setTranscript(
            data.openingTurn
              ? [
                  ...(data.notice ? [{ role: 'sys' as const, text: data.notice }] : []),
                  { role: 'agent' as const, text: data.openingTurn },
                ]
              : [],
          );
        } catch (err) {
          const why = err instanceof Error ? err.message : 'Could not open the session.';
          setTranscript([{ role: 'sys', text: `Could not open the session — ${why}` }]);
        } finally {
          setBusyBoth(false);
        }
      })();
    },
    [],
  );

  const pickPersona = useCallback(
    (p: Persona) => {
      if (busyRef.current) return;
      clearSession(p);
      openFor(p, contactHour, false);
    },
    [clearSession, contactHour, openFor],
  );

  const reset = useCallback(() => {
    if (busyRef.current || !persona) return;
    clearSession(persona);
    openFor(persona, contactHour, false);
  }, [clearSession, contactHour, openFor, persona]);

  /** Moving the clock re-decides the contact, which is the point of the control. */
  const setContactHour = useCallback(
    (hour: number) => {
      setHour(hour);
      if (busyRef.current || !persona) return;
      const override = overrideRef.current;
      clearSession(persona);
      overrideRef.current = override;
      openFor(persona, hour, override);
    },
    [clearSession, openFor, persona],
  );

  const override = useCallback(() => {
    if (busyRef.current || !persona) return;
    clearSession(persona);
    overrideRef.current = true;
    openFor(persona, contactHour, true);
  }, [clearSession, contactHour, openFor, persona]);

  /** Appends the agent's turn, plus any notice and the escalation banner. */
  const absorb = useCallback((reply: string, next: SessionState, notice?: string) => {
    setState((prev) => {
      const wasEscalated = prev?.escalated ?? false;
      setTranscript((t) => {
        const out = [...t];
        if (notice) out.push({ role: 'sys', text: notice });
        out.push({ role: 'agent', text: reply });
        if (next.escalated && !wasEscalated) {
          out.push({
            role: 'esc',
            text: 'TRANSFERRED TO HUMAN FR OFFICER — autonomous handling ends here.',
          });
        }
        return out;
      });
      return next;
    });
  }, []);

  const say = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const id = sessionId.current;
      if (!trimmed || !id || busyRef.current) return;
      setBusyBoth(true);
      setTranscript((t) => [...t, { role: 'cust', text: trimmed }]);
      void (async () => {
        try {
          const data = await postJson<TurnResponse>('/api/turn', { sessionId: id, text: trimmed });
          absorb(data.reply, data.state, data.notice);
        } catch (err) {
          const why = err instanceof Error ? err.message : 'The turn failed.';
          setTranscript((t) => [...t, { role: 'sys', text: `Turn failed — ${why}` }]);
        } finally {
          setBusyBoth(false);
        }
      })();
    },
    [absorb],
  );

  return {
    persona,
    started: state !== null,
    busy,
    transcript,
    state,
    status,
    contactHour,
    setContactHour,
    override,
    pickPersona,
    say,
    reset,
  };
}

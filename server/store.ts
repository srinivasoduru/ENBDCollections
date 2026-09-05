import { randomUUID } from 'node:crypto';

import type Anthropic from '@anthropic-ai/sdk';

import type { EscalationCategory, SessionMode, StageKey, TraceEntry } from '../src/shared/api';
import type { OutputRule } from './compliance/output';
import type { ToolCall } from './tools';

/**
 * Server-owned session state.
 *
 * The browser holds none of this. In particular the model history lives here,
 * not in the client — a client-held transcript can be tampered with, which
 * would let a customer rewrite what they said on a previous turn.
 */
export interface Session {
  id: string;
  personaId: string;
  createdAt: number;
  updatedAt: number;
  mode: SessionMode;
  model: string | null;

  /** Anthropic message history for this conversation. */
  messages: Anthropic.MessageParam[];
  toolCalls: ToolCall[];

  stage: StageKey;
  escalated: boolean;
  escalationReason: EscalationCategory | null;
  escalationVia: 'model' | 'script' | 'preflight' | 'postgen' | 'system' | null;
  blockedRule: OutputRule | null;
  resolved: boolean;

  /**
   * Amounts the agent is allowed to state, accumulated as the conversation
   * runs: every number the offer matrix actually served, and every figure the
   * customer proposed. The post-generation gate validates against these.
   */
  servedAmounts: Set<number>;
  customerAmounts: Set<number>;
  disclosed: boolean | null;
  locked: boolean;

  /** Cursor into the offline script, used when mode is 'offline'. */
  scriptStep: number;
  agentTurns: number;

  /** Guards against two turns being processed on one session concurrently. */
  inFlight: boolean;

  audit: TraceEntry[];
  seq: number;
}

export interface SessionStore {
  create(personaId: string, mode: SessionMode, model: string | null): Session;
  get(id: string): Session | undefined;
  save(session: Session): void;
  delete(id: string): void;
  /** Number of live sessions — for the health endpoint. */
  size(): number;
}

/** Sessions older than this are swept. A pitch never runs this long. */
const TTL_MS = 6 * 60 * 60 * 1000;

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, Session>();

  create(personaId: string, mode: SessionMode, model: string | null): Session {
    this.sweep();
    const now = Date.now();
    const session: Session = {
      // Unguessable: the trace endpoint is addressed by this id, and a
      // sequential id would let anyone enumerate other conversations.
      id: randomUUID(),
      personaId,
      createdAt: now,
      updatedAt: now,
      mode,
      model,
      messages: [],
      toolCalls: [],
      stage: 'identify',
      escalated: false,
      escalationReason: null,
      escalationVia: null,
      blockedRule: null,
      resolved: false,
      servedAmounts: new Set(),
      customerAmounts: new Set(),
      disclosed: null,
      locked: false,
      scriptStep: 0,
      agentTurns: 0,
      inFlight: false,
      audit: [],
      seq: 0,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  save(session: Session): void {
    session.updatedAt = Date.now();
    this.sessions.set(session.id, session);
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  size(): number {
    return this.sessions.size;
  }

  private sweep(): void {
    const cutoff = Date.now() - TTL_MS;
    for (const [id, s] of this.sessions) {
      if (s.updatedAt < cutoff) this.sessions.delete(id);
    }
  }
}

/** `Omit` over a union collapses it; this distributes across the members. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Appends an audit entry, stamping sequence and time. */
export function appendTrace(
  session: Session,
  entry: DistributiveOmit<TraceEntry, 'seq' | 'at'>,
): void {
  session.audit.push({
    ...entry,
    seq: ++session.seq,
    at: new Date().toISOString(),
  } as TraceEntry);
}

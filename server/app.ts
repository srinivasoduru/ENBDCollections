import express, { type Request, type Response, type NextFunction } from 'express';

import type {
  CreateSessionResponse,
  StatusResponse,
  TraceResponse,
  TurnResponse,
} from '../src/shared/api';
import { ApiError, agentStatus, openSession, runTurn } from './agent';
import type { Classifier } from './compliance/classifier';
import { buildState } from './state';
import { InMemorySessionStore, appendTrace, type Session, type SessionStore } from './store';

/**
 * The orchestrator API.
 *
 * Built as a mountable Express app so it can run standalone (`npm run server`,
 * fully drivable from curl with no front end) and also mount as Vite middleware,
 * which keeps `npm run dev` a single process with no CORS in the way.
 */

const MAX_TEXT_LENGTH = 2000;
const JSON_LIMIT = '128kb';

export interface AppOptions {
  store?: SessionStore;
  /** Overridable so tests can screen without a network call. */
  classifier?: Classifier | null;
}

export function createApp({ store = new InMemorySessionStore(), classifier }: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_LIMIT }));

  app.get('/api/status', (_req, res: Response<StatusResponse>) => {
    res.json(agentStatus());
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, sessions: store.size() });
  });

  app.post(
    '/api/session',
    asyncRoute(async (req, res: Response<CreateSessionResponse>) => {
      const personaId = requireString(req.body?.personaId, 'personaId');
      const status = agentStatus();
      const session = store.create(personaId, status.live ? 'live' : 'offline', status.model);

      appendTrace(session, {
        kind: 'session_created',
        personaId,
        mode: session.mode,
      });

      try {
        const { reply, notice } = await openSession(session);
        store.save(session);
        res.status(201).json({
          sessionId: session.id,
          openingTurn: reply,
          state: buildState(session),
          ...(notice ? { notice } : {}),
        });
      } catch (err) {
        // A session that could not open is not left behind as a live handle.
        store.delete(session.id);
        throw err;
      }
    }),
  );

  app.post(
    '/api/turn',
    asyncRoute(async (req, res: Response<TurnResponse>) => {
      const sessionId = requireString(req.body?.sessionId, 'sessionId');
      const text = requireString(req.body?.text, 'text');
      if (text.length > MAX_TEXT_LENGTH) {
        throw new ApiError('Customer text is too long.', 413, 'text_too_long');
      }

      const session = mustFind(store, sessionId);

      // One turn at a time per session: two concurrent calls would interleave
      // the model history and corrupt the trace ordering.
      if (session.inFlight) {
        throw new ApiError('A turn is already in progress for this session.', 409, 'turn_in_flight');
      }
      session.inFlight = true;

      try {
        const { reply, notice } = await runTurn(session, text, classifier !== undefined ? { classifier } : {});
        const state = buildState(session);
        res.json({
          reply,
          state,
          trace: state.trace,
          escalated: state.escalated,
          locked: state.locked,
          ...(notice ? { notice } : {}),
        });
      } finally {
        session.inFlight = false;
        store.save(session);
      }
    }),
  );

  app.get('/api/session/:id', (req, res) => {
    const session = mustFind(store, req.params.id);
    res.json({ state: buildState(session) });
  });

  app.get('/api/session/:id/trace', (req, res: Response<TraceResponse>) => {
    const session = mustFind(store, req.params.id);
    // Note: unauthenticated by design for the demo. Session ids are random
    // UUIDs so they cannot be enumerated, but in production this endpoint sits
    // behind auth — it returns a full customer conversation.
    res.json({
      sessionId: session.id,
      personaId: session.personaId,
      createdAt: new Date(session.createdAt).toISOString(),
      mode: session.mode,
      model: session.model,
      escalated: session.escalated,
      locked: session.locked,
      entries: session.audit,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'No such endpoint.', code: 'not_found' });
  });

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const status = statusOf(err);
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    if (status >= 500) console.error('[orchestrator]', err);
    res.status(status).json({
      error: message,
      ...(err instanceof ApiError && err.code ? { code: err.code } : {}),
    });
  });

  return app;
}

/**
 * Body-parser rejections (malformed JSON, oversized body) carry their own
 * status; without this they would surface as 500s and read like server faults.
 */
function statusOf(err: unknown): number {
  if (err instanceof ApiError) return err.status;
  const status = (err as { status?: unknown; statusCode?: unknown } | null)?.status
    ?? (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
}

function mustFind(store: SessionStore, id: string): Session {
  const session = store.get(id);
  if (!session) throw new ApiError('No such session.', 404, 'session_not_found');
  return session;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(`${field} is required.`, 400, 'invalid_request');
  }
  return value.trim();
}

/** Express 5 forwards rejected promises, but being explicit keeps intent clear. */
const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

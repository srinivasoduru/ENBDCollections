import type { IncomingMessage, ServerResponse } from 'node:http';

import { AgentRequestError, agentStatus, handleAgentTurn } from './agent';

/**
 * Mounts the two Live Agent endpoints onto a Vite dev or preview server, so
 * `npm run dev` and `npm run preview` both serve the app and its model proxy
 * from one process.
 *
 *   GET  /api/agent/status  → whether real model calls are available
 *   POST /api/agent         → run one customer turn
 */

const MAX_BODY_BYTES = 256 * 1024;

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new AgentRequestError('Request body too large.', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

type Next = (err?: unknown) => void;

export async function agentMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: Next,
): Promise<void> {
  const url = (req.url ?? '').split('?')[0];

  if (url === '/api/agent/status' && req.method === 'GET') {
    sendJson(res, 200, agentStatus());
    return;
  }

  if (url !== '/api/agent') {
    next();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Use POST.' });
    return;
  }

  try {
    if (!agentStatus().live) {
      throw new AgentRequestError('Model calls are not configured on this server.', 503);
    }
    const raw = await readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AgentRequestError('Body is not valid JSON.');
    }
    sendJson(res, 200, await handleAgentTurn(parsed));
  } catch (err) {
    const status = err instanceof AgentRequestError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    // Logged for the operator; the client falls back to the offline script.
    if (status >= 500) console.error('[agent]', err);
    sendJson(res, status, { error: message });
  }
}

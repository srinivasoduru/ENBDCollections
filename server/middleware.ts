import type { Connect } from 'vite';

import { createApp } from './app';

/**
 * Mounts the orchestrator into Vite's dev and preview servers.
 *
 * An Express app is itself a `(req, res, next)` handler, so the same app that
 * runs standalone drops straight into Vite's connect stack. One process, no
 * CORS, nothing extra to start in a meeting room.
 */
export const orchestratorMiddleware = (): Connect.NextHandleFunction =>
  createApp() as unknown as Connect.NextHandleFunction;

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type PluginOption } from 'vite';

import { orchestratorMiddleware } from './server/middleware';

/**
 * Serves the orchestrator alongside the app, in both `vite` and `vite preview`,
 * so the demo runs from a single process. The same Express app also runs
 * standalone via `npm run server`.
 */
const orchestrator = (): PluginOption => {
  // One app instance, so sessions survive across requests in dev.
  const handler = orchestratorMiddleware();
  return {
    name: 'enbd-orchestrator',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
};

export default defineConfig(({ mode }) => {
  // The credential is read here and used only by the server middleware. It is
  // deliberately not passed through `define`, so it never enters the client
  // bundle — the browser only ever learns whether live calls are available.
  const env = loadEnv(mode, process.cwd(), ['ANTHROPIC_', 'AGENT_']);
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'AGENT_MODEL']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), orchestrator()],
    server: { port: 5173 },
    preview: { port: 4173 },
  };
});

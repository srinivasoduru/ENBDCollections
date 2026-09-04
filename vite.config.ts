import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type PluginOption } from 'vite';

import { agentMiddleware } from './server/middleware';

/**
 * Serves the Live Agent model proxy alongside the app, in both `vite` and
 * `vite preview`, so the demo runs from a single process.
 */
const agentApi = (): PluginOption => ({
  name: 'enbd-agent-api',
  configureServer(server) {
    server.middlewares.use(agentMiddleware);
  },
  configurePreviewServer(server) {
    server.middlewares.use(agentMiddleware);
  },
});

export default defineConfig(({ mode }) => {
  // The credential is read here and used only by the server middleware. It is
  // deliberately not passed through `define`, so it never enters the client
  // bundle — the browser only ever learns whether live calls are available.
  const env = loadEnv(mode, process.cwd(), ['ANTHROPIC_', 'AGENT_']);
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'AGENT_MODEL']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), agentApi()],
    server: { port: 5173 },
    preview: { port: 4173 },
  };
});

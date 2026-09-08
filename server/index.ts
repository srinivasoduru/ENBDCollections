import { createApp } from './app';
import { agentStatus } from './agent';

/**
 * Standalone entry point — `npm run server`.
 *
 * The API is fully drivable from curl with no front end running, which is the
 * property the spec asks for. In dev the same app is mounted as Vite middleware
 * instead, so there is only one process to start.
 */
const port = Number(process.env.PORT ?? 3001);

createApp().listen(port, () => {
  const status = agentStatus();
  console.log(`orchestrator listening on http://localhost:${port}`);
  console.log(
    status.live
      ? `model: ${status.model}`
      : `model: unavailable — ${status.reason}`,
  );
});

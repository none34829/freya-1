import { startAgentService } from './lib/agent-service.js';
import { getConfig } from './config.js';
import { initTracing, shutdownTracing } from './tracing.js';

async function main() {
  const config = getConfig();

  await initTracing();

  console.info('LiveKit Config Check:', {
    url: config.LIVEKIT_URL ? '✓ Set' : '✗ Missing',
    apiKey: config.LIVEKIT_API_KEY ? '✓ Set' : '✗ Missing',
    apiSecret: config.LIVEKIT_API_SECRET ? '✓ Set' : '✗ Missing'
  });

  await startAgentService();

  if (config.LIVEKIT_URL && config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET) {
    console.info('✓ LiveKit credentials configured');
    console.info('To enable voice chat, run in a separate terminal:');
    console.info('  pnpm --filter agent dev:agent');
    console.info('Agent service ready - HTTP API listening on port 4001');
  } else {
    console.info('LiveKit credentials not configured - voice functionality will use HTTP fallback');
  }
}

async function gracefulShutdown() {
  await shutdownTracing();
}

process.on('SIGTERM', async () => {
  await gracefulShutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await gracefulShutdown();
  process.exit(0);
});

main().catch((err) => {
  console.error('Agent service failed to start', err);
  gracefulShutdown().finally(() => process.exit(1));
});

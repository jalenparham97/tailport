import {
  DEFAULT_DOMAIN,
  DEFAULT_ROUTER_PORT,
  DEFAULT_TUNNEL_NAME,
  ensureConfigFile,
} from '../../lib/config';
import { enableTunnel } from '../../lib/cloudflared';
import { startRouter } from '../../router/server';

export async function runStartCommand(): Promise<void> {
  await ensureConfigFile();

  if (DEFAULT_TUNNEL_NAME) {
    console.log(
      `[tailport] starting cloudflared tunnel "${DEFAULT_TUNNEL_NAME}"...`,
    );
  } else {
    console.log(
      `[tailport] starting cloudflared quick tunnel on port ${DEFAULT_ROUTER_PORT}...`,
    );
  }

  const tunnel = await enableTunnel(DEFAULT_ROUTER_PORT, DEFAULT_TUNNEL_NAME);
  const runtime = await startRouter(DEFAULT_ROUTER_PORT, DEFAULT_DOMAIN);

  if (DEFAULT_TUNNEL_NAME && DEFAULT_DOMAIN) {
    console.log(`[tailport] tunnel URL base is https://*.${DEFAULT_DOMAIN}`);
  } else if (!DEFAULT_TUNNEL_NAME) {
    console.log(
      '[tailport] check cloudflared output above for your temporary URL',
    );
  }
  console.log('[tailport] press Ctrl+C to stop');

  const shutdown = (): void => {
    tunnel.stop();
    runtime.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise<void>(() => {
    // Keep process running while Bun.serve handles requests.
  });
}

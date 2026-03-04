import { register, resolvePending, unregister } from './registry';
import type { WSData } from './registry';
import { forwardRequest } from './proxy';

// Start cloudflared tunnel when running on Railway (or any env with token set)
// Keep reference alive to prevent garbage collection from killing the subprocess
let _cloudflared: ReturnType<typeof Bun.spawn> | null = null;
if (Bun.env.CLOUDFLARE_TUNNEL_TOKEN) {
  _cloudflared = Bun.spawn(
    [
      'cloudflared',
      'tunnel',
      'run',
      '--token',
      Bun.env.CLOUDFLARE_TUNNEL_TOKEN,
    ],
    {
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  _cloudflared.exited.then((code) => {
    console.error(`[server] cloudflared exited with code ${code}`);
  });
  console.log('[server] cloudflared tunnel starting...');
}

const DOMAIN = Bun.env.TAILPORT_DOMAIN ?? 'tailport.dev';
const PORT = Number(Bun.env.PORT ?? 9000);
const CONTROL_PATH = '/_tailport/connect';
const CONTROL_SUBDOMAIN = Bun.env.TAILPORT_CONTROL_SUBDOMAIN ?? 'connect';

function extractSubdomain(host: string): string | null {
  // Strip port if present (e.g. "foo.tailport.dev:9000")
  const hostname = host.split(':')[0];
  const suffix = `.${DOMAIN}`;
  if (hostname.endsWith(suffix)) {
    return hostname.slice(0, -suffix.length);
  }
  return null;
}

Bun.serve<WSData>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);
    const host = req.headers.get('host') ?? '';
    const subdomain = extractSubdomain(host);

    // CLI control channel — reserved subdomain handles WebSocket registrations
    if (subdomain === CONTROL_SUBDOMAIN) {
      if (req.headers.get('upgrade') === 'websocket') {
        const upgraded = server.upgrade(req, {
          data: { subdomain: null } as WSData,
        });
        if (!upgraded)
          return new Response('WebSocket upgrade failed', { status: 400 });
        return undefined;
      }
      return new Response('tailport control endpoint\n', { status: 200 });
    }

    // Incoming request for a user subdomain — proxy it
    if (subdomain) {
      return forwardRequest(subdomain, req);
    }

    return new Response('tailport server\n', { status: 200 });
  },

  websocket: {
    open(_ws) {
      // Wait for register message
    },

    message(ws, msg) {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(
          typeof msg === 'string' ? msg : new TextDecoder().decode(msg),
        );
      } catch {
        return;
      }

      if (data.type === 'register') {
        const subdomain = String(data.subdomain ?? '')
          .toLowerCase()
          .trim();
        if (!subdomain) {
          ws.send(
            JSON.stringify({ type: 'error', message: 'subdomain is required' }),
          );
          ws.close();
          return;
        }

        const ok = register(subdomain, ws);
        if (ok) {
          ws.data.subdomain = subdomain;
          ws.send(
            JSON.stringify({
              type: 'registered',
              subdomain,
              url: `https://${subdomain}.${DOMAIN}`,
            }),
          );
          console.log(`[server] + ${subdomain}.${DOMAIN}`);
        } else {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'subdomain already taken',
            }),
          );
          ws.close();
        }
        return;
      }

      if (data.type === 'response') {
        const { subdomain } = ws.data;
        if (subdomain) {
          resolvePending(subdomain, String(data.id), {
            status: Number(data.status),
            headers: (data.headers ?? {}) as Record<string, string>,
            body: String(data.body ?? ''),
          });
        }
      }
    },

    close(ws) {
      if (ws.data.subdomain) {
        unregister(ws.data.subdomain);
        console.log(`[server] - ${ws.data.subdomain}.${DOMAIN}`);
      }
    },
  },
});

console.log(`[server] listening on port ${PORT} (domain: *.${DOMAIN})`);

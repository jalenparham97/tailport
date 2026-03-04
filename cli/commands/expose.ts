import { DEFAULT_DOMAIN, TAILPORT_SERVER_URL } from '../../lib/config';
import { readToken } from './auth';
import { setRoute } from '../../lib/routes';

export async function runExposeCommand(
  name: string | undefined,
  target: string | undefined,
): Promise<void> {
  if (!name || !target) {
    throw new Error('Usage: tailport expose <name> <target>');
  }

  // Self-hosted mode: TAILPORT_TUNNEL_NAME is set, meaning tailport start manages the tunnel
  if (Bun.env.TAILPORT_TUNNEL_NAME) {
    await runLocalExpose(name, target);
  } else {
    const token = await readToken();
    if (!token) {
      throw new Error('Not authenticated. Run: tailport auth login <token>');
    }
    await runHostedExpose(name, target, TAILPORT_SERVER_URL, token);
  }
}

async function runLocalExpose(name: string, target: string): Promise<void> {
  await setRoute(name, target);
  console.log(`[tailport] exposed ${name} -> ${target}`);
  if (DEFAULT_DOMAIN) {
    console.log(`[tailport] url: https://${name}.${DEFAULT_DOMAIN}`);
  } else {
    console.log(`[tailport] set TAILPORT_DOMAIN to see your public URL here`);
  }
}

async function runHostedExpose(
  name: string,
  target: string,
  serverUrl: string,
  token: string,
): Promise<void> {
  // Normalise local target to a full URL
  const upstream = target.includes('://')
    ? target
    : `http://localhost:${target}`;
  // Use the reserved 'connect' subdomain — covered by *.domain wildcard, no apex DNS needed
  const serverOrigin = new URL(serverUrl);
  const isLocal =
    serverOrigin.hostname === 'localhost' ||
    serverOrigin.hostname === '127.0.0.1';
  const wsHost = isLocal
    ? `${serverOrigin.hostname}${serverOrigin.port ? ':' + serverOrigin.port : ''}`
    : `connect.${serverOrigin.hostname}`;
  const wsScheme = serverOrigin.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${wsScheme}://${wsHost}`;

  console.log(`[tailport] connecting to ${serverUrl}...`);
  const ws = new WebSocket(wsUrl);

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('error', () => {
      reject(new Error(`Could not connect to tailport server at ${wsUrl}`));
    });
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'register', subdomain: name, token }));
    });

    ws.addEventListener('message', async (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (msg.type === 'registered') {
        console.log(`[tailport] tunnel open: ${msg.url}`);
        console.log(`[tailport] forwarding -> ${upstream}`);
        console.log('[tailport] press Ctrl+C to disconnect');
        resolve();
        return;
      }

      if (msg.type === 'error') {
        reject(new Error(String(msg.message)));
        return;
      }

      if (msg.type === 'request') {
        const { id, method, path, headers, body } = msg as {
          id: string;
          method: string;
          path: string;
          headers: Record<string, string>;
          body: string;
        };

        try {
          const res = await fetch(`${upstream}${path}`, {
            method,
            headers,
            body: body ? Buffer.from(body, 'base64') : undefined,
          });

          const resBody = Buffer.from(await res.arrayBuffer()).toString(
            'base64',
          );
          const resHeaders: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            resHeaders[k] = v;
          });

          ws.send(
            JSON.stringify({
              type: 'response',
              id,
              status: res.status,
              headers: resHeaders,
              body: resBody,
            }),
          );
        } catch (err) {
          ws.send(
            JSON.stringify({
              type: 'response',
              id,
              status: 502,
              headers: {},
              body: '',
            }),
          );
        }
      }
    });
  });

  // Keep process alive until Ctrl+C
  await new Promise<void>((resolve) => {
    const cleanup = () => {
      ws.close();
      resolve();
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    ws.addEventListener('close', () => resolve());
  });
}

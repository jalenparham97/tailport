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
  const upstream = target.includes('://')
    ? target
    : `http://localhost:${target}`;
  const serverOrigin = new URL(serverUrl);
  const isLocal =
    serverOrigin.hostname === 'localhost' ||
    serverOrigin.hostname === '127.0.0.1';
  const wsHost = isLocal
    ? `${serverOrigin.hostname}${serverOrigin.port ? ':' + serverOrigin.port : ''}`
    : `connect.${serverOrigin.hostname}`;
  const wsScheme = serverOrigin.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${wsScheme}://${wsHost}`;

  let shuttingDown = false;

  const cleanup = () => {
    shuttingDown = true;
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  console.log(`[tailport] connecting to ${serverUrl}...`);

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  let attempt = 0;

  while (!shuttingDown) {
    attempt++;
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let registered = false;

        ws.addEventListener('error', () => {
          if (!registered) {
            reject(
              new Error(`Could not connect to tailport server at ${wsUrl}`),
            );
          } else {
            ws.close();
            resolve(); // trigger reconnect
          }
        });

        ws.addEventListener('open', () => {
          ws.send(JSON.stringify({ type: 'register', subdomain: name, token }));
        });

        ws.addEventListener('close', () => resolve());

        ws.addEventListener('message', async (event) => {
          try {
            let msg: Record<string, unknown>;
            try {
              msg = JSON.parse(event.data as string);
            } catch {
              return;
            }

            if (msg.type === 'registered') {
              registered = true;
              if (attempt > 1) {
                console.log(`[tailport] reconnected: ${msg.url}`);
              } else {
                console.log(`[tailport] tunnel open: ${msg.url}`);
                console.log(`[tailport] forwarding -> ${upstream}`);
                console.log('[tailport] press Ctrl+C to disconnect');
              }
              attempt = 0;
              return;
            }

            if (msg.type === 'error') {
              // Server rejections (bad token, subdomain taken) are always fatal
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
              } catch {
                // Local app is down or errored — return 502, keep tunnel alive
                ws.send(
                  JSON.stringify({
                    type: 'response',
                    id,
                    status: 502,
                    headers: { 'content-type': 'text/plain' },
                    body: Buffer.from('Local server unavailable').toString(
                      'base64',
                    ),
                  }),
                );
              }
            }
          } catch {
            // Swallow any unexpected error to keep the tunnel alive
          }
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Always hard-fail for server rejections (bad token, subdomain taken)
      const isServerRejection =
        msg.includes('invalid token') ||
        msg.includes('subdomain already taken') ||
        msg.includes('subdomain is reserved');
      if (isServerRejection) throw err;
      // First connection failure to relay server should also exit
      if (attempt === 1 && msg.includes('Could not connect')) throw err;
      console.log(`[tailport] disconnected: ${msg}`);
    }

    if (!shuttingDown) {
      const delay = Math.min(1000 * attempt, 10000);
      console.log(`[tailport] reconnecting in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
}

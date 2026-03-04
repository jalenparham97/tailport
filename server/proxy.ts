import { randomUUID } from 'node:crypto';
import { addPending, getClient, removePending } from './registry';

const REQUEST_TIMEOUT_MS = 30_000;

export async function forwardRequest(
  subdomain: string,
  req: Request,
): Promise<Response> {
  const client = getClient(subdomain);
  if (!client) {
    return new Response(`No tunnel connected for "${subdomain}"`, {
      status: 502,
    });
  }

  const id = randomUUID();
  const url = new URL(req.url);
  const bodyBuffer = await req.arrayBuffer();
  const body = Buffer.from(bodyBuffer).toString('base64');

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      removePending(subdomain, id);
      resolve(new Response('Tunnel request timed out', { status: 504 }));
    }, REQUEST_TIMEOUT_MS);

    addPending(subdomain, id, {
      resolve: (res) => {
        clearTimeout(timeout);
        const responseBody = Buffer.from(res.body, 'base64');
        resolve(
          new Response(responseBody, {
            status: res.status,
            headers: res.headers,
          }),
        );
      },
      reject: (err) => {
        clearTimeout(timeout);
        resolve(new Response(err.message, { status: 502 }));
      },
    });

    client.send(
      JSON.stringify({
        type: 'request',
        id,
        method: req.method,
        path: url.pathname + url.search,
        headers,
        body,
      }),
    );
  });
}

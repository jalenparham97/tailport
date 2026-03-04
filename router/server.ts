import { watch, type FSWatcher } from 'node:fs';

import {
  DEFAULT_DOMAIN,
  DEFAULT_ROUTER_PORT,
  getRoutesFilePath,
} from '../lib/config';
import { type RoutesMap, loadRoutes } from '../lib/routes';

export type RouterRuntime = {
  stop: () => void;
};

export async function startRouter(
  port: number = DEFAULT_ROUTER_PORT,
  domain: string = DEFAULT_DOMAIN,
): Promise<RouterRuntime> {
  let routes: RoutesMap = await loadRoutes();
  const routesFile = getRoutesFilePath();

  const reloadRoutes = async (): Promise<void> => {
    try {
      routes = await loadRoutes();
      console.log(`[tailport] reloaded routes from ${routesFile}`);
    } catch (error) {
      console.error(
        `[tailport] failed to reload routes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const watcher: FSWatcher = watch(routesFile, () => {
    void reloadRoutes();
  });

  const server = Bun.serve({
    port,
    async fetch(req: Request): Promise<Response> {
      const incomingUrl = new URL(req.url);
      const hostHeader = req.headers.get('host') ?? incomingUrl.hostname;
      const hostname = hostHeader.split(':')[0].toLowerCase();
      const service = hostname.split('.')[0];
      const target = routes[service];

      if (!target) {
        return new Response('Service not found', { status: 404 });
      }

      const proxyUrl = new URL(incomingUrl.toString());
      proxyUrl.protocol = 'http:';
      proxyUrl.host = target;

      const headers = new Headers(req.headers);
      headers.set('host', target);
      headers.set('x-forwarded-host', hostname);
      headers.set('x-tailport-service', service);

      const body =
        req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body;

      try {
        const upstream = await fetch(proxyUrl, {
          method: req.method,
          headers,
          body,
          redirect: 'manual',
        });

        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers,
        });
      } catch (error) {
        return new Response(
          `Upstream request failed for ${service}.${domain}: ${error instanceof Error ? error.message : String(error)}`,
          { status: 502 },
        );
      }
    },
  });

  console.log(`[tailport] router listening on http://localhost:${port}`);

  return {
    stop: (): void => {
      watcher.close();
      server.stop(true);
      console.log('[tailport] router stopped');
    },
  };
}

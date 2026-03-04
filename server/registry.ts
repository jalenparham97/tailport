import type { ServerWebSocket } from 'bun';

export type ProxyResponse = {
  status: number;
  headers: Record<string, string>;
  body: string; // base64-encoded
};

export type PendingRequest = {
  resolve: (res: ProxyResponse) => void;
  reject: (err: Error) => void;
};

export type WSData = { subdomain: string | null };

const registry = new Map<string, ServerWebSocket<WSData>>();
const pending = new Map<string, Map<string, PendingRequest>>();

/** Register a subdomain. Returns false if already taken. */
export function register(
  subdomain: string,
  ws: ServerWebSocket<WSData>,
): boolean {
  if (registry.has(subdomain)) return false;
  registry.set(subdomain, ws);
  pending.set(subdomain, new Map());
  return true;
}

/** Remove a subdomain and reject any in-flight requests. */
export function unregister(subdomain: string): void {
  registry.delete(subdomain);
  const reqs = pending.get(subdomain);
  if (reqs) {
    for (const { reject } of reqs.values()) {
      reject(new Error('Client disconnected'));
    }
    pending.delete(subdomain);
  }
}

export function getClient(
  subdomain: string,
): ServerWebSocket<WSData> | undefined {
  return registry.get(subdomain);
}

export function addPending(
  subdomain: string,
  id: string,
  handlers: PendingRequest,
): void {
  pending.get(subdomain)?.set(id, handlers);
}

export function resolvePending(
  subdomain: string,
  id: string,
  response: ProxyResponse,
): void {
  const reqs = pending.get(subdomain);
  const handlers = reqs?.get(id);
  if (handlers) {
    reqs!.delete(id);
    handlers.resolve(response);
  }
}

export function removePending(subdomain: string, id: string): void {
  pending.get(subdomain)?.delete(id);
}

export function listSubdomains(): string[] {
  return Array.from(registry.keys()).sort();
}

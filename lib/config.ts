import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIG_DIR = '.config/tailport';
const ROUTES_FILE = 'routes.json';

/** Your public wildcard domain. Set via TAILPORT_DOMAIN env var (e.g. "example.com"). */
export const DEFAULT_DOMAIN = Bun.env.TAILPORT_DOMAIN ?? '';

/**
 * URL of the hosted tailport server.
 * Defaults to "https://tailport.dev". Override with TAILPORT_SERVER_URL env var
 * to point at a local or self-hosted instance.
 */
export const TAILPORT_SERVER_URL =
  Bun.env.TAILPORT_SERVER_URL || 'https://tailport.dev';

/**
 * Named Cloudflare Tunnel to run. Set via TAILPORT_TUNNEL_NAME env var.
 * If unset, cloudflared falls back to a temporary quick-tunnel URL.
 */
export const DEFAULT_TUNNEL_NAME = Bun.env.TAILPORT_TUNNEL_NAME || undefined;

export const DEFAULT_ROUTER_PORT = 9000;

export function getConfigDir(): string {
  const home = Bun.env.HOME;

  if (!home) {
    throw new Error('HOME environment variable is not set.');
  }

  return join(home, CONFIG_DIR);
}

export function getRoutesFilePath(): string {
  return join(getConfigDir(), ROUTES_FILE);
}

export function getCloudflaredConfigPath(): string {
  return join(getConfigDir(), 'cloudflared.yml');
}

export function getAuthFilePath(): string {
  return join(getConfigDir(), 'auth.json');
}

export async function ensureConfigFile(): Promise<string> {
  const configDir = getConfigDir();
  const routesFile = getRoutesFilePath();

  await mkdir(configDir, { recursive: true });

  const file = Bun.file(routesFile);
  const exists = await file.exists();

  if (!exists) {
    await Bun.write(routesFile, JSON.stringify({}, null, 2));
  }

  return routesFile;
}

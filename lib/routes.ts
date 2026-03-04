import { ensureConfigFile, getRoutesFilePath } from './config';

export type RoutesMap = Record<string, string>;

const SERVICE_NAME_REGEX = /^[a-z0-9-]+$/;

function validateName(name: string): string {
  const normalized = name.trim().toLowerCase();

  if (!normalized) {
    throw new Error('Service name is required.');
  }

  if (!SERVICE_NAME_REGEX.test(normalized)) {
    throw new Error(
      'Service name may only contain lowercase letters, numbers, and hyphens.',
    );
  }

  return normalized;
}

function validateTarget(target: string): string {
  const normalized = target.trim().toLowerCase();

  if (!normalized) {
    throw new Error('Target is required.');
  }

  if (!normalized.includes(':')) {
    throw new Error('Target must be in the format <host>:<port>.');
  }

  const [host, port] = normalized.split(':');

  if (!host || !port) {
    throw new Error('Target must be in the format <host>:<port>.');
  }

  const portNumber = Number(port);

  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error('Target port must be a valid number between 1 and 65535.');
  }

  return normalized;
}

export async function loadRoutes(): Promise<RoutesMap> {
  await ensureConfigFile();

  const routesFile = getRoutesFilePath();
  const raw = await Bun.file(routesFile).text();

  if (!raw.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as RoutesMap;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('Routes config must be an object.');
    }

    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to parse routes config at ${routesFile}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function saveRoutes(routes: RoutesMap): Promise<void> {
  await ensureConfigFile();
  const routesFile = getRoutesFilePath();
  await Bun.write(routesFile, `${JSON.stringify(routes, null, 2)}\n`);
}

export async function setRoute(
  name: string,
  target: string,
): Promise<RoutesMap> {
  const normalizedName = validateName(name);
  const normalizedTarget = validateTarget(target);
  const routes = await loadRoutes();

  routes[normalizedName] = normalizedTarget;
  await saveRoutes(routes);

  return routes;
}

export async function deleteRoute(name: string): Promise<boolean> {
  const normalizedName = validateName(name);
  const routes = await loadRoutes();

  if (!(normalizedName in routes)) {
    return false;
  }

  delete routes[normalizedName];
  await saveRoutes(routes);

  return true;
}

import { DEFAULT_DOMAIN } from '../../lib/config';
import { loadRoutes } from '../../lib/routes';

function pad(value: string, width: number): string {
  return value.padEnd(width, ' ');
}

export async function runListCommand(): Promise<void> {
  const routes = await loadRoutes();
  const entries = Object.entries(routes).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    console.log('No active services.');
    return;
  }

  const nameWidth = Math.max(
    'Name'.length,
    ...entries.map(([name]) => name.length),
  );
  const targetWidth = Math.max(
    'Target'.length,
    ...entries.map(([, target]) => target.length),
  );

  console.log(`${pad('Name', nameWidth)}  ${pad('Target', targetWidth)}  URL`);

  for (const [name, target] of entries) {
    console.log(
      `${pad(name, nameWidth)}  ${pad(target, targetWidth)}  https://${name}.${DEFAULT_DOMAIN}`,
    );
  }
}

import { getAuthFilePath, TAILPORT_SERVER_URL } from '../../lib/config';

type Tunnel = { subdomain: string; url: string };

export async function runListCommand(): Promise<void> {
  const file = Bun.file(getAuthFilePath());
  const token: string | null = (await file.exists())
    ? (((await file.json()) as { token?: string }).token ?? null)
    : null;

  if (!token) {
    throw new Error('Not authenticated. Run: tailport auth login <token>');
  }

  const res = await fetch(`${TAILPORT_SERVER_URL}/api/tunnels`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }

  const { tunnels } = (await res.json()) as { tunnels: Tunnel[] };

  if (tunnels.length === 0) {
    console.log('No active tunnels.');
    return;
  }

  const nameWidth = Math.max(
    'Subdomain'.length,
    ...tunnels.map((t) => t.subdomain.length),
  );
  console.log(`${'Subdomain'.padEnd(nameWidth)}  URL`);
  for (const t of tunnels) {
    console.log(`${t.subdomain.padEnd(nameWidth)}  ${t.url}`);
  }
}

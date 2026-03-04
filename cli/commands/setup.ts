import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_ROUTER_PORT,
  ensureConfigFile,
  getCloudflaredConfigPath,
} from '../../lib/config';

function ask(question: string): string {
  return prompt(question)?.trim() ?? '';
}

async function spawnCapture(
  command: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(command, {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'inherit',
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    proc.stdout && typeof proc.stdout !== 'number'
      ? new Response(proc.stdout).text()
      : Promise.resolve(''),
    proc.stderr && typeof proc.stderr !== 'number'
      ? new Response(proc.stderr).text()
      : Promise.resolve(''),
  ]);
  return { stdout, stderr, code };
}

async function spawnInherit(command: string[], label: string): Promise<void> {
  const proc = Bun.spawn(command, {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${label} failed (exit ${code})`);
}

async function ensureCloudflared(): Promise<void> {
  const { code } = await spawnCapture(['cloudflared', '--version']);
  if (code === 0) return;

  console.log('[tailport] cloudflared not found, attempting to install...');
  const brew = await spawnCapture(['which', 'brew']);
  if (brew.code === 0) {
    console.log('[tailport] installing via Homebrew...');
    await spawnInherit(
      ['brew', 'install', 'cloudflared'],
      'brew install cloudflared',
    );
    return;
  }

  console.error(
    '[tailport] could not auto-install cloudflared. Install it manually:\n' +
      '  macOS:   brew install cloudflared\n' +
      '  Linux:   https://pkg.cloudflare.com/\n' +
      '  Windows: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
  );
  process.exit(1);
}

function extractTunnelId(text: string): string | null {
  const match = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  return match ? match[0] : null;
}

async function createOrGetTunnel(tunnelName: string): Promise<string> {
  const result = await spawnCapture([
    'cloudflared',
    'tunnel',
    'create',
    tunnelName,
  ]);
  const combined = result.stdout + result.stderr;

  if (result.code === 0) {
    const id = extractTunnelId(combined);
    if (id) return id;
  }

  // Tunnel already exists — fetch ID from list
  console.log(
    `[tailport] tunnel "${tunnelName}" already exists, fetching ID...`,
  );
  const list = await spawnCapture([
    'cloudflared',
    'tunnel',
    'list',
    '--output',
    'json',
  ]);
  if (list.code === 0) {
    try {
      const tunnels = JSON.parse(list.stdout) as Array<{
        name: string;
        id: string;
      }>;
      const found = tunnels.find((t) => t.name === tunnelName);
      if (found) return found.id;
    } catch {
      // ignore parse errors
    }
  }

  throw new Error(
    `Could not create or find tunnel "${tunnelName}". ${combined}`,
  );
}

function buildCloudflaredConfig(
  tunnelId: string,
  domain: string,
  port: number,
): string {
  const home = Bun.env.HOME ?? '~';
  const credentialsFile = join(home, '.cloudflared', `${tunnelId}.json`);
  return [
    `tunnel: ${tunnelId}`,
    `credentials-file: ${credentialsFile}`,
    `ingress:`,
    `  - hostname: "${domain}"`,
    `    service: http://localhost:${port}`,
    `  - hostname: "*.${domain}"`,
    `    service: http://localhost:${port}`,
    `  - service: http_status:404`,
    '',
  ].join('\n');
}

export async function runSetupCommand(): Promise<void> {
  console.log('[tailport] checking cloudflared...');
  await ensureCloudflared();

  // Step 1: login
  console.log(
    '\n[tailport] step 1/3 — log in to Cloudflare (opens browser)...',
  );
  await spawnInherit(['cloudflared', 'tunnel', 'login'], 'cloudflared login');

  // Step 2: domain
  console.log('');
  const domain = ask(
    '[tailport] step 2/3 — enter your domain (e.g. example.com): ',
  );
  if (!domain) throw new Error('Domain is required.');

  const tunnelName = 'tailport';

  // Step 3: create tunnel + DNS + config
  console.log(`\n[tailport] step 3/3 — creating tunnel and DNS record...`);
  const tunnelId = await createOrGetTunnel(tunnelName);
  console.log(`[tailport] tunnel ID: ${tunnelId}`);

  await spawnInherit(
    ['cloudflared', 'tunnel', 'route', 'dns', tunnelName, `*.${domain}`],
    'cloudflared route dns',
  );
  try {
    await spawnInherit(
      ['cloudflared', 'tunnel', 'route', 'dns', tunnelName, domain],
      'cloudflared route dns (apex)',
    );
  } catch {
    console.log(
      '[tailport] note: apex DNS route already exists or could not be created automatically.',
    );
  }

  // Write cloudflared.yml — this replaces the Zero Trust dashboard public hostname step
  await ensureConfigFile();
  const cfConfigPath = getCloudflaredConfigPath();
  await writeFile(
    cfConfigPath,
    buildCloudflaredConfig(tunnelId, domain, DEFAULT_ROUTER_PORT),
  );

  // Write .env
  const envPath = join(process.cwd(), '.env');
  await writeFile(
    envPath,
    `TAILPORT_DOMAIN=${domain}\nTAILPORT_TUNNEL_NAME=${tunnelName}\n`,
  );

  console.log(`
[tailport] setup complete!

  Domain: ${domain}, *.${domain}
  Config: ${cfConfigPath}

Run ./tailport start to go live.
`);
}

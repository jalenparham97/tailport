import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { getAuthFilePath, getConfigDir } from '../../lib/config';

type AuthFile = { token: string };

export async function readToken(): Promise<string | null> {
  const file = Bun.file(getAuthFilePath());
  if (!(await file.exists())) return null;
  try {
    const data = (await file.json()) as AuthFile;
    return data.token ?? null;
  } catch {
    return null;
  }
}

export async function runAuthCommand(
  sub: string | undefined,
  args: string[],
): Promise<void> {
  switch (sub) {
    case 'login':
      await authLogin(args[0]);
      break;
    case 'logout':
      await authLogout();
      break;
    case 'generate':
      authGenerate();
      break;
    case 'token':
      await authShowToken();
      break;
    default:
      console.log(`tailport auth

Usage:
  tailport auth login <token>  Save an auth token
  tailport auth logout         Remove saved token
  tailport auth token          Print current token
  tailport auth generate       Generate a token (requires TAILPORT_TOKEN_SECRET)`);
  }
}

async function authLogin(token: string | undefined): Promise<void> {
  if (!token) {
    throw new Error('Usage: tailport auth login <token>');
  }
  await mkdir(getConfigDir(), { recursive: true });
  await Bun.write(getAuthFilePath(), JSON.stringify({ token }, null, 2));
  console.log('[tailport] token saved');
}

async function authLogout(): Promise<void> {
  const file = Bun.file(getAuthFilePath());
  if (await file.exists()) {
    const { unlink } = await import('node:fs/promises');
    await unlink(getAuthFilePath());
    console.log('[tailport] logged out');
  } else {
    console.log('[tailport] no token saved');
  }
}

async function authShowToken(): Promise<void> {
  const token = await readToken();
  if (token) {
    console.log(token);
  } else {
    console.log('[tailport] no token saved — run: tailport auth login <token>');
  }
}

function authGenerate(): void {
  const secret = Bun.env.TAILPORT_TOKEN_SECRET;
  if (!secret) {
    throw new Error('TAILPORT_TOKEN_SECRET is not set in your environment.');
  }
  const token = createHmac('sha256', secret)
    .update('tailport-access')
    .digest('hex');
  console.log(token);
}

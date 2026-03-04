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
    case 'token':
      await authShowToken();
      break;
    default:
      console.log(`tailport auth

Usage:
  tailport auth login <token>  Save your TAILPORT_TOKEN_SECRET as the auth token
  tailport auth logout         Remove saved token
  tailport auth token          Print current token`);
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
    console.log(
      '[tailport] no token saved — run: tailport auth login <TAILPORT_TOKEN_SECRET>',
    );
  }
}

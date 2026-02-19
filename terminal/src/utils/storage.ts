import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const baseDir = path.join(os.homedir(), '.taktos');
const tokenPath = path.join(baseDir, 'auth.json');

export async function loadToken(): Promise<string | null> {
  try {
    const data = await fs.readFile(tokenPath, 'utf-8');
    const parsed = JSON.parse(data) as { token?: string };
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

export async function saveToken(token: string | null): Promise<void> {
  await fs.mkdir(baseDir, { recursive: true });
  if (!token) {
    try {
      await fs.unlink(tokenPath);
    } catch {
      // noop
    }
    return;
  }

  await fs.writeFile(tokenPath, JSON.stringify({ token }, null, 2));
}

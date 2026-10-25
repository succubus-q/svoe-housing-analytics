import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function atomicWrite(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, text, 'utf8');
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, path);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // OneDrive/antivirus can briefly hold an existing Windows file open.
        if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw error;
        await delay(50 * 2 ** attempt);
      }
    }
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
}

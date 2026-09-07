import { access } from 'node:fs/promises';

/** Returns true when the path exists and is readable by the current process. */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

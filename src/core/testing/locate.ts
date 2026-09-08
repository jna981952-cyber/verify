import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';

import { pathExists } from '../../utils/fs.js';
import { type RunnerLocation, type TestFramework } from './types.js';

/** Reads the `bin` entry a package declares for the given command. */
function binEntry(manifest: Record<string, unknown>, name: string): string | null {
  const bin = manifest['bin'];

  if (typeof bin === 'string') {
    return bin;
  }
  if (typeof bin === 'object' && bin !== null && !Array.isArray(bin)) {
    const entry = (bin as Record<string, unknown>)[name];
    return typeof entry === 'string' ? entry : null;
  }
  return null;
}

function versionOf(manifest: Record<string, unknown>): string | null {
  const version = manifest['version'];
  return typeof version === 'string' && version !== '' ? version : null;
}

async function readManifestAt(path: string): Promise<Record<string, unknown> | null> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(contents);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Finds a runner's JavaScript entry point in an installed package.
 *
 * The package's own `bin` field is read rather than the shim in
 * `node_modules/.bin`, because that shim is a batch file on Windows and cannot
 * be spawned without a shell. Running the entry point with the current Node
 * executable works the same way everywhere and needs no shell at all.
 */
export async function locateIn(
  packageDirectory: string,
  framework: TestFramework,
): Promise<RunnerLocation | null> {
  const manifest = await readManifestAt(join(packageDirectory, 'package.json'));
  if (manifest === null) {
    return null;
  }

  const declared = binEntry(manifest, framework);
  if (declared === null) {
    return null;
  }

  const entry = isAbsolute(declared) ? declared : resolve(packageDirectory, declared);
  if (!(await pathExists(entry))) {
    return null;
  }

  return { framework, entry, packageDirectory, version: versionOf(manifest) };
}

/**
 * Looks for an installed runner, starting at `directory` and walking upwards.
 *
 * Walking up finds the runner a workspace package shares with the repository
 * root. Nothing is resolved from a global install: a runner that is not in the
 * project's own dependency tree is not the one its tests expect.
 *
 * Returns `null` when the runner is not installed, which the caller reports
 * rather than treating as a failure of its own.
 */
export async function locateRunner(
  directory: string,
  framework: TestFramework,
): Promise<RunnerLocation | null> {
  const { root } = parse(resolve(directory));
  let current = resolve(directory);

  for (;;) {
    const found = await locateIn(join(current, 'node_modules', framework), framework);
    if (found !== null) {
      return found;
    }

    if (current === root) {
      return null;
    }
    current = dirname(current);
  }
}

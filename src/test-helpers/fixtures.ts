import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Map of paths relative to the fixture root to their file contents. */
export type FixtureFiles = Readonly<Record<string, string>>;

export interface Fixture {
  /** Absolute, symlink-resolved path to the fixture directory. */
  readonly path: string;
  /** Removes the fixture from disk. */
  cleanup(): Promise<void>;
}

/**
 * Creates a throwaway directory populated with the given files.
 *
 * Paths are resolved through `realpath` so assertions comparing absolute paths
 * are not defeated by symlinked temp directories.
 */
export async function createFixture(files: FixtureFiles = {}): Promise<Fixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'verify-test-')));

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, 'utf8');
  }

  return {
    path: root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** Serialises an object as `package.json` content. */
export function packageJson(manifest: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(manifest, null, 2);
}

import { resolve } from 'node:path';

import { type GitRunner } from './runner.js';

/** A Git repository the CLI has been pointed at. */
export interface GitRepository {
  /** Absolute path to the repository's top level. */
  readonly root: string;
}

/**
 * Locates the repository containing `directory`.
 *
 * A directory that is not tracked by Git is not an error — plenty of paths
 * worth inspecting are not repositories — so the caller simply gets `null`.
 *
 * @throws {GitUnavailableError} If `git` cannot be executed.
 */
export async function findRepository(
  directory: string,
  runner: GitRunner,
): Promise<GitRepository | null> {
  const result = await runner(['rev-parse', '--show-toplevel'], { cwd: directory });
  if (result.code !== 0) {
    return null;
  }

  const top = result.stdout.trim();
  return top === '' ? null : { root: resolve(top) };
}

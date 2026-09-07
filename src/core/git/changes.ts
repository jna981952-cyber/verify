import { UsageError } from '../../utils/errors.js';
import { type DiffFile, readDiff } from './diff.js';
import { readHead } from './head.js';
import { findRepository } from './repository.js';
import { createGitRunner, type GitRunner } from './runner.js';
import { readStatus, type StatusEntry } from './status.js';
import { type ChangeKind, type ChangeSet, type ChangeSummary, type FileChange } from './types.js';

/** Overrides accepted by {@link collectChanges}. */
export interface CollectChangesOptions {
  /** Replaces the real `git` executable; used by the tests. */
  readonly runner?: GitRunner;
}

const NO_STATS = { added: 0, removed: 0 } as const;

/** Orders paths by code unit so the output does not depend on the active locale. */
function byPath(left: FileChange, right: FileChange): number {
  if (left.path === right.path) {
    return 0;
  }
  return left.path < right.path ? -1 : 1;
}

/** Counts how many paths fall into each change kind. */
export function summarise(files: readonly FileChange[]): ChangeSummary {
  const counts: Record<ChangeKind, number> = {
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    unmerged: 0,
  };

  for (const file of files) {
    counts[file.kind] += 1;
  }

  return { ...counts, total: files.length };
}

/**
 * Combines what `git status` and `git diff` each know about a path.
 *
 * Status decides the file list, the kind, and where the change lives; the diff
 * only ever contributes line detail, and untracked files simply have none.
 */
function toFileChange(entry: StatusEntry, diff: DiffFile | undefined): FileChange {
  return {
    path: entry.path,
    previousPath: entry.previousPath ?? diff?.previousPath ?? null,
    kind: entry.kind,
    scope: entry.scope,
    binary: diff?.binary ?? false,
    similarity: entry.similarity,
    hunks: diff?.hunks ?? [],
    stats: diff?.stats ?? NO_STATS,
  };
}

/**
 * Gathers every change in the repository containing `directory`.
 *
 * Returns `null` when the directory is not inside a Git repository, following
 * the same "absent is not an error" rule as the rest of the detection layer.
 *
 * @throws {GitUnavailableError} If `git` cannot be executed.
 */
export async function collectChanges(
  directory: string,
  options: CollectChangesOptions = {},
): Promise<ChangeSet | null> {
  const runner = options.runner ?? createGitRunner();

  const repository = await findRepository(directory, runner);
  if (repository === null) {
    return null;
  }

  const { root } = repository;
  const [head, entries] = await Promise.all([readHead(root, runner), readStatus(root, runner)]);
  const diffs = await readDiff(root, runner, head.unborn);

  const byNewPath = new Map(diffs.map((diff) => [diff.path, diff]));
  const files = entries.map((entry) => toFileChange(entry, byNewPath.get(entry.path))).sort(byPath);

  return { root, head, files, summary: summarise(files) };
}

/**
 * Gathers changes for a directory that is expected to be a repository.
 *
 * Pointing the command at something that is not tracked by Git is a mistake in
 * the invocation rather than a fact worth reporting, so it surfaces as a usage
 * error instead of an empty result.
 *
 * @throws {UsageError} If `directory` is not inside a Git repository.
 * @throws {GitUnavailableError} If `git` cannot be executed.
 */
export async function requireChanges(
  directory: string,
  options: CollectChangesOptions = {},
): Promise<ChangeSet> {
  const changes = await collectChanges(directory, options);
  if (changes === null) {
    throw new UsageError(`Not a Git repository: ${directory}`);
  }
  return changes;
}

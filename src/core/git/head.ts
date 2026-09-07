import { type GitHead } from './types.js';
import { type GitRunner } from './runner.js';

/** Number of characters of a commit SHA shown in abbreviated output. */
export const SHORT_COMMIT_LENGTH = 7;

/**
 * Reads which commit and branch the working tree sits on.
 *
 * Both halves are optional in practice: a detached HEAD has no branch, and a
 * repository with no commits yet has no commit, so each is reported as `null`
 * with a flag explaining why.
 *
 * @throws {GitUnavailableError} If `git` cannot be executed.
 */
export async function readHead(root: string, runner: GitRunner): Promise<GitHead> {
  const [branchResult, commitResult] = await Promise.all([
    runner(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root }),
    runner(['rev-parse', '--verify', 'HEAD'], { cwd: root }),
  ]);

  const branchName = branchResult.code === 0 ? branchResult.stdout.trim() : '';
  const commitSha = commitResult.code === 0 ? commitResult.stdout.trim() : '';

  const branch = branchName === '' ? null : branchName;
  const commit = commitSha === '' ? null : commitSha;

  return {
    branch,
    commit,
    shortCommit: commit === null ? null : commit.slice(0, SHORT_COMMIT_LENGTH),
    detached: branch === null,
    unborn: commit === null,
  };
}

import { execFile } from 'node:child_process';

import { ExitCode, VerifyError } from '../../utils/errors.js';

/** Outcome of a single `git` invocation. */
export interface GitResult {
  /** Process exit status; `0` on success. */
  readonly code: number;
  /** Everything the command wrote to standard output. */
  readonly stdout: string;
  /** Everything the command wrote to standard error. */
  readonly stderr: string;
}

/** Options accepted by a {@link GitRunner}. */
export interface GitRunOptions {
  /** Directory the command runs in. */
  readonly cwd: string;
}

/**
 * Runs `git` and reports what it printed.
 *
 * Injecting this rather than reaching for `child_process` at the call site is
 * what lets the tests cover missing binaries and malformed output without
 * depending on the machine they happen to run on.
 */
export type GitRunner = (args: readonly string[], options: GitRunOptions) => Promise<GitResult>;

/** Raised when `git` itself cannot be executed. */
export class GitUnavailableError extends VerifyError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, ExitCode.Internal, options);
    this.name = 'GitUnavailableError';
  }
}

/** Narrows an unknown thrown value to a {@link GitUnavailableError}. */
export function isGitUnavailableError(value: unknown): value is GitUnavailableError {
  return value instanceof GitUnavailableError;
}

/** Raised when a git command that was expected to succeed did not. */
export class GitCommandError extends VerifyError {
  public constructor(command: string, result: GitResult, options?: ErrorOptions) {
    const detail = result.stderr.trim();
    super(
      `git ${command} exited with ${String(result.code)}${detail === '' ? '' : `: ${detail}`}`,
      ExitCode.Internal,
      options,
    );
    this.name = 'GitCommandError';
  }
}

/**
 * Returns the output of a command that must have succeeded.
 *
 * Used once the directory is known to be a repository, where a failure means
 * something is genuinely wrong rather than simply absent — reporting "no
 * changes" in that case would be the one answer worse than an error.
 *
 * @throws {GitCommandError} If the command exited non-zero.
 */
export function expectSuccess(command: string, result: GitResult): string {
  if (result.code !== 0) {
    throw new GitCommandError(command, result);
  }
  return result.stdout;
}

/**
 * Arguments prepended to every invocation.
 *
 * `--no-optional-locks` keeps read-only commands from touching the index, and
 * `core.quotepath=false` stops git escaping non-ASCII bytes in paths, so
 * unusual filenames survive the round trip intact.
 */
const BASE_ARGS = ['--no-optional-locks', '-c', 'core.quotepath=false'] as const;

/** Upper bound on captured output; generous enough for very large diffs. */
const MAX_BUFFER = 64 * 1024 * 1024;

function errorCode(cause: unknown): unknown {
  if (typeof cause !== 'object' || cause === null) {
    return undefined;
  }
  return (cause as { code?: unknown }).code;
}

/**
 * Builds the runner backed by the real `git` executable.
 *
 * A non-zero exit status is returned rather than thrown: callers decide which
 * failures are expected — asking a plain directory for its top level, say —
 * and which are not. Only an unusable `git` raises.
 *
 * @throws {GitUnavailableError} If `git` cannot be spawned at all.
 */
export function createGitRunner(): GitRunner {
  return async (args, options) =>
    new Promise<GitResult>((resolve, reject) => {
      execFile(
        'git',
        [...BASE_ARGS, ...args],
        {
          cwd: options.cwd,
          encoding: 'utf8',
          maxBuffer: MAX_BUFFER,
          // A pager or a credential prompt would hang a non-interactive run.
          env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' },
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error === null) {
            resolve({ code: 0, stdout, stderr });
            return;
          }

          const code = errorCode(error);
          if (typeof code === 'number') {
            resolve({ code, stdout, stderr });
            return;
          }

          reject(
            new GitUnavailableError(
              code === 'ENOENT'
                ? 'Could not run git. Is it installed and on PATH?'
                : `Could not run git: ${error.message}`,
              { cause: error },
            ),
          );
        },
      );
    });
}

/**
 * Process exit codes used by the CLI.
 *
 * The set is intentionally small and stable: scripts and CI pipelines are
 * expected to branch on these values, so they must not be renumbered.
 */
export const ExitCode = {
  /** Everything the CLI was asked to do succeeded. */
  Success: 0,
  /** Verification ran to completion but reported problems. */
  Failure: 1,
  /** The command was invoked incorrectly (bad flag, bad path, ...). */
  Usage: 2,
  /** The CLI could not complete because of an unexpected error. */
  Internal: 3,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Base class for every error the CLI raises deliberately.
 *
 * Carrying the exit code on the error keeps the mapping from failure mode to
 * process status in one place instead of spread across the command layer.
 */
export class VerifyError extends Error {
  public readonly exitCode: ExitCode;

  public constructor(
    message: string,
    exitCode: ExitCode = ExitCode.Internal,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'VerifyError';
    this.exitCode = exitCode;
  }
}

/** Raised when the user invoked the CLI incorrectly. */
export class UsageError extends VerifyError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, ExitCode.Usage, options);
    this.name = 'UsageError';
  }
}

/** Narrows an unknown thrown value to a {@link VerifyError}. */
export function isVerifyError(value: unknown): value is VerifyError {
  return value instanceof VerifyError;
}

/** Best-effort extraction of a human readable message from an unknown throwable. */
export function toErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return typeof value === 'string' ? value : String(value);
}

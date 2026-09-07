/**
 * Minimal output abstraction.
 *
 * Nothing in the codebase writes to `process.stdout` directly; commands take a
 * {@link Logger} instead, which keeps output ordering explicit and lets tests
 * assert on what was printed without patching globals.
 */
export interface Logger {
  /** Writes a line to standard output. */
  out(message?: string): void;
  /** Writes a line to standard error. */
  err(message?: string): void;
}

export interface WritableLike {
  write(chunk: string): unknown;
}

export interface LoggerStreams {
  stdout: WritableLike;
  stderr: WritableLike;
}

/** Creates a logger that writes newline-terminated messages to the given streams. */
export function createLogger(streams: LoggerStreams): Logger {
  return {
    out(message = '') {
      streams.stdout.write(`${message}\n`);
    },
    err(message = '') {
      streams.stderr.write(`${message}\n`);
    },
  };
}

export interface MemoryLogger extends Logger {
  /** Everything written to standard output so far. */
  readonly stdout: string;
  /** Everything written to standard error so far. */
  readonly stderr: string;
}

/** Creates an in-memory logger, used by the test suite. */
export function createMemoryLogger(): MemoryLogger {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    out(message = '') {
      stdout.push(`${message}\n`);
    },
    err(message = '') {
      stderr.push(`${message}\n`);
    },
    get stdout() {
      return stdout.join('');
    },
    get stderr() {
      return stderr.join('');
    },
  };
}

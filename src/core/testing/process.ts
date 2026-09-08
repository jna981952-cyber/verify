import { spawn } from 'node:child_process';

/** A process the engine wants run. */
export interface ProcessRequest {
  /** Executable to run; never passed through a shell. */
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  /** Environment for the child, replacing rather than extending the parent's. */
  readonly env: Readonly<Record<string, string>>;
  /** How long the process may take before it is stopped. */
  readonly timeoutMs: number;
}

/** What running a process produced. */
export interface ProcessResult {
  /** Exit status, `null` when a signal ended the process. */
  readonly code: number | null;
  /** Signal that ended the process, `null` when it exited on its own. */
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Wall-clock time from spawn to exit. */
  readonly durationMs: number;
  /** True when the time allowed ran out and the process was stopped. */
  readonly timedOut: boolean;
  /** Why the process could not be started at all, `null` when it ran. */
  readonly error: string | null;
}

/**
 * Runs a process and reports what it produced.
 *
 * Injecting this rather than reaching for `child_process` at the call site is
 * what lets the engine be tested against runners that are stood up for the
 * purpose, without this project's own test runner being involved.
 */
export type ProcessRunner = (request: ProcessRequest) => Promise<ProcessResult>;

/** How long a stopped process is given to exit before it is killed outright. */
export const TERMINATION_GRACE_MS = 2000;

/** Largest amount of output kept from either stream, in characters. */
export const MAX_CAPTURED_OUTPUT = 1024 * 1024;

/** Keeps the tail of a stream, which is where a failure's detail sits. */
function clamp(chunks: readonly string[]): string {
  const text = chunks.join('');
  return text.length <= MAX_CAPTURED_OUTPUT ? text : text.slice(-MAX_CAPTURED_OUTPUT);
}

/**
 * Signals a running process, and everything it started.
 *
 * A test runner spawns workers, so signalling the child alone would leave them
 * running. On POSIX the child is given its own process group and the group is
 * signalled; Windows has no equivalent through this API, so the child is
 * signalled directly and its workers exit with their parent's pipes.
 */
function terminate(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) {
    return;
  }

  try {
    process.kill(process.platform === 'win32' ? pid : -pid, signal);
  } catch {
    // The process is already gone, which is the outcome that was wanted.
  }
}

/**
 * Builds the runner backed by real child processes.
 *
 * Nothing is passed through a shell: the command and its arguments go to the
 * operating system as they are given, so a path containing spaces or shell
 * metacharacters is just a path.
 */
export function createProcessRunner(): ProcessRunner {
  return async (request) =>
    new Promise<ProcessResult>((resolve) => {
      const startedAt = Date.now();
      const stdout: string[] = [];
      const stderr: string[] = [];

      let timedOut = false;
      let settled = false;
      let killTimer: NodeJS.Timeout | undefined;

      const child = spawn(request.command, [...request.args], {
        cwd: request.cwd,
        env: { ...request.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        // Its own process group on POSIX, so its workers can be stopped with it.
        detached: process.platform !== 'win32',
        windowsHide: true,
      });

      // Both streams are piped above, so neither is null.
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => stdout.push(chunk));
      child.stderr.on('data', (chunk: string) => stderr.push(chunk));

      const timer = setTimeout(() => {
        timedOut = true;
        terminate(child.pid, 'SIGTERM');
        killTimer = setTimeout(() => {
          terminate(child.pid, 'SIGKILL');
        }, TERMINATION_GRACE_MS);
        killTimer.unref();
      }, request.timeoutMs);
      timer.unref();

      const settle = (result: Omit<ProcessResult, 'stdout' | 'stderr' | 'durationMs'>): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (killTimer !== undefined) {
          clearTimeout(killTimer);
        }
        resolve({
          ...result,
          stdout: clamp(stdout),
          stderr: clamp(stderr),
          durationMs: Date.now() - startedAt,
        });
      };

      child.on('error', (error: Error) => {
        settle({ code: null, signal: null, timedOut, error: error.message });
      });

      child.on('close', (code, signal) => {
        settle({ code, signal, timedOut, error: null });
      });
    });
}

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseRunnerOutput, summarise } from './parse.js';
import { type ProcessRunner } from './process.js';
import {
  type RunnerLocation,
  type RunOutcome,
  type TestFileResult,
  type TestFramework,
  type TestRun,
} from './types.js';

/** How long a run may take before it is stopped, unless told otherwise. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** What {@link executeRun} needs in order to run a project's tests. */
export interface RunRequest {
  /** Absolute path to the project the tests belong to. */
  readonly root: string;
  readonly runner: RunnerLocation;
  /** Test files to run, relative to {@link root}; empty runs everything. */
  readonly files: readonly string[];
  /** Name filter passed to the runner, `null` for none. */
  readonly pattern: string | null;
  readonly timeoutMs: number;
  /** Where the runner writes its machine-readable results. */
  readonly outputFile: string;
}

/**
 * Builds the argument list for a runner.
 *
 * Both runners are asked to write their results as JSON to a file rather than
 * to standard output, which leaves standard output holding what the tests
 * themselves printed. The runner's entry point leads the list because it is run
 * with the current Node executable rather than through a shell.
 */
export function buildArgs(request: RunRequest): readonly string[] {
  const { runner, files, pattern, outputFile } = request;
  const named = pattern === null ? [] : ['-t', pattern];

  if (runner.framework === 'vitest') {
    return [
      runner.entry,
      'run',
      '--reporter=json',
      `--outputFile=${outputFile}`,
      ...named,
      ...files,
    ];
  }

  return [
    runner.entry,
    '--json',
    `--outputFile=${outputFile}`,
    ...named,
    ...(files.length === 0 ? [] : ['--runTestsByPath', ...files]),
  ];
}

/**
 * The environment a runner is given.
 *
 * Colour is switched off because the output is captured rather than shown on a
 * terminal, and the escape sequences would only obscure it.
 */
export function buildEnv(): Record<string, string> {
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      inherited[key] = value;
    }
  }

  return { ...inherited, NO_COLOR: '1', FORCE_COLOR: '0' };
}

/** Reads the results file a runner wrote, returning `null` when it cannot. */
async function readResults(
  root: string,
  outputFile: string,
): Promise<readonly TestFileResult[] | null> {
  let contents: string;
  try {
    contents = await readFile(outputFile, 'utf8');
  } catch {
    return null;
  }

  try {
    return parseRunnerOutput(root, JSON.parse(contents));
  } catch {
    return null;
  }
}

/**
 * Decides how a run ended.
 *
 * A failing test is a `fail`; anything that stopped the runner from reaching a
 * verdict — a non-zero exit with nothing reported, unreadable output, a process
 * that would not start — is an `error`, because no test was shown to fail.
 */
export function outcomeOf(options: {
  readonly timedOut: boolean;
  readonly startupError: string | null;
  readonly files: readonly TestFileResult[] | null;
  readonly failed: number;
  readonly exitCode: number | null;
}): RunOutcome {
  if (options.timedOut) {
    return 'timeout';
  }
  if (options.startupError !== null || options.files === null) {
    return 'error';
  }
  if (options.failed > 0) {
    return 'fail';
  }
  return options.exitCode === 0 ? 'pass' : 'error';
}

/**
 * Explains why a run could not be read, or `null` when there is nothing wrong.
 *
 * A non-zero exit alongside a failing test is the runner doing its job, so only
 * a non-zero exit with nothing to show for it is worth reporting.
 */
function describeError(options: {
  readonly startupError: string | null;
  readonly files: readonly TestFileResult[] | null;
  readonly failed: number;
  readonly exitCode: number | null;
  readonly framework: TestFramework;
}): string | null {
  const { startupError, files, failed, exitCode, framework } = options;

  if (startupError !== null) {
    return `Could not start ${framework}: ${startupError}`;
  }
  if (files === null) {
    return `${framework} did not leave readable results; see its output below.`;
  }
  if (failed === 0 && exitCode !== 0 && exitCode !== null) {
    return `${framework} exited with ${String(exitCode)} without reporting a failing test.`;
  }
  return null;
}

/**
 * Runs a project's tests and reads what the runner reported.
 *
 * The runner is spawned through the injected process runner, so a run can be
 * exercised against a stand-in as readily as against the real thing.
 */
export async function executeRun(request: RunRequest, run: ProcessRunner): Promise<TestRun> {
  const args = buildArgs(request);

  const result = await run({
    command: process.execPath,
    args,
    cwd: request.root,
    env: buildEnv(),
    timeoutMs: request.timeoutMs,
  });

  const files = result.timedOut ? null : await readResults(request.root, request.outputFile);
  const summary = summarise(files ?? []);

  return {
    framework: request.runner.framework,
    command: [process.execPath, ...args],
    outcome: outcomeOf({
      timedOut: result.timedOut,
      startupError: result.error,
      files,
      failed: summary.failed,
      exitCode: result.code,
    }),
    exitCode: result.code,
    signal: result.signal,
    durationMs: result.durationMs,
    timeoutMs: request.timeoutMs,
    stdout: result.stdout,
    stderr: result.stderr,
    files: files ?? [],
    summary,
    error: result.timedOut
      ? `${request.runner.framework} was stopped after ${String(request.timeoutMs)}ms.`
      : describeError({
          startupError: result.error,
          files,
          failed: summary.failed,
          exitCode: result.code,
          framework: request.runner.framework,
        }),
  };
}

/**
 * Runs a project's tests in a throwaway directory for the results file.
 *
 * The runner writes outside the project so nothing it produces is left behind
 * in the user's working tree.
 */
export async function runInTempDirectory(
  request: Omit<RunRequest, 'outputFile'>,
  run: ProcessRunner,
): Promise<TestRun> {
  const directory = await mkdtemp(join(tmpdir(), 'verify-tests-'));

  try {
    return await executeRun({ ...request, outputFile: join(directory, 'results.json') }, run);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

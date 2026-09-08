import { stat } from 'node:fs/promises';

import { analyzeCodebase, type AnalyzeOptions } from '../analysis/analyze.js';
import { type CollectChangesOptions } from '../git/changes.js';
import { analyzeImpact } from '../impact/impact.js';
import { type ImpactAnalysis } from '../impact/types.js';
import { ExitCode, UsageError } from '../../utils/errors.js';
import { discoverTests } from './discover.js';
import { createProcessRunner, type ProcessRunner } from './process.js';
import { DEFAULT_TIMEOUT_MS, runInTempDirectory } from './run.js';
import { selectTests } from './select.js';
import { type SelectionMode, type TestDiscovery, type TestReport, type TestRun } from './types.js';

/** Overrides accepted by {@link runTests}. */
export interface RunTestsOptions extends CollectChangesOptions, AnalyzeOptions {
  /** Whether to run everything or only what the current changes reach. */
  readonly mode?: SelectionMode;
  /** Name filter passed to the runner, so a single test can be run. */
  readonly pattern?: string | null;
  /** How long the runner may take before it is stopped. */
  readonly timeoutMs?: number;
  /** Hops the impact search follows, in `impacted` mode. */
  readonly depth?: number;
  /** Set false to discover and select without running anything. */
  readonly execute?: boolean;
  /** Replaces the real child process layer; used by the tests. */
  readonly processRunner?: ProcessRunner;
}

/** Explains why nothing was run, or `null` when there is a run to make. */
function blockedReason(
  discovery: TestDiscovery,
  selected: number,
  mode: SelectionMode,
): string | null {
  if (discovery.detection === null) {
    return 'No test runner was recognised in this project, so nothing was run.';
  }

  const { framework } = discovery.detection;
  if (discovery.runner === null) {
    return `${framework} is configured here but is not installed, so nothing was run.`;
  }
  if (discovery.files.length === 0) {
    return 'No test files were found, so nothing was run.';
  }
  if (selected === 0) {
    return mode === 'impacted'
      ? 'No test file is affected by the current changes, so nothing was run.'
      : 'No test file was selected, so nothing was run.';
  }

  return null;
}

/** Notes worth adding once a run has happened. */
function runNotes(run: TestRun): readonly string[] {
  const notes: string[] = [];

  if (run.outcome === 'timeout') {
    notes.push(
      `The run was stopped after ${String(run.timeoutMs)}ms; results are incomplete. Raise the timeout to let it finish.`,
    );
  }
  if (run.summary.failed > 0) {
    notes.push(
      'A failing test means the test did not pass. Whether the test or the code it exercises is wrong is not something running it can settle.',
    );
  }

  return notes;
}

/**
 * Discovers, selects and runs a project's tests.
 *
 * Discovery reads the source and never runs anything, so it works whether or
 * not a runner is installed. Running happens only when there is a runner to run
 * and something to point it at; every other case comes back with `run` unset
 * and a note saying why.
 *
 * @throws {UsageError} If the path cannot be read, is not a directory, or the
 *   timeout is not a positive number of milliseconds.
 */
export async function runTests(
  directory: string,
  options: RunTestsOptions = {},
): Promise<TestReport> {
  const mode = options.mode ?? 'all';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new UsageError(`The timeout must be a positive number of milliseconds.`);
  }

  let stats;
  try {
    stats = await stat(directory);
  } catch (cause) {
    throw new UsageError(`Cannot read directory: ${directory}`, { cause });
  }
  if (!stats.isDirectory()) {
    throw new UsageError(`Not a directory: ${directory}`);
  }

  const analysis = await analyzeCodebase(directory, options);
  const discovery = await discoverTests(directory, analysis);

  let impact: ImpactAnalysis | null = null;
  if (mode === 'impacted') {
    impact = await analyzeImpact(directory, options);
  }

  const selection = selectTests(discovery.files, {
    mode,
    pattern: options.pattern ?? null,
    impact,
  });

  // Asked for discovery alone, nothing about the runner matters.
  if (options.execute === false) {
    return { root: directory, discovery, selection, attempted: false, run: null, notes: [] };
  }

  const report = { root: directory, discovery, selection, attempted: true };
  const blocked = blockedReason(discovery, selection.files.length, mode);
  if (blocked !== null) {
    return { ...report, run: null, notes: [blocked] };
  }

  const runner = discovery.runner;
  if (runner === null) {
    return { ...report, run: null, notes: ['The test runner went missing before the run.'] };
  }

  const run = await runInTempDirectory(
    {
      root: directory,
      runner,
      files: selection.files.map((file) => file.path),
      pattern: selection.pattern,
      timeoutMs,
    },
    options.processRunner ?? createProcessRunner(),
  );

  return { ...report, run, notes: runNotes(run) };
}

/**
 * Maps a test report onto the process exit code it should produce.
 *
 * A project with no runner or no tests is not a failure: there was nothing to
 * verify. A runner that is configured but missing is, because the tests that
 * were meant to run did not.
 */
export function exitCodeFor(report: TestReport): ExitCode {
  const { run } = report;

  if (run === null) {
    if (!report.attempted) {
      return ExitCode.Success;
    }
    const configured = report.discovery.detection !== null;
    return configured && report.discovery.runner === null ? ExitCode.Failure : ExitCode.Success;
  }

  return run.outcome === 'pass' ? ExitCode.Success : ExitCode.Failure;
}

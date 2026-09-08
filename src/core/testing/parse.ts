import { isAbsolute, relative } from 'node:path';

import { toPosixPath } from '../analysis/scan.js';
import {
  type TestCaseResult,
  type TestFailure,
  type TestFileResult,
  type TestRunSummary,
  type TestStatus,
} from './types.js';

/**
 * Statuses the runners emit, mapped onto the ones this tool reports.
 *
 * Vitest writes its JSON in the shape Jest established, so one table serves
 * both. Anything unrecognised is reported as skipped rather than guessed at.
 */
const STATUSES: Readonly<Record<string, TestStatus>> = {
  passed: 'passed',
  failed: 'failed',
  pending: 'skipped',
  skipped: 'skipped',
  disabled: 'skipped',
  todo: 'todo',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStrings(source: Record<string, unknown>, key: string): readonly string[] {
  const value = source[key];
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

function readStatus(source: Record<string, unknown>): TestStatus {
  const value = source['status'];
  return typeof value === 'string' ? (STATUSES[value] ?? 'skipped') : 'skipped';
}

/** Rewrites an absolute path from the runner as one relative to the project. */
export function toProjectPath(root: string, path: string): string {
  return toPosixPath(isAbsolute(path) ? relative(root, path) : path);
}

/** Splits a runner's failure text into a headline and the whole of it. */
export function toFailure(detail: string): TestFailure {
  const message = detail.split('\n').find((line) => line.trim() !== '') ?? detail;
  return { message: message.trim(), detail };
}

function parseCase(root: string, file: string, source: unknown): TestCaseResult | null {
  if (!isRecord(source)) {
    return null;
  }

  const title = readString(source, 'title') ?? readString(source, 'fullName');
  if (title === null) {
    return null;
  }

  const suites = readStrings(source, 'ancestorTitles');

  return {
    file: toProjectPath(root, file),
    title,
    suites,
    name: readString(source, 'fullName') ?? [...suites, title].join(' > '),
    status: readStatus(source),
    durationMs: readNumber(source, 'duration'),
    failures: readStrings(source, 'failureMessages').map(toFailure),
  };
}

/** The status of a file, taken from the worst status among its tests. */
function fileStatus(source: Record<string, unknown>, tests: readonly TestCaseResult[]): TestStatus {
  const declared = source['status'];
  if (typeof declared === 'string' && declared in STATUSES) {
    return STATUSES[declared] ?? 'skipped';
  }
  return tests.some((test) => test.status === 'failed') ? 'failed' : 'passed';
}

function parseFile(root: string, source: unknown): TestFileResult | null {
  if (!isRecord(source)) {
    return null;
  }

  const name = readString(source, 'name') ?? readString(source, 'testFilePath');
  if (name === null) {
    return null;
  }

  const assertions = source['assertionResults'];
  const tests = (Array.isArray(assertions) ? assertions : [])
    .map((entry) => parseCase(root, name, entry))
    .filter((entry): entry is TestCaseResult => entry !== null);

  const startedAt = readNumber(source, 'startTime');
  const endedAt = readNumber(source, 'endTime');

  return {
    path: toProjectPath(root, name),
    status: fileStatus(source, tests),
    durationMs: startedAt === null || endedAt === null ? null : Math.max(endedAt - startedAt, 0),
    message: readString(source, 'message'),
    tests,
  };
}

/** Counts the tests of every file by status. */
export function summarise(files: readonly TestFileResult[]): TestRunSummary {
  const counts = { passed: 0, failed: 0, skipped: 0, todo: 0 };
  let tests = 0;

  for (const file of files) {
    for (const test of file.tests) {
      counts[test.status] += 1;
      tests += 1;
    }
  }

  return { files: files.length, tests, ...counts };
}

/** Orders paths by code unit so a run's files do not depend on the locale. */
function byPath(left: TestFileResult, right: TestFileResult): number {
  if (left.path === right.path) {
    return 0;
  }
  return left.path < right.path ? -1 : 1;
}

/**
 * Reads the JSON a runner wrote into this tool's own models.
 *
 * Every field is checked before it is used: the file was produced by another
 * program, and a shape this does not recognise should leave the run reported
 * as unreadable rather than half-read.
 *
 * Returns `null` when the payload is not a run at all.
 */
export function parseRunnerOutput(
  root: string,
  payload: unknown,
): readonly TestFileResult[] | null {
  if (!isRecord(payload)) {
    return null;
  }

  const results = payload['testResults'];
  if (!Array.isArray(results)) {
    return null;
  }

  return results
    .map((entry) => parseFile(root, entry))
    .filter((entry): entry is TestFileResult => entry !== null)
    .sort(byPath);
}

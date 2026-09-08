import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type TestsReport } from '../core/report.js';
import {
  type TestFileResult,
  type TestReport,
  type TestRun,
  type TestSelection,
} from '../core/testing/types.js';
import { createPalette } from '../utils/color.js';
import { formatDuration, formatTestsJson, formatTestsText } from './tests.js';
import { formatTestsReport } from './index.js';

const ESC = String.fromCharCode(27);

const plain = createPalette(false);
const colourful = createPalette(true);

function file(overrides: Partial<TestFileResult> = {}): TestFileResult {
  return {
    path: 'src/cart.test.ts',
    status: 'passed',
    durationMs: 1420,
    message: null,
    tests: [],
    ...overrides,
  };
}

function run(overrides: Partial<TestRun> = {}): TestRun {
  return {
    framework: 'vitest',
    command: ['node', 'vitest'],
    outcome: 'pass',
    exitCode: 0,
    signal: null,
    durationMs: 1420,
    timeoutMs: 120_000,
    stdout: '',
    stderr: '',
    files: [],
    summary: { files: 0, tests: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
    error: null,
    ...overrides,
  };
}

function selection(overrides: Partial<TestSelection> = {}): TestSelection {
  return {
    mode: 'all',
    files: [{ path: 'src/cart.test.ts', reason: null }],
    pattern: null,
    tests: 5,
    ...overrides,
  };
}

function report(overrides: Partial<TestReport> = {}): TestsReport {
  const tests: TestReport = {
    root: '/workspace/demo',
    discovery: {
      detection: { framework: 'vitest', evidence: 'dependency', source: 'package.json' },
      runner: {
        framework: 'vitest',
        entry: '/workspace/demo/node_modules/vitest/vitest.mjs',
        packageDirectory: '/workspace/demo/node_modules/vitest',
        version: '3.2.4',
      },
      files: [
        { path: 'src/cart.test.ts', tests: [] },
        { path: 'src/other.test.ts', tests: [] },
      ],
      tests: 48,
      ...overrides.discovery,
    },
    selection: selection(overrides.selection),
    attempted: true,
    run: null,
    notes: [],
    ...overrides,
  };

  return { tool: { name: 'verify', version: '1.2.3' }, target: '/workspace/demo', tests };
}

describe('formatDuration', () => {
  it('shows a sub-second duration in milliseconds', () => {
    assert.equal(formatDuration(0), '0ms');
    assert.equal(formatDuration(49), '49ms');
    assert.equal(formatDuration(999), '999ms');
  });

  it('shows a longer duration in seconds, to two places', () => {
    assert.equal(formatDuration(1000), '1.00s');
    assert.equal(formatDuration(1420), '1.42s');
    assert.equal(formatDuration(62_500), '62.50s');
  });

  it('renders the same duration the same way every time', () => {
    assert.equal(formatDuration(1420), formatDuration(1420));
  });
});

describe('formatTestsText', () => {
  it('names the runner it found', () => {
    assert.match(formatTestsText(report(), plain), /^vitest 3\.2\.4$/m);
  });

  it('says when no runner was recognised', () => {
    const output = formatTestsText(
      report({ discovery: { detection: null, runner: null, files: [], tests: 0 } }),
      plain,
    );

    assert.match(output, /^no test runner recognised$/m);
  });

  it('says when the runner is configured but not installed', () => {
    const output = formatTestsText(
      report({
        discovery: {
          detection: { framework: 'jest', evidence: 'dependency', source: 'package.json' },
          runner: null,
          files: [],
          tests: 0,
        },
      }),
      plain,
    );

    assert.match(output, /^jest \(not installed\)$/m);
  });

  it('reports what was discovered and what was selected', () => {
    const output = formatTestsText(report(), plain);

    assert.match(output, /^Discovered:\n {2}2 test files\n {2}48 tests$/m);
    assert.match(output, /^Selected:\n {2}5 tests in 1 file$/m);
  });

  it('names the filter when one was given', () => {
    const output = formatTestsText(
      report({ selection: selection({ pattern: 'adds items' }) }),
      plain,
    );

    assert.match(output, /^ {2}matching "adds items"$/m);
  });

  it('explains an impacted selection', () => {
    const output = formatTestsText(
      report({
        selection: selection({
          mode: 'impacted',
          files: [{ path: 'src/cart.test.ts', reason: 'src/cart.test.ts imports total' }],
        }),
      }),
      plain,
    );

    assert.match(
      output,
      /^Selected because:\n {2}src\/cart\.test\.ts {2}src\/cart\.test\.ts imports total$/m,
    );
  });

  it('leaves the reasons out when everything was selected', () => {
    assert.doesNotMatch(formatTestsText(report(), plain), /Selected because:/);
  });

  it('reports results and duration in the documented shape', () => {
    const output = formatTestsText(
      report({
        run: run({
          outcome: 'fail',
          durationMs: 1420,
          summary: { files: 2, tests: 5, passed: 4, failed: 1, skipped: 0, todo: 0 },
        }),
      }),
      plain,
    );

    assert.match(output, /^Results:\n {2}4 passed\n {2}1 failed$/m);
    assert.match(output, /^Duration:\n {2}1\.42s$/m);
  });

  it('counts skipped and todo tests when there are some', () => {
    const output = formatTestsText(
      report({
        run: run({ summary: { files: 1, tests: 4, passed: 1, failed: 0, skipped: 2, todo: 1 } }),
      }),
      plain,
    );

    assert.match(output, /^ {2}2 skipped$/m);
    assert.match(output, /^ {2}1 todo$/m);
  });

  it('shows a failing test with its message and stack', () => {
    const output = formatTestsText(
      report({
        run: run({
          outcome: 'fail',
          summary: { files: 1, tests: 1, passed: 0, failed: 1, skipped: 0, todo: 0 },
          files: [
            file({
              status: 'failed',
              tests: [
                {
                  file: 'src/cart.test.ts',
                  title: 'subtracts',
                  suites: ['cart'],
                  name: 'cart > subtracts',
                  status: 'failed',
                  durationMs: 5,
                  failures: [
                    {
                      message: 'AssertionError: expected 1 to be 2',
                      detail: 'AssertionError: expected 1 to be 2\n    at cart.test.ts:5:24',
                    },
                  ],
                },
              ],
            }),
          ],
        }),
      }),
      plain,
    );

    assert.match(output, /^Failures:\n {2}src\/cart\.test\.ts > cart > subtracts$/m);
    assert.match(output, /^ {6}AssertionError: expected 1 to be 2$/m);
    assert.match(output, /^ {6} {4}at cart\.test\.ts:5:24$/m);
  });

  it('shows a file that failed before any test ran', () => {
    const output = formatTestsText(
      report({
        run: run({ outcome: 'fail', files: [file({ message: 'Cannot find module ./gone.js' })] }),
      }),
      plain,
    );

    assert.match(output, /^Failures:\n {2}src\/cart\.test\.ts$/m);
    assert.match(output, /Cannot find module \.\/gone\.js/);
  });

  it('cuts a very long stack short rather than flooding the output', () => {
    const detail = Array.from({ length: 40 }, (_, index) => `line ${String(index)}`).join('\n');
    const output = formatTestsText(
      report({
        run: run({
          outcome: 'fail',
          files: [file({ status: 'failed', message: detail })],
        }),
      }),
      plain,
    );

    assert.match(output, /\.\.\. 26 more lines/);
  });

  it('shows the runner output when the run could not be completed', () => {
    const output = formatTestsText(
      report({
        run: run({
          outcome: 'error',
          exitCode: 2,
          stderr: 'config is broken',
          error: 'vitest exited with 2',
        }),
      }),
      plain,
    );

    assert.match(output, /^Runner output:\n {6}config is broken$/m);
    assert.match(output, /^Error:\n {2}vitest exited with 2$/m);
    assert.match(output, /The run could not be completed\./);
  });

  it('says plainly when a run was stopped', () => {
    const output = formatTestsText(
      report({ run: run({ outcome: 'timeout', timeoutMs: 400, error: 'stopped' }) }),
      plain,
    );

    assert.match(output, /The run was stopped after 400ms\./);
  });

  it('says plainly when everything passed', () => {
    const output = formatTestsText(
      report({
        run: run({ summary: { files: 1, tests: 3, passed: 3, failed: 0, skipped: 0, todo: 0 } }),
      }),
      plain,
    );

    assert.match(output, /✔ All selected tests passed\./);
  });

  it('prints the notes that apply to the run', () => {
    const output = formatTestsText(report({ notes: ['No test files were found.'] }), plain);

    assert.match(output, /^Notes:\n {2}No test files were found\.$/m);
  });

  it('leaves the run blocks out when nothing was run', () => {
    const output = formatTestsText(report(), plain);

    assert.doesNotMatch(output, /Results:/);
    assert.doesNotMatch(output, /Duration:/);
  });

  it('colours the output when the palette is enabled', () => {
    assert.ok(formatTestsText(report({ run: run() }), colourful).includes(ESC));
  });

  it('emits no escape sequences when the palette is disabled', () => {
    assert.ok(!formatTestsText(report({ run: run() }), plain).includes(ESC));
  });

  it('renders the same report the same way every time', () => {
    assert.equal(
      formatTestsText(report({ run: run() }), plain),
      formatTestsText(report({ run: run() }), plain),
    );
  });
});

describe('formatTestsJson', () => {
  it('serialises the whole report', () => {
    const source = report({ run: run() });
    const parsed: unknown = JSON.parse(formatTestsJson(source));

    assert.deepEqual(parsed, JSON.parse(JSON.stringify(source)));
  });

  it('pretty-prints the payload', () => {
    assert.match(formatTestsJson(report()), /^\{\n {2}"tool": \{/);
  });
});

describe('formatTestsReport', () => {
  it('dispatches to the text reporter', () => {
    assert.match(formatTestsReport(report(), { format: 'text', palette: plain }), /Discovered:/);
  });

  it('dispatches to the JSON reporter', () => {
    assert.equal(
      formatTestsReport(report(), { format: 'json', palette: plain }),
      formatTestsJson(report()),
    );
  });
});

import { type TestReport, type TestRun } from '../core/testing/types.js';
import { type TestsReport } from '../core/report.js';
import { type Palette } from '../utils/color.js';

const JSON_INDENT = 2;

/** Lines of a failure's detail kept before it is cut short. */
const MAX_FAILURE_LINES = 14;

/** Appends a titled block, or nothing at all when the block would be empty. */
function section(lines: string[], title: string, body: readonly string[], palette: Palette): void {
  if (body.length === 0) {
    return;
  }
  if (lines.length > 0) {
    lines.push('');
  }
  lines.push(palette.bold(title), ...body);
}

/** Renders a count with a label that agrees with it. */
function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${String(value)} ${value === 1 ? singular : plural}`;
}

/**
 * Renders a duration the way a person reads one.
 *
 * Sub-second runs are shown in milliseconds and anything longer in seconds to
 * two decimal places, so the same duration always prints the same way.
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${String(Math.round(milliseconds))}ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function describeRunner(report: TestReport): string | null {
  const { detection, runner } = report.discovery;
  if (detection === null) {
    return null;
  }

  const version = runner?.version ?? null;
  const named = version === null ? detection.framework : `${detection.framework} ${version}`;
  return runner === null ? `${named} (not installed)` : named;
}

function discoveredLines(report: TestReport): readonly string[] {
  const { files, tests } = report.discovery;
  if (files.length === 0 && tests === 0) {
    return [];
  }
  return [`  ${count(files.length, 'test file')}`, `  ${count(tests, 'test')}`];
}

function selectedLines(report: TestReport): readonly string[] {
  const { selection, discovery } = report;
  if (discovery.files.length === 0) {
    return [];
  }

  const lines = [`  ${count(selection.tests, 'test')} in ${count(selection.files.length, 'file')}`];
  if (selection.pattern !== null) {
    lines.push(`  matching ${JSON.stringify(selection.pattern)}`);
  }
  return lines;
}

/** Why each file was selected, shown only when the selection was narrowed. */
function reasonLines(report: TestReport, palette: Palette): readonly string[] {
  if (report.selection.mode !== 'impacted') {
    return [];
  }

  return report.selection.files.map(
    (file) => `  ${file.path}  ${palette.dim(file.reason ?? 'selected')}`,
  );
}

function resultLines(run: TestRun, palette: Palette): readonly string[] {
  const { summary } = run;
  const lines: string[] = [];

  if (summary.passed > 0) {
    lines.push(`  ${palette.green(count(summary.passed, 'passed', 'passed'))}`);
  }
  if (summary.failed > 0) {
    lines.push(`  ${palette.red(count(summary.failed, 'failed', 'failed'))}`);
  }
  if (summary.skipped > 0) {
    lines.push(`  ${count(summary.skipped, 'skipped', 'skipped')}`);
  }
  if (summary.todo > 0) {
    lines.push(`  ${count(summary.todo, 'todo', 'todo')}`);
  }
  if (lines.length === 0) {
    lines.push('  no tests reported');
  }

  return lines;
}

/** Indents a runner's failure text, cutting it short when it runs long. */
function failureDetail(detail: string, palette: Palette): readonly string[] {
  const lines = detail.split('\n').filter((line, index) => index === 0 || line.trim() !== '');
  const shown = lines.slice(0, MAX_FAILURE_LINES).map((line) => `      ${line}`);

  if (lines.length > MAX_FAILURE_LINES) {
    shown.push(palette.dim(`      ... ${String(lines.length - MAX_FAILURE_LINES)} more lines`));
  }
  return shown;
}

function failureLines(run: TestRun, palette: Palette): readonly string[] {
  const lines: string[] = [];

  for (const file of run.files) {
    if (file.message !== null && file.tests.length === 0) {
      lines.push(`  ${palette.red(file.path)}`, ...failureDetail(file.message, palette));
    }

    for (const test of file.tests) {
      if (test.status !== 'failed') {
        continue;
      }
      lines.push(`  ${palette.red(`${file.path} > ${test.name}`)}`);
      for (const failure of test.failures) {
        lines.push(...failureDetail(failure.detail, palette));
      }
    }
  }

  return lines;
}

/** The runner's own output, shown when it is all there is to go on. */
function outputLines(run: TestRun, palette: Palette): readonly string[] {
  if (run.outcome !== 'error' && run.outcome !== 'timeout') {
    return [];
  }

  const text = [run.stderr, run.stdout]
    .map((stream) => stream.trim())
    .find((stream) => stream !== '');
  return text === undefined ? [] : failureDetail(text, palette);
}

function describeOutcome(run: TestRun, palette: Palette): string {
  switch (run.outcome) {
    case 'pass':
      return `${palette.green('✔')} All selected tests passed.`;
    case 'fail':
      return `${palette.red('✖')} ${count(run.summary.failed, 'test')} did not pass.`;
    case 'timeout':
      return `${palette.red('✖')} The run was stopped after ${formatDuration(run.timeoutMs)}.`;
    case 'error':
      return `${palette.red('✖')} The run could not be completed.`;
  }
}

/**
 * Renders a test report as the human-facing summary shown by default.
 *
 * Failures carry the runner's own message and stack. What they mean — a broken
 * change, a stale test, a flaky one — is not something running a test can
 * settle, and nothing here says otherwise.
 */
export function formatTestsText(report: TestsReport, palette: Palette): string {
  const { tests } = report;
  const runner = describeRunner(tests);
  const lines: string[] = [];

  section(lines, 'Discovered:', discoveredLines(tests), palette);
  section(lines, 'Selected:', selectedLines(tests), palette);
  section(lines, 'Selected because:', reasonLines(tests, palette), palette);

  const { run } = tests;
  if (run !== null) {
    section(lines, 'Results:', resultLines(run, palette), palette);
    section(lines, 'Duration:', [`  ${formatDuration(run.durationMs)}`], palette);
    section(lines, 'Failures:', failureLines(run, palette), palette);
    section(lines, 'Runner output:', outputLines(run, palette), palette);
    if (run.error !== null) {
      section(lines, 'Error:', [`  ${run.error}`], palette);
    }
  }

  section(
    lines,
    'Notes:',
    tests.notes.map((note) => palette.dim(`  ${note}`)),
    palette,
  );

  if (run !== null) {
    lines.push('', describeOutcome(run, palette));
  }

  const header = runner === null ? palette.dim('no test runner recognised') : palette.dim(runner);
  return [header, '', ...lines].join('\n');
}

/** Renders a test report as pretty-printed JSON for scripts and other tools. */
export function formatTestsJson(report: TestsReport): string {
  return JSON.stringify(report, null, JSON_INDENT);
}

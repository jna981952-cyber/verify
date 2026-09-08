import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { elementAt } from '../../test-helpers/assert.js';
import { createGitFixture, type GitFixture } from '../../test-helpers/git.js';
import {
  createRunnerProject,
  runnerDoubleFiles,
  runnerResults,
  type RunnerBehaviour,
  type RunnerProject,
  type RunnerProjectOptions,
} from '../../test-helpers/runner.js';
import { UsageError } from '../../utils/errors.js';
import { exitCodeFor, runTests } from './engine.js';
import { type TestReport, type TestRun } from './types.js';

/** Reads the run of a report that was expected to have made one. */
function runOf(report: TestReport): TestRun {
  assert.ok(report.run !== null, 'expected the tests to have been run');
  return report.run;
}

/** A project with two test files, one of which depends on a source file. */
const FILES: Readonly<Record<string, string>> = {
  'src/cart.ts': 'export function total(): number {\n  return 1;\n}\n',
  'src/cart.test.ts': [
    "import { total } from './cart.js';",
    '',
    "describe('cart', () => {",
    "  it('adds', () => total());",
    "  it('subtracts', () => total());",
    '});',
    '',
  ].join('\n'),
  'src/other.test.ts': "it('unrelated', () => {});\n",
};

/**
 * Results reporting both files as passing.
 *
 * The paths are relative because a stand-in has no need of absolute ones; the
 * parser's own tests cover the absolute paths the real runners write.
 */
function passingResults(): Record<string, unknown> {
  return runnerResults([
    {
      name: 'src/cart.test.ts',
      startTime: 100,
      endTime: 1520,
      tests: [
        { title: 'adds', status: 'passed', ancestorTitles: ['cart'], duration: 3 },
        { title: 'subtracts', status: 'passed', ancestorTitles: ['cart'], duration: 4 },
      ],
    },
    { name: 'src/other.test.ts', tests: [{ title: 'unrelated', status: 'passed', duration: 1 }] },
  ]);
}

describe('runTests', () => {
  const cleanups: (() => Promise<void>)[] = [];

  after(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  });

  async function project(options: Partial<RunnerProjectOptions> = {}): Promise<RunnerProject> {
    const created = await createRunnerProject({ framework: 'vitest', files: FILES, ...options });
    cleanups.push(created.cleanup.bind(created));
    return created;
  }

  /** A repository holding the project, so impact analysis has changes to read. */
  async function repository(
    behaviour: RunnerBehaviour | null = null,
    files: Readonly<Record<string, string>> = FILES,
  ): Promise<GitFixture> {
    const created = await createGitFixture({
      '.gitignore': 'node_modules/\n',
      'package.json': `${JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }, null, 2)}\n`,
      ...files,
      ...(behaviour === null ? {} : runnerDoubleFiles('vitest', behaviour)),
    });
    cleanups.push(created.cleanup.bind(created));
    await created.commit('initial');
    return created;
  }

  describe('discovery', () => {
    it('discovers a Vitest project without running anything', async () => {
      const created = await project({ behaviour: null });

      const report = await runTests(created.root, { execute: false });

      assert.equal(report.discovery.detection?.framework, 'vitest');
      assert.deepEqual(
        report.discovery.files.map((file) => file.path),
        ['src/cart.test.ts', 'src/other.test.ts'],
      );
      assert.equal(report.discovery.tests, 3);
      assert.equal(report.run, null);
    });

    it('discovers a Jest project the same way', async () => {
      const created = await project({ framework: 'jest', behaviour: null });

      const report = await runTests(created.root, { execute: false });

      assert.equal(report.discovery.detection?.framework, 'jest');
      assert.equal(report.discovery.tests, 3);
    });

    it('reports a project with no tests', async () => {
      const created = await project({
        behaviour: {},
        files: { 'src/cart.ts': 'export const a = 1;\n' },
      });

      const report = await runTests(created.root);

      assert.deepEqual(report.discovery.files, []);
      assert.equal(report.run, null);
      assert.ok(elementAt(report.notes).includes('No test files were found'));
    });

    it('reports a project with no recognised runner', async () => {
      const created = await project({ behaviour: null, manifest: { devDependencies: {} } });

      const report = await runTests(created.root);

      assert.equal(report.discovery.detection, null);
      assert.ok(elementAt(report.notes).includes('No test runner was recognised'));
      assert.equal(exitCodeFor(report), 0);
    });

    it('reports a runner that is configured but not installed', async () => {
      const created = await project({ behaviour: null });

      const report = await runTests(created.root);

      assert.equal(report.discovery.runner, null);
      assert.ok(elementAt(report.notes).includes('is not installed'));
      assert.equal(exitCodeFor(report), 1);
    });

    it('reads the version of the runner it found', async () => {
      const created = await project({ behaviour: {} });

      const report = await runTests(created.root, { execute: false });

      assert.equal(report.discovery.runner?.version, '0.0.0-fixture');
    });

    it('discovers several test files and the tests in each', async () => {
      const created = await project({
        behaviour: null,
        files: {
          ...FILES,
          'src/third.test.ts': "describe('a', () => { it('b', () => {}); it('c', () => {}); });\n",
        },
      });

      const report = await runTests(created.root, { execute: false });

      assert.equal(report.discovery.files.length, 3);
      assert.equal(report.discovery.tests, 5);
    });
  });

  describe('running', () => {
    it('runs a passing suite and reports what it found', async () => {
      const created = await project({
        behaviour: { exitCode: 0, stdout: 'ran everything\n', results: passingResults() },
      });

      const report = await runTests(created.root);

      assert.equal(runOf(report).outcome, 'pass');
      assert.equal(runOf(report).exitCode, 0);
      assert.deepEqual(runOf(report).summary, {
        files: 2,
        tests: 3,
        passed: 3,
        failed: 0,
        skipped: 0,
        todo: 0,
      });
      assert.equal(exitCodeFor(report), 0);
    });

    it('reports a failing test with the runner’s own message and stack', async () => {
      const created = await project({
        behaviour: {
          exitCode: 1,
          results: runnerResults([
            {
              name: 'src/cart.test.ts',
              tests: [
                { title: 'adds', status: 'passed', ancestorTitles: ['cart'] },
                {
                  title: 'subtracts',
                  status: 'failed',
                  ancestorTitles: ['cart'],
                  failureMessages: ['AssertionError: expected 1 to be 2\n    at cart.test.ts:5:24'],
                },
              ],
            },
          ]),
        },
      });

      const report = await runTests(created.root);
      const failed = elementAt(elementAt(runOf(report).files).tests, 1);

      assert.equal(runOf(report).outcome, 'fail');
      assert.equal(failed.name, 'cart > subtracts');
      assert.equal(elementAt(failed.failures).message, 'AssertionError: expected 1 to be 2');
      assert.match(elementAt(failed.failures).detail, /at cart\.test\.ts:5:24/);
      assert.equal(exitCodeFor(report), 1);
    });

    it('says a failing test is not a verdict on the code', async () => {
      const created = await project({
        behaviour: {
          exitCode: 1,
          results: runnerResults([
            { name: 'src/cart.test.ts', tests: [{ title: 'a', status: 'failed' }] },
          ]),
        },
      });

      const report = await runTests(created.root);

      assert.ok(report.notes.some((note) => note.includes('did not pass')));
      assert.ok(
        report.notes.some((note) => note.includes('is not something running it can settle')),
      );
    });

    it('reports a test that threw rather than asserted', async () => {
      const created = await project({
        behaviour: {
          exitCode: 1,
          results: runnerResults([
            {
              name: 'src/cart.test.ts',
              tests: [
                {
                  title: 'explodes',
                  status: 'failed',
                  failureMessages: ['TypeError: total is not a function\n    at cart.test.ts:4:5'],
                },
              ],
            },
          ]),
        },
      });

      const report = await runTests(created.root);

      assert.match(
        elementAt(elementAt(elementAt(runOf(report).files).tests).failures).message,
        /TypeError: total is not a function/,
      );
    });

    it('reports a file that failed before any test ran', async () => {
      const created = await project({
        behaviour: {
          exitCode: 1,
          results: runnerResults([
            { name: 'src/cart.test.ts', message: 'Cannot find module ./gone.js', tests: [] },
          ]),
        },
      });

      const report = await runTests(created.root);

      assert.equal(elementAt(runOf(report).files).message, 'Cannot find module ./gone.js');
    });

    it('counts skipped and todo tests separately', async () => {
      const created = await project({
        behaviour: {
          results: runnerResults([
            {
              name: 'src/cart.test.ts',
              tests: [
                { title: 'a', status: 'passed' },
                { title: 'b', status: 'pending' },
                { title: 'c', status: 'todo' },
              ],
            },
          ]),
        },
      });

      const report = await runTests(created.root);

      assert.equal(runOf(report).summary.skipped, 1);
      assert.equal(runOf(report).summary.todo, 1);
      assert.equal(runOf(report).outcome, 'pass');
    });

    it('captures standard output and standard error', async () => {
      const created = await project({
        behaviour: { stdout: 'from the tests\n', stderr: 'a warning\n', results: passingResults() },
      });

      const report = await runTests(created.root);

      assert.equal(runOf(report).stdout, 'from the tests\n');
      assert.equal(runOf(report).stderr, 'a warning\n');
    });

    it('reports how long the run took and how long it was allowed', async () => {
      const created = await project({ behaviour: { results: passingResults() } });

      const report = await runTests(created.root);

      assert.ok(runOf(report).durationMs >= 0);
      assert.equal(runOf(report).timeoutMs, 120_000);
      assert.equal(elementAt(runOf(report).files).durationMs, 1420);
    });

    it('reports a runner that exits non-zero with nothing to show for it', async () => {
      const created = await project({ behaviour: { exitCode: 2, stderr: 'config is broken\n' } });

      const report = await runTests(created.root);

      assert.equal(runOf(report).outcome, 'error');
      assert.equal(runOf(report).exitCode, 2);
      assert.match(runOf(report).stderr, /config is broken/);
      assert.equal(exitCodeFor(report), 1);
    });

    it('reports a runner whose output will not parse', async () => {
      const created = await project({ behaviour: { results: {}, malformedOutput: true } });

      const report = await runTests(created.root);

      assert.equal(runOf(report).outcome, 'error');
      assert.match(runOf(report).error ?? '', /did not leave readable results/);
    });

    it('reports a runner that wrote a shape it does not recognise', async () => {
      const created = await project({ behaviour: { results: { somethingElse: true } } });

      const report = await runTests(created.root);

      assert.equal(runOf(report).outcome, 'error');
    });

    it('stops a run that outstays its timeout', async () => {
      const created = await project({
        behaviour: { delayMs: 10_000, results: passingResults() },
      });

      const report = await runTests(created.root, { timeoutMs: 400 });

      assert.equal(runOf(report).outcome, 'timeout');
      assert.match(runOf(report).error ?? '', /stopped after 400ms/);
      assert.deepEqual(runOf(report).files, []);
      assert.ok(report.notes.some((note) => note.includes('results are incomplete')));
      assert.equal(exitCodeFor(report), 1);
    });

    it('rejects a timeout that is not a positive number of milliseconds', async () => {
      const created = await project({ behaviour: null });

      await assert.rejects(runTests(created.root, { timeoutMs: 0 }), UsageError);
      await assert.rejects(runTests(created.root, { timeoutMs: -1 }), UsageError);
    });

    it('discovers without running when asked not to run', async () => {
      const created = await project({ behaviour: { results: passingResults() } });

      const report = await runTests(created.root, { execute: false });

      assert.equal(report.run, null);
      assert.equal(report.discovery.files.length, 2);
      assert.equal(await created.invocation(), null);
    });
  });

  describe('what the runner is asked to do', () => {
    it('drives Vitest in run mode with the selected files', async () => {
      const created = await project({ behaviour: { results: passingResults() } });

      await runTests(created.root);
      const invocation = (await created.invocation()) ?? [];

      assert.equal(invocation[0], 'run');
      assert.ok(invocation.includes('--reporter=json'));
      assert.ok(invocation.includes('src/cart.test.ts'));
      assert.ok(invocation.includes('src/other.test.ts'));
    });

    it('drives Jest with exact paths', async () => {
      const created = await project({
        framework: 'jest',
        behaviour: { results: passingResults() },
      });

      await runTests(created.root);
      const invocation = (await created.invocation()) ?? [];

      assert.ok(invocation.includes('--json'));
      assert.ok(invocation.includes('--runTestsByPath'));
      assert.ok(invocation.includes('src/cart.test.ts'));
    });

    it('passes a name filter through so one test can be run', async () => {
      const created = await project({
        behaviour: {
          results: runnerResults([
            {
              name: 'src/cart.test.ts',
              tests: [{ title: 'adds', status: 'passed', ancestorTitles: ['cart'] }],
            },
          ]),
        },
      });

      const report = await runTests(created.root, { pattern: 'adds' });
      const invocation = (await created.invocation()) ?? [];

      assert.equal(report.selection.pattern, 'adds');
      assert.ok(invocation.includes('-t'));
      assert.ok(invocation.includes('adds'));
      assert.equal(runOf(report).summary.tests, 1);
    });

    it('works from a path containing spaces', async () => {
      const created = await project({
        directory: 'my project',
        behaviour: { results: passingResults() },
      });

      const report = await runTests(created.root);

      assert.ok(created.root.includes(' '));
      assert.equal(runOf(report).outcome, 'pass');
      assert.equal(runOf(report).summary.tests, 3);
    });

    it('leaves nothing behind in the project it ran in', async () => {
      const created = await project({ behaviour: { results: passingResults() } });

      await runTests(created.root);
      const report = await runTests(created.root, { execute: false });

      assert.deepEqual(
        report.discovery.files.map((file) => file.path),
        ['src/cart.test.ts', 'src/other.test.ts'],
      );
    });
  });

  describe('invalid paths', () => {
    it('rejects a path that does not exist', async () => {
      await assert.rejects(runTests('/definitely/not/here'), (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /Cannot read directory/);
        return true;
      });
    });

    it('rejects a path that is a file', async () => {
      const created = await project({ behaviour: null });

      await assert.rejects(runTests(join(created.root, 'package.json')), (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /Not a directory/);
        return true;
      });
    });
  });

  describe('impacted selection', () => {
    it('selects only the tests the change reached', async () => {
      const repo = await repository();
      await repo.write('src/cart.ts', 'export function total(): number {\n  return 2;\n}\n');

      const report = await runTests(repo.path, { mode: 'impacted', execute: false });

      assert.equal(report.selection.mode, 'impacted');
      assert.deepEqual(
        report.selection.files.map((file) => file.path),
        ['src/cart.test.ts'],
      );
      assert.equal(report.selection.tests, 2);
    });

    it('explains why each selected test was chosen', async () => {
      const repo = await repository();
      await repo.write('src/cart.ts', 'export function total(): number {\n  return 2;\n}\n');

      const report = await runTests(repo.path, { mode: 'impacted', execute: false });

      assert.match(
        elementAt(report.selection.files).reason ?? '',
        /src\/cart\.test\.ts imports total from src\/cart\.ts/,
      );
    });

    it('leaves the unrelated tests out', async () => {
      const repo = await repository();
      await repo.write('src/cart.ts', 'export function total(): number {\n  return 2;\n}\n');

      const report = await runTests(repo.path, { mode: 'impacted', execute: false });

      assert.ok(!report.selection.files.some((file) => file.path === 'src/other.test.ts'));
      assert.equal(report.discovery.files.length, 2);
    });

    it('runs the runner against the selected file alone', async () => {
      const repo = await repository({ results: passingResults() });
      await repo.write('src/cart.ts', 'export function total(): number {\n  return 2;\n}\n');

      const report = await runTests(repo.path, { mode: 'impacted' });
      const invocation: unknown = JSON.parse(
        await readFile(join(repo.path, 'node_modules/vitest/invocation.json'), 'utf8'),
      );

      assert.equal(runOf(report).outcome, 'pass');
      assert.deepEqual(
        (invocation as string[]).filter((arg) => arg.endsWith('.test.ts')),
        ['src/cart.test.ts'],
      );
    });

    it('runs nothing when the change reached no tests', async () => {
      const repo = await repository({ results: passingResults() });
      await repo.write('README.md', '# changed\n');

      const report = await runTests(repo.path, { mode: 'impacted' });

      assert.deepEqual(report.selection.files, []);
      assert.equal(report.run, null);
      assert.ok(elementAt(report.notes).includes('No test file is affected'));
      assert.equal(exitCodeFor(report), 0);
    });

    it('selects a test file that changed itself', async () => {
      const repo = await repository();
      await repo.write('src/other.test.ts', "it('unrelated but edited', () => {});\n");

      const report = await runTests(repo.path, { mode: 'impacted', execute: false });

      assert.deepEqual(
        report.selection.files.map((file) => file.path),
        ['src/other.test.ts'],
      );
      assert.equal(elementAt(report.selection.files).reason, 'src/other.test.ts changed');
    });

    it('selects everything when no mode was asked for', async () => {
      const repo = await repository();
      await repo.write('src/cart.ts', 'export function total(): number {\n  return 2;\n}\n');

      const report = await runTests(repo.path, { execute: false });

      assert.equal(report.selection.mode, 'all');
      assert.equal(report.selection.files.length, 2);
    });
  });

  it('produces the same report twice for the same project', async () => {
    const created = await project({ behaviour: null });

    assert.deepEqual(
      await runTests(created.root, { execute: false }),
      await runTests(created.root, { execute: false }),
    );
  });
});

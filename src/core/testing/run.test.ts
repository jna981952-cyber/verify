import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join, resolve, sep } from 'node:path';

import { elementAt } from '../../test-helpers/assert.js';
import { runnerResults } from '../../test-helpers/runner.js';
import { type ProcessRequest, type ProcessResult, type ProcessRunner } from './process.js';
import { buildArgs, buildEnv, executeRun, outcomeOf, type RunRequest } from './run.js';
import { type RunnerLocation, type TestFramework } from './types.js';

const ROOT = resolve(sep, 'workspace', 'demo');
const OUTPUT = resolve(sep, 'tmp', 'results.json');

function location(framework: TestFramework): RunnerLocation {
  return {
    framework,
    entry: join(ROOT, 'node_modules', framework, 'entry.mjs'),
    packageDirectory: join(ROOT, 'node_modules', framework),
    version: '1.0.0',
  };
}

function request(framework: TestFramework, overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    root: ROOT,
    runner: location(framework),
    files: [],
    pattern: null,
    timeoutMs: 5000,
    outputFile: OUTPUT,
    ...overrides,
  };
}

/** A process runner that records its request and answers with a fixed result. */
function stub(result: Partial<ProcessResult>): {
  runner: ProcessRunner;
  requests: ProcessRequest[];
} {
  const requests: ProcessRequest[] = [];
  const runner: ProcessRunner = (incoming) => {
    requests.push(incoming);
    return Promise.resolve({
      code: 0,
      signal: null,
      stdout: '',
      stderr: '',
      durationMs: 12,
      timedOut: false,
      error: null,
      ...result,
    });
  };

  return { runner, requests };
}

describe('buildArgs', () => {
  it('drives Vitest in run mode with a JSON report', () => {
    assert.deepEqual(buildArgs(request('vitest')), [
      location('vitest').entry,
      'run',
      '--reporter=json',
      `--outputFile=${OUTPUT}`,
    ]);
  });

  it('passes selected files to Vitest as positional filters', () => {
    assert.deepEqual(buildArgs(request('vitest', { files: ['src/a.test.ts', 'src/b.test.ts'] })), [
      location('vitest').entry,
      'run',
      '--reporter=json',
      `--outputFile=${OUTPUT}`,
      'src/a.test.ts',
      'src/b.test.ts',
    ]);
  });

  it('drives Jest with a JSON report', () => {
    assert.deepEqual(buildArgs(request('jest')), [
      location('jest').entry,
      '--json',
      `--outputFile=${OUTPUT}`,
    ]);
  });

  it('gives Jest exact paths rather than patterns', () => {
    assert.deepEqual(buildArgs(request('jest', { files: ['src/a b.test.ts'] })), [
      location('jest').entry,
      '--json',
      `--outputFile=${OUTPUT}`,
      '--runTestsByPath',
      'src/a b.test.ts',
    ]);
  });

  it('passes a name filter to either runner', () => {
    assert.ok(buildArgs(request('vitest', { pattern: 'adds items' })).includes('adds items'));
    assert.ok(buildArgs(request('jest', { pattern: 'adds items' })).includes('-t'));
  });
});

describe('buildEnv', () => {
  it('switches colour off for captured output', () => {
    const env = buildEnv();

    assert.equal(env['NO_COLOR'], '1');
    assert.equal(env['FORCE_COLOR'], '0');
  });

  it('keeps the environment the process already had', () => {
    assert.equal(buildEnv()['PATH'], process.env['PATH']);
  });
});

describe('outcomeOf', () => {
  const base = { timedOut: false, startupError: null, files: [], failed: 0, exitCode: 0 };

  it('reports a clean run as a pass', () => {
    assert.equal(outcomeOf(base), 'pass');
  });

  it('reports a failing test as a fail', () => {
    assert.equal(outcomeOf({ ...base, failed: 1, exitCode: 1 }), 'fail');
  });

  it('reports a run that was stopped as a timeout', () => {
    assert.equal(outcomeOf({ ...base, timedOut: true }), 'timeout');
  });

  it('reports a runner that would not start as an error', () => {
    assert.equal(outcomeOf({ ...base, startupError: 'ENOENT', files: null }), 'error');
  });

  it('reports unreadable output as an error', () => {
    assert.equal(outcomeOf({ ...base, files: null }), 'error');
  });

  it('reports a non-zero exit with nothing to show for it as an error', () => {
    assert.equal(outcomeOf({ ...base, exitCode: 1 }), 'error');
  });

  it('prefers the timeout over anything else', () => {
    assert.equal(outcomeOf({ ...base, timedOut: true, failed: 3, startupError: 'x' }), 'timeout');
  });
});

describe('executeRun', () => {
  it('runs the runner with the current Node executable', async () => {
    const { runner, requests } = stub({});

    await executeRun(request('vitest'), runner);

    const sent = elementAt(requests);

    assert.equal(sent.command, process.execPath);
    assert.equal(sent.cwd, ROOT);
    assert.equal(sent.timeoutMs, 5000);
  });

  it('keeps what the runner printed', async () => {
    const { runner } = stub({ stdout: 'ran 2 tests', stderr: 'a warning' });

    const run = await executeRun(request('vitest'), runner);

    assert.equal(run.stdout, 'ran 2 tests');
    assert.equal(run.stderr, 'a warning');
  });

  it('reports a run it could not read as an error', async () => {
    const { runner } = stub({});

    const run = await executeRun(request('vitest'), runner);

    assert.equal(run.outcome, 'error');
    assert.match(run.error ?? '', /did not leave readable results/);
    assert.deepEqual(run.files, []);
  });

  it('reports a runner that would not start', async () => {
    const { runner } = stub({ code: null, error: 'spawn ENOENT' });

    const run = await executeRun(request('jest'), runner);

    assert.equal(run.outcome, 'error');
    assert.match(run.error ?? '', /Could not start jest: spawn ENOENT/);
  });

  it('reports a run that was stopped as a timeout', async () => {
    const { runner } = stub({ timedOut: true, code: null, signal: 'SIGKILL' });

    const run = await executeRun(request('vitest', { timeoutMs: 250 }), runner);

    assert.equal(run.outcome, 'timeout');
    assert.equal(run.signal, 'SIGKILL');
    assert.match(run.error ?? '', /stopped after 250ms/);
  });

  it('records the timeout it was given', async () => {
    const { runner } = stub({});

    assert.equal((await executeRun(request('vitest', { timeoutMs: 999 }), runner)).timeoutMs, 999);
  });

  it('records the duration the process took', async () => {
    const { runner } = stub({ durationMs: 1420 });

    assert.equal((await executeRun(request('vitest'), runner)).durationMs, 1420);
  });

  it('keeps the exact arguments the runner was given', async () => {
    const { runner } = stub({});

    const run = await executeRun(request('jest', { files: ['a.test.ts'] }), runner);

    assert.equal(run.command[0], process.execPath);
    assert.ok(run.command.includes('--runTestsByPath'));
  });
});

describe('runnerResults', () => {
  it('builds the shape both runners write', () => {
    const payload = runnerResults([
      { name: 'a.test.ts', tests: [{ title: 'adds', status: 'passed' }] },
    ]) as { success: boolean; testResults: { assertionResults: { fullName: string }[] }[] };

    assert.equal(payload.success, true);
    assert.equal(payload.testResults[0]?.assertionResults[0]?.fullName, 'adds');
  });

  it('marks a payload with a failing test as unsuccessful', () => {
    const payload = runnerResults([
      { name: 'a.test.ts', tests: [{ title: 'adds', status: 'failed' }] },
    ]) as { success: boolean };

    assert.equal(payload.success, false);
  });
});

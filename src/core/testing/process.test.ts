import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';

import { createProcessRunner, type ProcessResult } from './process.js';

const run = createProcessRunner();

/** Runs a snippet of JavaScript in a child process. */
function node(source: string, timeoutMs = 10_000): Promise<ProcessResult> {
  return run({
    command: process.execPath,
    args: ['-e', source],
    cwd: tmpdir(),
    env: { PATH: process.env['PATH'] ?? '' },
    timeoutMs,
  });
}

describe('createProcessRunner', () => {
  it('captures standard output', async () => {
    const result = await node('process.stdout.write("hello")');

    assert.equal(result.stdout, 'hello');
    assert.equal(result.stderr, '');
    assert.equal(result.code, 0);
    assert.equal(result.error, null);
  });

  it('captures standard error separately', async () => {
    const result = await node('process.stderr.write("bad"); process.stdout.write("good")');

    assert.equal(result.stdout, 'good');
    assert.equal(result.stderr, 'bad');
  });

  it('reports a non-zero exit code', async () => {
    const result = await node('process.exit(3)');

    assert.equal(result.code, 3);
    assert.equal(result.signal, null);
    assert.equal(result.timedOut, false);
  });

  it('reports the exit code of a process that threw', async () => {
    const result = await node('throw new Error("boom")');

    assert.equal(result.code, 1);
    assert.match(result.stderr, /boom/);
  });

  it('measures how long the process took', async () => {
    const result = await node('setTimeout(() => {}, 60)');

    assert.ok(
      result.durationMs >= 40,
      `expected a measured duration, got ${String(result.durationMs)}`,
    );
  });

  it('reports a command that cannot be started', async () => {
    const result = await run({
      command: '/definitely/not/an/executable',
      args: [],
      cwd: tmpdir(),
      env: {},
      timeoutMs: 5000,
    });

    assert.notEqual(result.error, null);
    assert.equal(result.code, null);
  });

  it('passes arguments through without a shell', async () => {
    const result = await run({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(process.argv[1])', 'a b; echo pwned'],
      cwd: tmpdir(),
      env: { PATH: process.env['PATH'] ?? '' },
      timeoutMs: 5000,
    });

    assert.equal(result.stdout, 'a b; echo pwned');
  });

  it('gives the child only the environment it is handed', async () => {
    const result = await run({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(String(process.env.VERIFY_FIXTURE))'],
      cwd: tmpdir(),
      env: { PATH: process.env['PATH'] ?? '', VERIFY_FIXTURE: 'set' },
      timeoutMs: 5000,
    });

    assert.equal(result.stdout, 'set');
  });

  describe('termination', () => {
    it('stops a process that outstays its timeout', async () => {
      const result = await node('setInterval(() => {}, 1000)', 300);

      assert.equal(result.timedOut, true);
      assert.notEqual(result.signal ?? result.code, null);
    });

    it('kills a process that will not stop when asked', async () => {
      const result = await node(
        'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)',
        300,
      );

      assert.equal(result.timedOut, true);
      assert.equal(result.signal, 'SIGKILL');
    });

    it('keeps whatever the process printed before it was stopped', async () => {
      const result = await node(
        'process.stdout.write("started"); setInterval(() => {}, 1000)',
        300,
      );

      assert.equal(result.stdout, 'started');
      assert.equal(result.timedOut, true);
    });

    it('leaves a process that finishes in time alone', async () => {
      const result = await node('process.stdout.write("done")', 5000);

      assert.equal(result.timedOut, false);
      assert.equal(result.code, 0);
    });
  });
});

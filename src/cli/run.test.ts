import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createFixture, packageJson, type Fixture } from '../test-helpers/fixtures.js';
import { createMemoryLogger } from '../utils/logger.js';
import { VERSION } from '../version.js';
import { runCli } from './run.js';

const ESC = String.fromCharCode(27);

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function run(
  argv: readonly string[],
  options: { cwd: string; env?: Readonly<Record<string, string>> },
): Promise<RunResult> {
  const logger = createMemoryLogger();
  const exitCode = await runCli(argv, {
    cwd: options.cwd,
    env: options.env ?? {},
    logger,
    isTTY: false,
  });

  return { exitCode, stdout: logger.stdout, stderr: logger.stderr };
}

describe('runCli', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function fixture(files: Readonly<Record<string, string>> = {}): Promise<string> {
    const created = await createFixture(files);
    fixtures.push(created);
    return created.path;
  }

  it('prints usage for --help and exits successfully', async () => {
    const result = await run(['--help'], { cwd: await fixture() });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage/);
    assert.match(result.stdout, /--json/);
    assert.equal(result.stderr, '');
  });

  it('prints the version for --version', async () => {
    const result = await run(['--version'], { cwd: await fixture() });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), VERSION);
  });

  it('inspects the working directory when no path is given', async () => {
    const cwd = await fixture({ 'package.json': packageJson({ name: 'demo', version: '1.0.0' }) });

    const result = await run([], { cwd });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /demo@1\.0\.0/);
    assert.ok(result.stdout.includes(cwd), 'the report should name the inspected directory');
    assert.equal(result.stderr, '');
  });

  it('inspects an explicit relative path', async () => {
    const cwd = await fixture({ 'workspace/package.json': packageJson({ name: 'nested' }) });

    const result = await run(['./workspace'], { cwd });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /nested/);
  });

  it('emits a machine-readable report with --json', async () => {
    const cwd = await fixture({
      'package.json': packageJson({ name: 'demo', version: '1.0.0' }),
      'package-lock.json': '{}',
      'tsconfig.json': '{}',
    });

    const result = await run(['.', '--json'], { cwd });
    const report: unknown = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.deepEqual(report, {
      tool: { name: 'verify', version: VERSION },
      target: cwd,
      project: {
        root: cwd,
        name: 'demo',
        manifest: { name: 'demo', version: '1.0.0', description: null },
        packageManager: 'npm',
        lockfile: 'package-lock.json',
        versionControl: null,
        typescript: true,
      },
    });
  });

  it('fails with the usage exit code when the path does not exist', async () => {
    const result = await run(['./missing'], { cwd: await fixture() });

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Cannot read target path/);
    assert.match(result.stderr, /--help/);
  });

  it('fails with the usage exit code for an unknown option', async () => {
    const result = await run(['--nope'], { cwd: await fixture() });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Unknown option/);
  });

  it('writes plain text when the output is not a terminal', async () => {
    const result = await run(['.'], { cwd: await fixture() });

    assert.ok(!result.stdout.includes(ESC));
  });

  it('colours output when the environment forces colour', async () => {
    const cwd = await fixture();

    const coloured = await run(['.'], { cwd, env: { FORCE_COLOR: '1' } });
    const plain = await run(['.', '--no-color'], { cwd, env: { FORCE_COLOR: '1' } });

    assert.ok(coloured.stdout.includes(ESC));
    assert.ok(!plain.stdout.includes(ESC));
  });
});

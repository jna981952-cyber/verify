import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { GitUnavailableError, type GitRunner } from '../core/git/runner.js';
import { createFixture, packageJson, type Fixture } from '../test-helpers/fixtures.js';
import { createGitFixture } from '../test-helpers/git.js';
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
  options: { cwd: string; env?: Readonly<Record<string, string>>; gitRunner?: GitRunner },
): Promise<RunResult> {
  const logger = createMemoryLogger();
  const exitCode = await runCli(argv, {
    cwd: options.cwd,
    env: options.env ?? {},
    logger,
    isTTY: false,
    ...(options.gitRunner === undefined ? {} : { gitRunner: options.gitRunner }),
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

describe('runCli changes', () => {
  const cleanups: (() => Promise<void>)[] = [];

  after(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  });

  /** Creates a repository whose first commit holds `files`. */
  async function repository(files: Readonly<Record<string, string>> = {}) {
    const created = await createGitFixture(files);
    cleanups.push(created.cleanup.bind(created));
    await created.commit('initial');
    return created;
  }

  it('summarises the changes in the working directory', async () => {
    const repo = await repository({ 'src/cart.ts': 'one\n', 'src/checkout.ts': 'one\n' });
    await repo.write('src/cart.ts', 'two\n');
    await repo.write('src/checkout.ts', 'two\n');
    await repo.write('tests/checkout.test.ts', 'test\n');
    await repo.git('add', 'tests/checkout.test.ts');

    const result = await run(['changes'], { cwd: repo.path });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, '');
    assert.match(
      result.stdout,
      /Changed files:\n\n {2}M src\/cart\.ts\n {2}M src\/checkout\.ts\n {2}A tests\/checkout\.test\.ts\n\nSummary:\n {2}2 modified\n {2}1 added\n {2}0 deleted\n {2}0 renamed/,
    );
  });

  it('accepts a path after the command', async () => {
    const repo = await repository({ 'src/cart.ts': 'one\n' });
    await repo.write('src/cart.ts', 'two\n');

    const result = await run(['changes', repo.path], { cwd: await fixtureDirectory() });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /M src\/cart\.ts/);
  });

  it('reports a clean repository', async () => {
    const repo = await repository({ 'src/cart.ts': 'one\n' });

    const result = await run(['changes'], { cwd: repo.path });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /No changes\./);
  });

  it('emits machine-readable JSON', async () => {
    const repo = await repository({ 'src/cart.ts': 'one\ntwo\n' });
    await repo.write('src/cart.ts', 'one\nTWO\n');

    const result = await run(['changes', '--json'], { cwd: repo.path });
    const payload = JSON.parse(result.stdout) as {
      tool: { name: string };
      target: string;
      changes: {
        head: { branch: string | null };
        files: { path: string; kind: string; hunks: { addedLines: number[] }[] }[];
        summary: { modified: number; total: number };
      };
    };

    const changed = payload.changes.files[0];
    assert.ok(changed !== undefined);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.tool.name, 'verify');
    assert.equal(payload.target, repo.path);
    assert.equal(payload.changes.head.branch, 'main');
    assert.equal(changed.path, 'src/cart.ts');
    assert.equal(changed.kind, 'modified');
    assert.deepEqual(changed.hunks[0]?.addedLines, [2]);
    assert.equal(payload.changes.summary.modified, 1);
    assert.equal(payload.changes.summary.total, 1);
  });

  it('fails with the usage exit code outside a repository', async () => {
    const result = await run(['changes'], { cwd: await fixtureDirectory() });

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Not a Git repository/);
    assert.match(result.stderr, /--help/);
  });

  it('fails with the usage exit code when the path does not exist', async () => {
    const result = await run(['changes', './missing'], { cwd: await fixtureDirectory() });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Cannot read target path/);
  });

  it('reports an internal failure when git cannot be run', async () => {
    const failing: GitRunner = () =>
      Promise.reject(new GitUnavailableError('Could not run git. Is it installed and on PATH?'));

    const result = await run(['changes'], { cwd: await fixtureDirectory(), gitRunner: failing });

    assert.equal(result.exitCode, 3);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Could not run git/);
  });

  it('writes plain text when the output is not a terminal', async () => {
    const repo = await repository({ 'src/cart.ts': 'one\n' });
    await repo.write('src/cart.ts', 'two\n');

    const result = await run(['changes'], { cwd: repo.path });

    assert.ok(!result.stdout.includes(ESC));
  });

  async function fixtureDirectory(): Promise<string> {
    const created = await createFixture();
    cleanups.push(created.cleanup.bind(created));
    return created.path;
  }
});

describe('runCli analyze', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((created) => created.cleanup()));
  });

  async function tree(files: Readonly<Record<string, string>> = {}): Promise<string> {
    const created = await createFixture(files);
    fixtures.push(created);
    return created.path;
  }

  const project: Readonly<Record<string, string>> = {
    'src/money.ts': 'export type Money = number;\nexport function format(m: Money) { return m; }\n',
    'src/Button.tsx':
      "import { format } from './money.js';\nexport const Button = () => <b>{format(1)}</b>;\n",
    'src/server.js': "app.get('/health', (req, res) => res.end());\n",
    'src/Button.test.tsx': "it('renders', () => {});\n",
  };

  it('summarises the source in the working directory', async () => {
    const result = await run(['analyze'], { cwd: await tree(project) });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /^Analysed 4 files under /m);
    assert.match(result.stdout, /^ {2}1 React component$/m);
    assert.match(result.stdout, /^ {2}1 test file, 1 test$/m);
    assert.match(result.stdout, /^ {2}GET {2}\/health {2}src\/server\.js:1$/m);
  });

  it('accepts a path after the command', async () => {
    const root = await tree(project);

    const result = await run(['analyze', root], { cwd: await tree() });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Analysed 4 files/);
  });

  it('emits machine-readable JSON', async () => {
    const root = await tree(project);

    const result = await run(['analyze', '--json'], { cwd: root });
    const payload = JSON.parse(result.stdout) as {
      tool: { name: string };
      target: string;
      analysis: {
        files: { path: string; symbols: { name: string; kind: string }[] }[];
        graph: { dependencies: Record<string, string[]>; symbolEdges: { exported: string }[] };
        summary: { files: number; symbols: { component: number } };
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.tool.name, 'verify');
    assert.equal(payload.target, root);
    assert.equal(payload.analysis.summary.files, 4);
    assert.equal(payload.analysis.summary.symbols.component, 1);
    assert.deepEqual(payload.analysis.graph.dependencies['src/Button.tsx'], ['src/money.ts']);
    assert.deepEqual(
      payload.analysis.graph.symbolEdges.map((edge) => edge.exported),
      ['format'],
    );
  });

  it('reports a directory with no source', async () => {
    const result = await run(['analyze'], { cwd: await tree({ 'README.md': '# hi' }) });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /No JavaScript or TypeScript files found\./);
  });

  it('fails with the usage exit code when the path does not exist', async () => {
    const result = await run(['analyze', './missing'], { cwd: await tree() });

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Cannot read target path/);
  });

  it('does not crash on malformed source', async () => {
    const result = await run(['analyze'], {
      cwd: await tree({ 'a.ts': 'export const ok = 1;\n', 'b.ts': 'function ((( bad\n' }),
    });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Analysed 2 files/);
  });

  it('writes plain text when the output is not a terminal', async () => {
    const result = await run(['analyze'], { cwd: await tree(project) });

    assert.ok(!result.stdout.includes(ESC));
  });
});

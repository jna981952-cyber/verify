import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { GitUnavailableError, type GitRunner } from '../core/git/runner.js';
import { createFixture, packageJson, type Fixture } from '../test-helpers/fixtures.js';
import { createGitFixture, type GitFixture } from '../test-helpers/git.js';
import {
  createRunnerProject,
  runnerResults,
  type RunnerBehaviour,
  type RunnerProject,
} from '../test-helpers/runner.js';
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

describe('runCli impact', () => {
  const cleanups: (() => Promise<void>)[] = [];

  after(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  });

  const project: Readonly<Record<string, string>> = {
    'src/checkout.ts': "export function checkout() {\n  return 'ok';\n}\n",
    'src/cart.ts':
      "import { checkout } from './checkout.js';\nexport const pay = () => checkout();\n",
    'src/page.tsx': "import { pay } from './cart.js';\nexport const Page = () => <b>{pay()}</b>;\n",
    'src/api.js': "app.post('/pay', (req, res) => res.end());\nmodule.exports = app;\n",
    'tests/checkout.test.ts':
      "import { checkout } from '../src/checkout.js';\nit('works', () => checkout());\n",
  };

  async function repository(): Promise<GitFixture> {
    const created = await createGitFixture(project);
    cleanups.push(created.cleanup.bind(created));
    await created.commit('initial');
    return created;
  }

  async function plainDirectory(): Promise<string> {
    const created = await createFixture();
    cleanups.push(created.cleanup.bind(created));
    return created.path;
  }

  it('traces what the working tree changes reach', async () => {
    const repo = await repository();
    await repo.write('src/checkout.ts', "export function checkout() {\n  return 'sent';\n}\n");

    const result = await run(['impact'], { cwd: repo.path });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /^Changed:\n {2}src\/checkout\.ts$/m);
    assert.match(
      result.stdout,
      /^Directly affected:\n {2}src\/cart\.ts\n {2}tests\/checkout\.test\.ts$/m,
    );
    assert.match(result.stdout, /^Indirectly affected:\n {2}src\/page\.tsx$/m);
    assert.match(result.stdout, /^Affected tests:\n {2}tests\/checkout\.test\.ts/m);
    assert.match(
      result.stdout,
      /src\/cart\.ts imports checkout from src\/checkout\.ts, and checkout changed/,
    );
  });

  it('reports a clean repository', async () => {
    const result = await run(['impact'], { cwd: (await repository()).path });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /No changes to analyse\./);
  });

  it('accepts a path after the command', async () => {
    const repo = await repository();
    await repo.write('src/checkout.ts', "export function checkout() {\n  return 'sent';\n}\n");

    const result = await run(['impact', repo.path], { cwd: await plainDirectory() });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /src\/cart\.ts/);
  });

  it('honours the depth option', async () => {
    const repo = await repository();
    await repo.write('src/checkout.ts', "export function checkout() {\n  return 'sent';\n}\n");

    const result = await run(['impact', '--depth', '1'], { cwd: repo.path });

    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(result.stdout, /Indirectly affected:/);
    assert.match(result.stdout, /stopped at depth 1/);
  });

  it('emits machine-readable JSON', async () => {
    const repo = await repository();
    await repo.write('src/checkout.ts', "export function checkout() {\n  return 'sent';\n}\n");

    const result = await run(['impact', '--json'], { cwd: repo.path });
    const payload = JSON.parse(result.stdout) as {
      tool: { name: string };
      target: string;
      impact: {
        depth: number;
        truncated: boolean;
        changed: { path: string; symbols: { name: string }[] }[];
        affected: { path: string; distance: number; reasons: { relation: string }[] }[];
        summary: { directlyAffected: number; indirectlyAffected: number };
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.tool.name, 'verify');
    assert.equal(payload.target, repo.path);
    assert.equal(payload.impact.depth, 3);
    assert.equal(payload.impact.truncated, false);
    assert.deepEqual(
      payload.impact.changed.map((file) => file.path),
      ['src/checkout.ts'],
    );
    assert.deepEqual(
      payload.impact.changed[0]?.symbols.map((symbol) => symbol.name),
      ['checkout'],
    );
    assert.equal(payload.impact.summary.directlyAffected, 2);
    assert.equal(payload.impact.summary.indirectlyAffected, 1);
    assert.equal(payload.impact.affected[0]?.reasons[0]?.relation, 'imports-changed-symbol');
  });

  it('fails with the usage exit code outside a repository', async () => {
    const result = await run(['impact'], { cwd: await plainDirectory() });

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Not a Git repository/);
  });

  it('fails with the usage exit code for an unusable depth', async () => {
    const result = await run(['impact', '--depth', 'lots'], { cwd: await plainDirectory() });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /--depth must be a whole number/);
  });

  it('writes plain text when the output is not a terminal', async () => {
    const repo = await repository();
    await repo.write('src/checkout.ts', "export function checkout() {\n  return 'sent';\n}\n");

    const result = await run(['impact'], { cwd: repo.path });

    assert.ok(!result.stdout.includes(ESC));
  });
});

describe('runCli tests', () => {
  const cleanups: (() => Promise<void>)[] = [];

  after(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  });

  const files: Readonly<Record<string, string>> = {
    'src/cart.ts': 'export function total(): number {\n  return 1;\n}\n',
    'src/cart.test.ts':
      "import { total } from './cart.js';\ndescribe('cart', () => {\n  it('adds', () => total());\n  it('subtracts', () => total());\n});\n",
    'src/other.test.ts': "it('unrelated', () => {});\n",
  };

  const passing = runnerResults([
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

  async function project(behaviour: RunnerBehaviour | null): Promise<RunnerProject> {
    const created = await createRunnerProject({ framework: 'vitest', files, behaviour });
    cleanups.push(created.cleanup.bind(created));
    return created;
  }

  it('discovers, runs and reports a passing suite', async () => {
    const created = await project({ results: passing });

    const result = await run(['tests'], { cwd: created.root });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /^Discovered:\n {2}2 test files\n {2}3 tests$/m);
    assert.match(result.stdout, /^Selected:\n {2}3 tests in 2 files$/m);
    assert.match(result.stdout, /^Results:\n {2}3 passed$/m);
    assert.match(result.stdout, /^Duration:\n {2}\d/m);
    assert.match(result.stdout, /✔ All selected tests passed\./);
  });

  it('exits with the failure code when a test does not pass', async () => {
    const created = await project({
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
              failureMessages: ['AssertionError: expected 1 to be 2\n    at cart.test.ts:4:24'],
            },
          ],
        },
      ]),
    });

    const result = await run(['tests'], { cwd: created.root });

    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /^Results:\n {2}1 passed\n {2}1 failed$/m);
    assert.match(result.stdout, /src\/cart\.test\.ts > cart > subtracts/);
    assert.match(result.stdout, /AssertionError: expected 1 to be 2/);
    assert.match(result.stdout, /is not something running it can settle/);
  });

  it('runs only what the current changes reach', async () => {
    const repo = await createGitFixture({
      '.gitignore': 'node_modules/\n',
      'package.json': `${JSON.stringify({ devDependencies: { vitest: '^1.0.0' } })}\n`,
      ...files,
    });
    cleanups.push(repo.cleanup.bind(repo));
    await repo.commit('initial');
    await repo.write('src/cart.ts', 'export function total(): number {\n  return 2;\n}\n');

    const result = await run(['tests', '--impacted', '--list'], { cwd: repo.path });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Selected:\n {2}2 tests in 1 file$/m);
    assert.match(result.stdout, /^Selected because:/m);
    assert.match(result.stdout, /src\/cart\.test\.ts imports total from src\/cart\.ts/);
    assert.doesNotMatch(result.stdout, /src\/other\.test\.ts/);
  });

  it('discovers without running when asked to list', async () => {
    const created = await project({ results: passing });

    const result = await run(['tests', '--list'], { cwd: created.root });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Discovered:/m);
    assert.doesNotMatch(result.stdout, /^Results:/m);
    assert.equal(await created.invocation(), null);
  });

  it('passes a name filter to the runner', async () => {
    const created = await project({
      results: runnerResults([
        {
          name: 'src/cart.test.ts',
          tests: [{ title: 'adds', status: 'passed', ancestorTitles: ['cart'] }],
        },
      ]),
    });

    const result = await run(['tests', '--test', 'adds'], { cwd: created.root });
    const invocation = (await created.invocation()) ?? [];

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /matching "adds"/);
    assert.ok(invocation.includes('-t'));
    assert.ok(invocation.includes('adds'));
  });

  it('stops a run that outstays the timeout it was given', async () => {
    const created = await project({ delayMs: 10_000, results: passing });

    const result = await run(['tests', '--timeout', '400'], { cwd: created.root });

    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /The run was stopped after 400ms\./);
  });

  it('reports a project with no runner without failing', async () => {
    const created = await createRunnerProject({
      framework: 'vitest',
      files,
      behaviour: null,
      manifest: { devDependencies: {} },
    });
    cleanups.push(created.cleanup.bind(created));

    const result = await run(['tests'], { cwd: created.root });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /No test runner was recognised/);
  });

  it('fails when the runner is configured but not installed', async () => {
    const created = await project(null);

    const result = await run(['tests'], { cwd: created.root });

    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /vitest is configured here but is not installed/);
  });

  it('emits machine-readable JSON', async () => {
    const created = await project({ results: passing });

    const result = await run(['tests', '--json'], { cwd: created.root });
    const payload = JSON.parse(result.stdout) as {
      tool: { name: string };
      target: string;
      tests: {
        discovery: { detection: { framework: string }; tests: number };
        selection: { mode: string; tests: number };
        run: { outcome: string; summary: { passed: number } } | null;
      };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.tool.name, 'verify');
    assert.equal(payload.target, created.root);
    assert.equal(payload.tests.discovery.detection.framework, 'vitest');
    assert.equal(payload.tests.discovery.tests, 3);
    assert.equal(payload.tests.selection.mode, 'all');
    assert.ok(payload.tests.run !== null);
    assert.equal(payload.tests.run.outcome, 'pass');
    assert.equal(payload.tests.run.summary.passed, 3);
  });

  it('fails with the usage exit code when the path does not exist', async () => {
    const created = await project(null);

    const result = await run(['tests', './missing'], { cwd: created.root });

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Cannot read target path/);
  });

  it('fails with the usage exit code for an unusable timeout', async () => {
    const created = await project(null);

    const result = await run(['tests', '--timeout', 'ages'], { cwd: created.root });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /--timeout must be a positive number/);
  });

  it('writes plain text when the output is not a terminal', async () => {
    const created = await project({ results: passing });

    const result = await run(['tests'], { cwd: created.root });

    assert.ok(!result.stdout.includes(ESC));
  });
});

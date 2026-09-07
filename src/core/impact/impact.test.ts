import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createFixture, type Fixture } from '../../test-helpers/fixtures.js';
import { createGitFixture, type GitFixture } from '../../test-helpers/git.js';
import { UsageError } from '../../utils/errors.js';
import { analyzeImpact } from './impact.js';
import { type ChangedFile, type ImpactAnalysis } from './types.js';

/** A small project whose files depend on one another in a chain. */
const PROJECT: Readonly<Record<string, string>> = {
  'src/checkout.ts': [
    'export class CheckoutService {',
    '  submit(): string {',
    "    return 'ok';",
    '  }',
    '}',
    '',
    'export function checkout(): string {',
    '  return new CheckoutService().submit();',
    '}',
    '',
  ].join('\n'),
  'src/cart.ts': [
    "import { CheckoutService } from './checkout.js';",
    '',
    'export class CartService {',
    '  private readonly service = new CheckoutService();',
    '',
    '  pay(): string {',
    '    return this.service.submit();',
    '  }',
    '}',
    '',
  ].join('\n'),
  'src/api/checkout.ts': [
    "import { checkout } from '../checkout.js';",
    '',
    "const app = require('express')();",
    '',
    "app.post('/checkout', (req, res) => res.json(checkout()));",
    '',
    'export default app;',
    '',
  ].join('\n'),
  'src/components/Button.tsx': [
    'export const Button = ({ label }: { label: string }) => <button>{label}</button>;',
    '',
  ].join('\n'),
  'src/pages/checkout.tsx': [
    "import { CartService } from '../cart.js';",
    "import { Button } from '../components/Button.js';",
    '',
    'export const CheckoutPage = () => <Button label={new CartService().pay()} />;',
    '',
  ].join('\n'),
  'tests/checkout.test.ts': [
    "import { checkout } from '../src/checkout.js';",
    '',
    "describe('checkout', () => {",
    "  it('works', () => {",
    '    checkout();',
    '  });',
    '});',
    '',
  ].join('\n'),
};

function affectedPaths(impact: ImpactAnalysis, distance: number): readonly string[] {
  return impact.affected.filter((file) => file.distance === distance).map((file) => file.path);
}

function details(impact: ImpactAnalysis): readonly string[] {
  return impact.affected.flatMap((file) => file.reasons.map((reason) => reason.detail));
}

function changedFile(impact: ImpactAnalysis, path: string): ChangedFile {
  const found = impact.changed.find((file) => file.path === path);
  assert.ok(found !== undefined, `expected ${path} among the changed files`);
  return found;
}

describe('analyzeImpact', () => {
  const cleanups: (() => Promise<void>)[] = [];

  after(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  });

  /** Creates a repository whose first commit holds `files`. */
  async function repository(
    files: Readonly<Record<string, string>> = PROJECT,
  ): Promise<GitFixture> {
    const created = await createGitFixture(files);
    cleanups.push(created.cleanup.bind(created));
    await created.commit('initial');
    return created;
  }

  it('reports nothing to analyse in a clean repository', async () => {
    const repo = await repository();

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(impact.changed, []);
    assert.deepEqual(impact.affected, []);
    assert.equal(impact.summary.changedFiles, 0);
  });

  it('traces a change through direct and indirect dependents', async () => {
    const repo = await repository();
    await repo.write(
      'src/checkout.ts',
      PROJECT['src/checkout.ts']?.replace("'ok'", "'sent'") ?? '',
    );

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(
      impact.changed.map((file) => file.path),
      ['src/checkout.ts'],
    );
    assert.deepEqual(affectedPaths(impact, 1), [
      'src/api/checkout.ts',
      'src/cart.ts',
      'tests/checkout.test.ts',
    ]);
    assert.deepEqual(affectedPaths(impact, 2), ['src/pages/checkout.tsx']);
    assert.equal(impact.summary.directlyAffected, 3);
    assert.equal(impact.summary.indirectlyAffected, 1);
  });

  it('names the declarations the diff touched', async () => {
    const repo = await repository();
    await repo.write(
      'src/checkout.ts',
      PROJECT['src/checkout.ts']?.replace("'ok'", "'sent'") ?? '',
    );

    const impact = await analyzeImpact(repo.path);
    const file = changedFile(impact, 'src/checkout.ts');

    assert.equal(file.precision, 'exact');
    assert.deepEqual(
      file.symbols.map((symbol) => `${symbol.kind} ${symbol.container ?? ''}${symbol.name}`),
      ['class CheckoutService', 'method CheckoutServicesubmit'],
    );
  });

  it('separates a name it proved changed from one it only knows was imported', async () => {
    const repo = await repository();
    await repo.write(
      'src/checkout.ts',
      PROJECT['src/checkout.ts']?.replace("'ok'", "'sent'") ?? '',
    );

    const impact = await analyzeImpact(repo.path);

    assert.ok(
      details(impact).includes(
        'src/cart.ts imports CheckoutService from src/checkout.ts, and CheckoutService changed',
      ),
    );
    assert.ok(
      details(impact).includes(
        'src/api/checkout.ts imports checkout from src/checkout.ts, which changed elsewhere',
      ),
    );
  });

  it('reports affected tests, components and routes', async () => {
    const repo = await repository();
    await repo.write(
      'src/checkout.ts',
      PROJECT['src/checkout.ts']?.replace("'ok'", "'sent'") ?? '',
    );

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(
      impact.tests.map((test) => test.path),
      ['tests/checkout.test.ts'],
    );
    assert.deepEqual(
      impact.components.map((component) => `${component.name} ${component.path}`),
      ['CheckoutPage src/pages/checkout.tsx'],
    );
    assert.deepEqual(
      impact.routes.map((route) => `${route.method} ${route.route} ${route.path}`),
      ['POST /checkout src/api/checkout.ts'],
    );
  });

  it('reports a changed component and its own file at distance zero', async () => {
    const repo = await repository();
    await repo.write(
      'src/components/Button.tsx',
      'export const Button = ({ label }: { label: string }) => <b>{label}</b>;\n',
    );

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(
      impact.components.map((component) => `${component.name}@${String(component.distance)}`),
      ['Button@0', 'CheckoutPage@1'],
    );
  });

  it('reports a changed test file as affected', async () => {
    const repo = await repository();
    await repo.write(
      'tests/checkout.test.ts',
      "import { checkout } from '../src/checkout.js';\nit('still works', () => checkout());\n",
    );

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(
      impact.tests.map((test) => `${test.path}@${String(test.distance)}`),
      ['tests/checkout.test.ts@0'],
    );
  });

  it('handles several changed files at once', async () => {
    const repo = await repository();
    await repo.write(
      'src/checkout.ts',
      PROJECT['src/checkout.ts']?.replace("'ok'", "'sent'") ?? '',
    );
    await repo.write(
      'src/components/Button.tsx',
      'export const Button = ({ label }: { label: string }) => <b>{label}</b>;\n',
    );

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(
      impact.changed.map((file) => file.path),
      ['src/checkout.ts', 'src/components/Button.tsx'],
    );
    assert.ok(affectedPaths(impact, 1).includes('src/pages/checkout.tsx'));
  });

  it('reports a new file and everything it declares', async () => {
    const repo = await repository();
    await repo.write('src/discount.ts', 'export function discount(): number {\n  return 0;\n}\n');

    const impact = await analyzeImpact(repo.path);
    const file = changedFile(impact, 'src/discount.ts');

    assert.equal(file.kind, 'untracked');
    assert.equal(file.precision, 'whole-file');
    assert.deepEqual(
      file.symbols.map((symbol) => symbol.name),
      ['discount'],
    );
    assert.deepEqual(impact.affected, []);
  });

  it('follows a deleted file through the imports that no longer resolve', async () => {
    const repo = await repository();
    await repo.git('rm', '--quiet', 'src/components/Button.tsx');

    const impact = await analyzeImpact(repo.path);

    assert.equal(changedFile(impact, 'src/components/Button.tsx').kind, 'deleted');
    assert.deepEqual(affectedPaths(impact, 1), ['src/pages/checkout.tsx']);
    assert.deepEqual(details(impact), [
      "src/pages/checkout.tsx imports '../components/Button.js', which was deleted",
    ]);
    assert.ok(impact.notes.some((note) => note.includes('no longer resolve')));
  });

  it('follows a renamed file through its old path', async () => {
    const repo = await repository();
    await repo.git('mv', 'src/cart.ts', 'src/basket.ts');

    const impact = await analyzeImpact(repo.path);

    assert.equal(changedFile(impact, 'src/basket.ts').kind, 'renamed');
    assert.deepEqual(affectedPaths(impact, 1), ['src/pages/checkout.tsx']);
    assert.deepEqual(details(impact), [
      "src/pages/checkout.tsx imports '../cart.js', which was deleted",
    ]);
  });

  it('claims no declarations for a rename that moved the file unchanged', async () => {
    const repo = await repository();
    await repo.git('mv', 'src/cart.ts', 'src/basket.ts');

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(changedFile(impact, 'src/basket.ts').symbols, []);
  });

  it('reports a change nothing depends on', async () => {
    const repo = await repository();
    await repo.write(
      'src/pages/checkout.tsx',
      `${PROJECT['src/pages/checkout.tsx'] ?? ''}export const extra = 1;\n`,
    );

    const impact = await analyzeImpact(repo.path);

    assert.equal(impact.changed.length, 1);
    assert.deepEqual(impact.affected, []);
    assert.equal(impact.summary.directlyAffected, 0);
  });

  it('notes a changed file that is not analysed source', async () => {
    const repo = await repository();
    await repo.write('README.md', '# changed\n');

    const impact = await analyzeImpact(repo.path);

    assert.equal(changedFile(impact, 'README.md').analysed, false);
    assert.ok(impact.notes.some((note) => note.includes('not analysed source')));
  });

  it('reports whatever it can when a changed file is malformed', async () => {
    const repo = await repository();
    await repo.write('src/checkout.ts', 'export function checkout() {}\nfunction ((( bad\n');

    const impact = await analyzeImpact(repo.path);

    assert.equal(changedFile(impact, 'src/checkout.ts').analysed, true);
    assert.ok(affectedPaths(impact, 1).includes('tests/checkout.test.ts'));
  });

  it('walks a cycle without looping', async () => {
    const repo = await repository({
      'a.ts': "import './b.js';\nexport const a = 1;\n",
      'b.ts': "import './a.js';\nexport const b = 1;\n",
    });
    await repo.write('a.ts', "import './b.js';\nexport const a = 2;\n");

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(affectedPaths(impact, 1), ['b.ts']);
  });

  it('ignores a file that imports itself', async () => {
    const repo = await repository({ 'a.ts': "export { a } from './a.js';\nexport const a = 1;\n" });
    await repo.write('a.ts', "export { a } from './a.js';\nexport const a = 2;\n");

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(impact.affected, []);
  });

  it('leaves an import that resolves to nothing alone', async () => {
    const repo = await repository({ 'a.ts': "import './gone.js';\nexport const a = 1;\n" });
    await repo.write('a.ts', "import './gone.js';\nexport const a = 2;\n");

    const impact = await analyzeImpact(repo.path);

    assert.deepEqual(impact.affected, []);
  });

  describe('depth', () => {
    async function changedRepository(): Promise<GitFixture> {
      const repo = await repository();
      await repo.write(
        'src/checkout.ts',
        PROJECT['src/checkout.ts']?.replace("'ok'", "'sent'") ?? '',
      );
      return repo;
    }

    it('follows nothing at depth zero and says so', async () => {
      const impact = await analyzeImpact((await changedRepository()).path, { depth: 0 });

      assert.deepEqual(impact.affected, []);
      assert.equal(impact.truncated, true);
      assert.ok(impact.notes.some((note) => note.includes('stopped at depth 0')));
    });

    it('reports direct dependents only at depth one', async () => {
      const impact = await analyzeImpact((await changedRepository()).path, { depth: 1 });

      assert.deepEqual(affectedPaths(impact, 2), []);
      assert.equal(impact.summary.directlyAffected, 3);
      assert.equal(impact.truncated, true);
    });

    it('reaches the whole graph when the depth allows it', async () => {
      const impact = await analyzeImpact((await changedRepository()).path, { depth: 5 });

      assert.equal(impact.summary.indirectlyAffected, 1);
      assert.equal(impact.truncated, false);
      assert.deepEqual(impact.notes, []);
    });

    it('rejects a depth that is not a whole number of hops', async () => {
      const repo = await repository();

      await assert.rejects(analyzeImpact(repo.path, { depth: -1 }), UsageError);
      await assert.rejects(analyzeImpact(repo.path, { depth: 1.5 }), UsageError);
    });
  });

  it('rejects a directory that is not a repository', async () => {
    const fixture: Fixture = await createFixture({ 'a.ts': 'export const a = 1;\n' });
    cleanups.push(fixture.cleanup.bind(fixture));

    await assert.rejects(analyzeImpact(fixture.path), (error: unknown) => {
      assert.ok(error instanceof UsageError);
      assert.match(error.message, /Not a Git repository/);
      return true;
    });
  });

  it('produces the same result twice for the same working tree', async () => {
    const repo = await repository();
    await repo.write(
      'src/checkout.ts',
      PROJECT['src/checkout.ts']?.replace("'ok'", "'sent'") ?? '',
    );

    assert.deepEqual(await analyzeImpact(repo.path), await analyzeImpact(repo.path));
  });
});

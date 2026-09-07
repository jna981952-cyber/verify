import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { analyzeSource } from '../analysis/file.js';
import { buildGraph } from '../analysis/graph.js';
import { type DependencyGraph } from '../analysis/types.js';
import { traverseImpact, type TraverseResult } from './traverse.js';
import { type ChangedFile } from './types.js';

/** Builds a graph over a set of files given as path-to-source pairs. */
function graphOf(sources: Readonly<Record<string, string>>): DependencyGraph {
  return buildGraph(
    Object.entries(sources).map(([path, text]) => analyzeSource(path, text, text.length)),
  );
}

/** A changed file with the given declarations reported as touched. */
function changed(path: string, symbols: readonly string[] = []): ChangedFile {
  return {
    path,
    kind: 'modified',
    analysed: true,
    precision: symbols.length > 0 ? 'exact' : 'unknown',
    symbols: symbols.map((name) => ({ name, kind: 'function', container: null, lines: [1] })),
  };
}

function run(
  sources: Readonly<Record<string, string>>,
  files: readonly ChangedFile[],
  options: { depth?: number; deleted?: readonly string[] } = {},
): TraverseResult {
  return traverseImpact({
    graph: graphOf(sources),
    changed: files,
    deleted: new Set(options.deleted ?? []),
    depth: options.depth ?? 3,
  });
}

function paths(result: TraverseResult): readonly string[] {
  return result.affected.map((file) => `${file.path}@${String(file.distance)}`);
}

function details(result: TraverseResult): readonly string[] {
  return result.affected.flatMap((file) => file.reasons.map((reason) => reason.detail));
}

describe('traverseImpact', () => {
  it('finds nothing when no file depends on what changed', () => {
    const result = run({ 'a.ts': 'export const a = 1;\n', 'b.ts': 'export const b = 1;\n' }, [
      changed('a.ts', ['a']),
    ]);

    assert.deepEqual(result.affected, []);
    assert.equal(result.truncated, false);
  });

  it('reports a direct dependent at distance one', () => {
    const result = run(
      {
        'src/checkout.ts': 'export class CheckoutService {}\n',
        'src/cart.ts':
          "import { CheckoutService } from './checkout.js';\nexport const c = CheckoutService;\n",
      },
      [changed('src/checkout.ts', ['CheckoutService'])],
    );

    assert.deepEqual(paths(result), ['src/cart.ts@1']);
    assert.deepEqual(details(result), [
      'src/cart.ts imports CheckoutService from src/checkout.ts, and CheckoutService changed',
    ]);
  });

  it('follows multiple levels, reporting each file once at its shortest distance', () => {
    const result = run(
      {
        'a.ts': 'export const a = 1;\n',
        'b.ts': "import { a } from './a.js';\nexport const b = a;\n",
        'c.ts': "import { b } from './b.js';\nexport const c = b;\n",
        'd.ts': "import { c } from './c.js';\nexport const d = c;\n",
      },
      [changed('a.ts', ['a'])],
    );

    assert.deepEqual(paths(result), ['b.ts@1', 'c.ts@2', 'd.ts@3']);
  });

  it('says when a named import could not be shown to have changed', () => {
    const result = run(
      {
        'src/checkout.ts': 'export const one = 1;\nexport const two = 2;\n',
        'src/cart.ts': "import { two } from './checkout.js';\nexport const c = two;\n",
      },
      [changed('src/checkout.ts', ['one'])],
    );

    assert.equal(elementAt(elementAt(result.affected).reasons).relation, 'imports-symbol');
    assert.deepEqual(details(result), [
      'src/cart.ts imports two from src/checkout.ts, which changed elsewhere',
    ]);
  });

  it('reports a plain file dependency when no name is imported', () => {
    const result = run(
      { 'a.ts': 'export const a = 1;\n', 'b.ts': "import './a.js';\nexport const b = 1;\n" },
      [changed('a.ts', ['a'])],
    );

    assert.equal(elementAt(elementAt(result.affected).reasons).relation, 'imports-file');
    assert.deepEqual(details(result), ['b.ts imports a.ts, which changed']);
  });

  it('reports a re-export as its own kind of relationship', () => {
    const result = run(
      { 'a.ts': 'export const a = 1;\n', 'index.ts': "export * from './a.js';\n" },
      [changed('a.ts', ['a'])],
    );

    assert.equal(elementAt(elementAt(result.affected).reasons).relation, 're-exports');
    assert.deepEqual(details(result), ['index.ts re-exports from a.ts, which changed']);
  });

  it('reaches a file through an import of something that was deleted', () => {
    const result = run(
      { 'b.ts': "import { a } from './a.js';\nexport const b = a;\n" },
      [
        {
          path: 'a.ts',
          kind: 'deleted',
          analysed: false,
          precision: 'unknown',
          symbols: [],
        },
      ],
      { deleted: ['a.ts'] },
    );

    assert.deepEqual(paths(result), ['b.ts@1']);
    assert.equal(elementAt(elementAt(result.affected).reasons).relation, 'imports-deleted-file');
    assert.deepEqual(details(result), ["b.ts imports './a.js', which was deleted"]);
  });

  it('leaves an unresolved import that matches nothing alone', () => {
    const result = run({ 'b.ts': "import './gone.js';\nexport const b = 1;\n" }, [
      changed('b.ts', ['b']),
    ]);

    assert.deepEqual(result.affected, []);
  });

  it('walks a cycle without looping', () => {
    const result = run(
      {
        'a.ts': "import './b.js';\nexport const a = 1;\n",
        'b.ts': "import './a.js';\nexport const b = 1;\n",
      },
      [changed('a.ts', ['a'])],
    );

    assert.deepEqual(paths(result), ['b.ts@1']);
    assert.equal(result.truncated, false);
  });

  it('ignores a file that imports itself', () => {
    const result = run({ 'a.ts': "export { a } from './a.js';\nexport const a = 1;\n" }, [
      changed('a.ts', ['a']),
    ]);

    assert.deepEqual(result.affected, []);
  });

  it('merges the reasons when several changed files reach the same dependent', () => {
    const result = run(
      {
        'a.ts': 'export const a = 1;\n',
        'b.ts': 'export const b = 1;\n',
        'c.ts':
          "import { a } from './a.js';\nimport { b } from './b.js';\nexport const c = a + b;\n",
      },
      [changed('a.ts', ['a']), changed('b.ts', ['b'])],
    );

    assert.deepEqual(paths(result), ['c.ts@1']);
    assert.deepEqual(details(result), [
      'c.ts imports a from a.ts, and a changed',
      'c.ts imports b from b.ts, and b changed',
    ]);
  });

  it('never reports a changed file as affected by itself', () => {
    const result = run(
      {
        'a.ts': 'export const a = 1;\n',
        'b.ts': "import { a } from './a.js';\nexport const b = a;\n",
      },
      [changed('a.ts', ['a']), changed('b.ts', ['b'])],
    );

    assert.deepEqual(result.affected, []);
  });

  it('does not follow a file that changed but is not analysed', () => {
    const result = run({ 'b.ts': "import './a.js';\nexport const b = 1;\n" }, [
      { path: 'a.ts', kind: 'modified', analysed: false, precision: 'unknown', symbols: [] },
    ]);

    assert.deepEqual(result.affected, []);
  });

  describe('depth', () => {
    const chain = {
      'a.ts': 'export const a = 1;\n',
      'b.ts': "import { a } from './a.js';\nexport const b = a;\n",
      'c.ts': "import { b } from './b.js';\nexport const c = b;\n",
      'd.ts': "import { c } from './c.js';\nexport const d = c;\n",
    };

    it('follows nothing at depth zero, and says the search was cut short', () => {
      const result = run(chain, [changed('a.ts', ['a'])], { depth: 0 });

      assert.deepEqual(result.affected, []);
      assert.equal(result.truncated, true);
    });

    it('separates direct from indirect at depth one', () => {
      const result = run(chain, [changed('a.ts', ['a'])], { depth: 1 });

      assert.deepEqual(paths(result), ['b.ts@1']);
      assert.equal(result.truncated, true);
    });

    it('reaches the end of the chain when the depth allows it', () => {
      const result = run(chain, [changed('a.ts', ['a'])], { depth: 3 });

      assert.deepEqual(paths(result), ['b.ts@1', 'c.ts@2', 'd.ts@3']);
      assert.equal(result.truncated, false);
    });

    it('does not claim it was cut short when the graph simply ended', () => {
      const result = run(chain, [changed('c.ts', ['c'])], { depth: 1 });

      assert.deepEqual(paths(result), ['d.ts@1']);
      assert.equal(result.truncated, false);
    });
  });

  it('produces the same result every time', () => {
    const sources = {
      'a.ts': 'export const a = 1;\n',
      'b.ts': "import { a } from './a.js';\nexport const b = a;\n",
      'c.ts': "import { a } from './a.js';\nexport const c = a;\n",
    };

    assert.deepEqual(
      run(sources, [changed('a.ts', ['a'])]),
      run(sources, [changed('a.ts', ['a'])]),
    );
    assert.deepEqual(paths(run(sources, [changed('a.ts', ['a'])])), ['b.ts@1', 'c.ts@1']);
  });
});

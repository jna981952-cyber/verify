import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { analyzeSource } from './file.js';
import { buildGraph } from './graph.js';
import { type DependencyGraph, type FileAnalysis } from './types.js';

/** Builds a graph over a set of files given as path-to-source pairs. */
function graphOf(sources: Readonly<Record<string, string>>): DependencyGraph {
  const files: FileAnalysis[] = Object.entries(sources).map(([path, text]) =>
    analyzeSource(path, text, text.length),
  );
  return buildGraph(files);
}

function edgeKinds(graph: DependencyGraph): readonly string[] {
  return graph.edges.map((edge) => `${edge.specifier}=${edge.kind}`);
}

describe('buildGraph', () => {
  it('handles a codebase with no files', () => {
    const graph = graphOf({});

    assert.deepEqual(graph.files, []);
    assert.deepEqual(graph.edges, []);
    assert.deepEqual(graph.dependencies, {});
  });

  it('lists every file, sorted', () => {
    const graph = graphOf({ 'src/b.ts': '', 'src/a.ts': '' });

    assert.deepEqual(graph.files, ['src/a.ts', 'src/b.ts']);
  });

  it('links a file to the one it imports', () => {
    const graph = graphOf({
      'src/cart.ts': "import { total } from './money.js';\nexport const c = total;",
      'src/money.ts': 'export function total() { return 0; }',
    });

    assert.deepEqual(graph.dependencies['src/cart.ts'], ['src/money.ts']);
    assert.deepEqual(graph.dependents['src/money.ts'], ['src/cart.ts']);
    assert.deepEqual(graph.dependencies['src/money.ts'], []);
  });

  it('separates local, package, built-in and unresolved specifiers', () => {
    const graph = graphOf({
      'src/a.ts': [
        "import './b.js';",
        "import 'express';",
        "import 'node:fs';",
        "import './missing.js';",
      ].join('\n'),
      'src/b.ts': '',
    });

    assert.deepEqual(edgeKinds(graph), [
      './b.js=local',
      'express=package',
      'node:fs=builtin',
      './missing.js=unresolved',
    ]);
  });

  it('treats a re-export as a dependency', () => {
    const graph = graphOf({
      'src/index.ts': "export { total } from './money.js';",
      'src/money.ts': 'export function total() { return 0; }',
    });

    assert.deepEqual(graph.dependencies['src/index.ts'], ['src/money.ts']);
    assert.deepEqual(
      graph.symbolEdges.map((edge) => `${edge.from}:${edge.exported}->${edge.to}`),
      ['src/index.ts:total->src/money.ts'],
    );
  });

  it('records a symbol edge only when the target exports the name', () => {
    const graph = graphOf({
      'src/a.ts':
        "import { total, missing } from './money.js';\nexport const x = [total, missing];",
      'src/money.ts': 'export function total() { return 0; }',
    });

    assert.deepEqual(
      graph.symbolEdges.map((edge) => edge.exported),
      ['total'],
    );
  });

  it('keeps the local alias alongside the exported name', () => {
    const graph = graphOf({
      'src/a.ts': "import { total as sum } from './money.js';\nexport const x = sum;",
      'src/money.ts': 'export function total() { return 0; }',
    });

    const edge = elementAt(graph.symbolEdges);

    assert.equal(edge.exported, 'total');
    assert.equal(edge.local, 'sum');
  });

  it('links a default import to a default export', () => {
    const graph = graphOf({
      'src/a.ts': "import Cart from './cart.js';\nexport const x = Cart;",
      'src/cart.ts': 'export default class Cart {}',
    });

    assert.equal(graph.symbolEdges[0]?.exported, 'default');
  });

  it('leaves a namespace import without a symbol edge', () => {
    const graph = graphOf({
      'src/a.ts': "import * as money from './money.js';\nexport const x = money;",
      'src/money.ts': 'export function total() { return 0; }',
    });

    assert.deepEqual(graph.dependencies['src/a.ts'], ['src/money.ts']);
    assert.deepEqual(graph.symbolEdges, []);
  });

  it('marks a type-only import as such', () => {
    const graph = graphOf({
      'src/a.ts': "import type { Money } from './money.js';\nexport type M = Money;",
      'src/money.ts': 'export type Money = number;',
    });

    assert.equal(graph.edges[0]?.typeOnly, true);
    assert.equal(graph.symbolEdges[0]?.typeOnly, true);
  });

  it('resolves an import of a directory index', () => {
    const graph = graphOf({
      'src/a.ts': "import { x } from './lib';\nexport const y = x;",
      'src/lib/index.ts': 'export const x = 1;',
    });

    assert.deepEqual(graph.dependencies['src/a.ts'], ['src/lib/index.ts']);
  });

  it('follows a require between JavaScript files', () => {
    const graph = graphOf({
      'src/a.js': "const { total } = require('./money.js');\nmodule.exports = total;",
      'src/money.js': 'exports.total = () => 0;',
    });

    assert.deepEqual(graph.dependencies['src/a.js'], ['src/money.js']);
    assert.deepEqual(
      graph.symbolEdges.map((edge) => edge.exported),
      ['total'],
    );
  });

  it('ignores a file importing itself', () => {
    const graph = graphOf({ 'src/a.ts': "export { x } from './a.js';\nexport const x = 1;" });

    assert.deepEqual(graph.dependencies['src/a.ts'], []);
  });

  it('records both directions of a cycle without looping', () => {
    const graph = graphOf({
      'src/a.ts': "import './b.js';\nexport const a = 1;",
      'src/b.ts': "import './a.js';\nexport const b = 1;",
    });

    assert.deepEqual(graph.dependencies['src/a.ts'], ['src/b.ts']);
    assert.deepEqual(graph.dependencies['src/b.ts'], ['src/a.ts']);
  });

  it('lists each dependency once however often it is imported', () => {
    const graph = graphOf({
      'src/a.ts':
        "import { x } from './b.js';\nimport { y } from './b.js';\nexport const z = [x, y];",
      'src/b.ts': 'export const x = 1;\nexport const y = 2;',
    });

    assert.deepEqual(graph.dependencies['src/a.ts'], ['src/b.ts']);
    assert.equal(graph.edges.length, 2);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { collectExports, collectImports } from './modules.js';
import { parseSource } from './parser.js';
import { type ModuleExport, type ModuleImport } from './types.js';

function importsOf(text: string, path = 'src/a.ts'): readonly ModuleImport[] {
  return collectImports(parseSource(path, text));
}

function exportsOf(text: string, path = 'src/a.ts'): readonly ModuleExport[] {
  return collectExports(parseSource(path, text));
}

function bindingsOf(entry: ModuleImport): readonly string[] {
  return entry.bindings.map((binding) => `${binding.imported}->${binding.local}`);
}

describe('collectImports', () => {
  it('finds nothing in an empty file', () => {
    assert.deepEqual(importsOf(''), []);
  });

  it('reads a side-effect import', () => {
    const entry = elementAt(importsOf("import './setup.js';"));

    assert.equal(entry.specifier, './setup.js');
    assert.equal(entry.kind, 'static');
    assert.deepEqual(entry.bindings, []);
  });

  it('reads default, named and namespace bindings', () => {
    assert.deepEqual(bindingsOf(elementAt(importsOf("import a from 'm';"))), ['default->a']);
    assert.deepEqual(bindingsOf(elementAt(importsOf("import { a, b as c } from 'm';"))), [
      'a->a',
      'b->c',
    ]);
    assert.deepEqual(bindingsOf(elementAt(importsOf("import * as ns from 'm';"))), ['*->ns']);
    assert.deepEqual(bindingsOf(elementAt(importsOf("import a, { b } from 'm';"))), [
      'default->a',
      'b->b',
    ]);
  });

  it('marks type-only imports', () => {
    const statement = elementAt(importsOf("import type { A } from 'm';"));
    const inline = elementAt(importsOf("import { type A, b } from 'm';"));

    assert.equal(statement.typeOnly, true);
    assert.equal(statement.bindings[0]?.typeOnly, true);
    assert.equal(inline.typeOnly, false);
    assert.equal(elementAt(inline.bindings, 0).typeOnly, true);
    assert.equal(elementAt(inline.bindings, 1).typeOnly, false);
  });

  it('reads dynamic imports wherever they appear', () => {
    const entry = elementAt(importsOf("async function load() { return import('./late.js'); }"));

    assert.equal(entry.specifier, './late.js');
    assert.equal(entry.kind, 'dynamic');
  });

  it('reads CommonJS requires and the names they bind', () => {
    const whole = elementAt(importsOf("const express = require('express');", 'src/a.js'));
    const destructured = elementAt(
      importsOf("const { join, sep } = require('node:path');", 'src/a.js'),
    );

    assert.equal(whole.kind, 'require');
    assert.deepEqual(bindingsOf(whole), ['*->express']);
    assert.deepEqual(bindingsOf(destructured), ['join->join', 'sep->sep']);
  });

  it('reads an import-equals declaration', () => {
    const entry = elementAt(importsOf("import fs = require('node:fs');"));

    assert.equal(entry.specifier, 'node:fs');
    assert.equal(entry.kind, 'require');
  });

  it('ignores a specifier that is not a literal', () => {
    assert.deepEqual(importsOf('const name = "m"; const m = require(name);', 'src/a.js'), []);
  });

  it('records where each import appears', () => {
    const entry = elementAt(importsOf("\n\nimport a from 'm';"));

    assert.deepEqual(entry.location, { line: 3, column: 1 });
  });

  it('leaves re-exports to the export collector', () => {
    assert.deepEqual(importsOf("export { a } from './b.js';"), []);
  });
});

describe('collectExports', () => {
  it('finds nothing in an empty file', () => {
    assert.deepEqual(exportsOf(''), []);
  });

  it('reads declarations written with export', () => {
    const names = exportsOf(
      [
        'export const a = 1;',
        'export function b() {}',
        'export class C {}',
        'export interface D { x: number }',
        'export type E = string;',
        'export enum F { G }',
      ].join('\n'),
    ).map((entry) => entry.name);

    assert.deepEqual(names, ['a', 'b', 'C', 'D', 'E', 'F']);
  });

  it('reads every name of a destructured export', () => {
    assert.deepEqual(
      exportsOf('export const { a, b } = source;').map((entry) => entry.name),
      ['a', 'b'],
    );
  });

  it('reads an export list and its aliases', () => {
    assert.deepEqual(elementAt(exportsOf('const a = 1;\nexport { a as b };')), {
      name: 'b',
      local: 'a',
      source: null,
      typeOnly: false,
      location: { line: 2, column: 1 },
    });
  });

  it('reads a re-export and remembers where it comes from', () => {
    const entry = elementAt(exportsOf("export { a as b } from './c.js';"));

    assert.equal(entry.name, 'b');
    assert.equal(entry.local, 'a');
    assert.equal(entry.source, './c.js');
  });

  it('reads star and namespace re-exports', () => {
    const star = elementAt(exportsOf("export * from './c.js';"));
    const namespace = elementAt(exportsOf("export * as ns from './c.js';"));

    assert.equal(star.name, '*');
    assert.equal(star.local, null);
    assert.equal(namespace.name, 'ns');
    assert.equal(namespace.local, '*');
  });

  it('reads default exports in every form', () => {
    const named = elementAt(exportsOf('export default function name() {}'));

    assert.equal(named.name, 'default');
    assert.equal(named.local, 'name');
    assert.equal(elementAt(exportsOf('const a = 1;\nexport default a;')).local, 'a');
    assert.equal(elementAt(exportsOf('export default 42;')).local, null);
  });

  it('reads an export-equals assignment', () => {
    assert.equal(elementAt(exportsOf('const a = 1;\nexport = a;')).name, 'export=');
  });

  it('marks type-only exports', () => {
    assert.equal(elementAt(exportsOf("export type { A } from './b.js';")).typeOnly, true);
    assert.equal(elementAt(exportsOf('type A = 1;\nexport { type A };')).typeOnly, true);
  });

  it('reads CommonJS exports', () => {
    const whole = elementAt(exportsOf('const app = 1;\nmodule.exports = app;', 'src/a.js'));
    const property = elementAt(exportsOf('module.exports.router = router;', 'src/a.js'));
    const shorthand = elementAt(exportsOf('exports.handler = handler;', 'src/a.js'));

    assert.equal(whole.name, 'default');
    assert.equal(whole.local, 'app');
    assert.equal(property.name, 'router');
    assert.equal(shorthand.name, 'handler');
  });

  it('ignores assignments that only look like exports', () => {
    assert.deepEqual(exportsOf('other.exports = 1;\nmodule.other = 2;', 'src/a.js'), []);
  });
});

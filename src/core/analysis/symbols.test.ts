import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSource } from './parser.js';
import { collectSymbols } from './symbols.js';
import { type CodeSymbol } from './types.js';

function symbolsOf(text: string, path = 'src/a.ts'): readonly CodeSymbol[] {
  return collectSymbols(parseSource(path, text));
}

/** Renders a symbol as `kind Container.name` plus `*` when it is exported. */
function describeSymbol(symbol: CodeSymbol): string {
  const owner = symbol.container === null ? '' : `${symbol.container}.`;
  return `${symbol.kind} ${owner}${symbol.name}${symbol.exported ? '*' : ''}`;
}

function described(text: string, path = 'src/a.ts'): readonly string[] {
  return symbolsOf(text, path).map(describeSymbol);
}

describe('collectSymbols', () => {
  it('finds nothing in an empty file', () => {
    assert.deepEqual(symbolsOf(''), []);
  });

  it('reads functions and whether they are exported', () => {
    assert.deepEqual(described('function a() {}\nexport function b() {}'), [
      'function a',
      'function b*',
    ]);
  });

  it('reads a function assigned to a variable', () => {
    assert.deepEqual(described('const a = () => 1;\nconst b = function () {};'), [
      'function a',
      'function b',
    ]);
  });

  it('reads plain variables', () => {
    assert.deepEqual(described('const a = 1;\nlet b = "x";\nexport var c = [];'), [
      'variable a',
      'variable b',
      'variable c*',
    ]);
  });

  it('reads every name of a destructured declaration', () => {
    assert.deepEqual(described('const { a, b } = source;'), ['variable a', 'variable b']);
  });

  it('reads classes and their members', () => {
    assert.deepEqual(
      described(
        [
          'export class Cart {',
          '  constructor(id) {}',
          '  add(item) {}',
          '  get size() { return 0; }',
          '  set size(value) {}',
          '  clear = () => {};',
          '  private items = [];',
          '}',
        ].join('\n'),
      ),
      [
        'class Cart*',
        'method Cart.constructor',
        'method Cart.add',
        'method Cart.size',
        'method Cart.size',
        'method Cart.clear',
      ],
    );
  });

  it('reads a class assigned to a variable', () => {
    assert.deepEqual(described('const C = class { go() {} };'), ['class C', 'method C.go']);
  });

  it('reads TypeScript type declarations', () => {
    assert.deepEqual(
      described('export interface A { x: number }\ntype B = string;\nenum C { D }'),
      ['interface A*', 'type B', 'enum C'],
    );
  });

  it('reads declarations inside a namespace', () => {
    assert.deepEqual(described('namespace N { export function f() {} }'), ['function N.f*']);
  });

  it('names an anonymous default export', () => {
    assert.deepEqual(described('export default function () {}'), ['function default*']);
    assert.deepEqual(described('export default () => 1;'), ['function default*']);
    assert.deepEqual(described('export default class { go() {} }'), [
      'class default*',
      'method default.go',
    ]);
  });

  it('records where each declaration appears', () => {
    const [symbol] = symbolsOf('\nexport function a() {}');

    assert.deepEqual(symbol?.location, { line: 2, column: 1 });
  });

  it('ignores declarations nested inside function bodies', () => {
    assert.deepEqual(described('function outer() { function inner() {} const x = 1; }'), [
      'function outer',
    ]);
  });

  it('reports whatever survives broken syntax', () => {
    assert.deepEqual(described('export function fine() {}\nfunction ((( bad'), ['function fine*']);
  });
});

describe('collectSymbols on React source', () => {
  it('reads an arrow component', () => {
    assert.deepEqual(described('export const Button = () => <button />;', 'src/a.tsx'), [
      'component Button*',
    ]);
  });

  it('reads a function component', () => {
    assert.deepEqual(described('export function Panel() { return <div />; }', 'src/a.tsx'), [
      'component Panel*',
    ]);
  });

  it('reads a component through memo and forwardRef', () => {
    assert.deepEqual(
      described('export const A = memo(function Inner() { return <p />; });', 'src/a.tsx'),
      ['component A*'],
    );
    assert.deepEqual(
      described('export const B = React.forwardRef((props, ref) => <p ref={ref} />);', 'src/a.tsx'),
      ['component B*'],
    );
  });

  it('reads a class component', () => {
    assert.deepEqual(
      described(
        'export class Legacy extends React.Component { render() { return <i />; } }',
        'src/a.tsx',
      ),
      ['component Legacy*', 'method Legacy.render'],
    );
  });

  it('reads JSX in a plain .js file', () => {
    assert.deepEqual(described('export const Widget = () => <div />;', 'src/a.js'), [
      'component Widget*',
    ]);
  });

  it('needs both a capitalised name and JSX', () => {
    assert.deepEqual(described('export const helper = () => <div />;', 'src/a.tsx'), [
      'function helper*',
    ]);
    assert.deepEqual(described('export function Factory() { return 1; }', 'src/a.tsx'), [
      'function Factory*',
    ]);
  });

  it('reads an anonymous default component', () => {
    assert.deepEqual(described('export default () => <main />;', 'src/a.tsx'), [
      'component default*',
    ]);
  });

  it('leaves a class that extends something else alone', () => {
    assert.deepEqual(described('export class Store extends Base {}', 'src/a.tsx'), [
      'class Store*',
    ]);
  });
});

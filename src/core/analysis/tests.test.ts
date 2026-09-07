import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSource } from './parser.js';
import { collectTests, isTestPath } from './tests.js';
import { type TestCase } from './types.js';

function testsOf(text: string, path = 'src/a.test.ts'): readonly TestCase[] {
  return collectTests(parseSource(path, text));
}

describe('isTestPath', () => {
  it('recognises the .test and .spec conventions', () => {
    assert.ok(isTestPath('src/cart.test.ts'));
    assert.ok(isTestPath('src/cart.spec.js'));
    assert.ok(isTestPath('src/cart.test.tsx'));
    assert.ok(isTestPath('src/cart.test.mjs'));
  });

  it('recognises a __tests__ directory', () => {
    assert.ok(isTestPath('src/__tests__/cart.ts'));
    assert.ok(isTestPath('__tests__/cart.ts'));
  });

  it('leaves ordinary source alone', () => {
    assert.ok(!isTestPath('src/cart.ts'));
    assert.ok(!isTestPath('src/testing.ts'));
    assert.ok(!isTestPath('src/latest.ts'));
  });
});

describe('collectTests', () => {
  it('finds nothing in a file without tests', () => {
    assert.deepEqual(testsOf('export const a = 1;'), []);
  });

  it('separates suites from cases', () => {
    const found = testsOf("describe('cart', () => { it('adds', () => {}); });");

    assert.deepEqual(
      found.map((entry) => `${entry.kind} ${entry.name ?? '?'}`),
      ['suite cart', 'case adds'],
    );
  });

  it('reads tests nested inside suites', () => {
    const found = testsOf(
      [
        "describe('outer', () => {",
        "  describe('inner', () => {",
        "    test('deep', () => {});",
        '  });',
        '});',
      ].join('\n'),
    );

    assert.equal(found.length, 3);
    assert.equal(found[2]?.name, 'deep');
  });

  it('keeps the written form of a modified call', () => {
    const found = testsOf("it.only('one', () => {});\ntest.skip('two', () => {});");

    assert.deepEqual(
      found.map((entry) => entry.callee),
      ['it.only', 'test.skip'],
    );
    assert.deepEqual(
      found.map((entry) => entry.kind),
      ['case', 'case'],
    );
  });

  it('accepts a template literal title', () => {
    assert.equal(testsOf('it(`adds up`, () => {});')[0]?.name, 'adds up');
  });

  it('reports a computed title as null', () => {
    assert.equal(testsOf('it(name, () => {});')[0]?.name, null);
  });

  it('records where each test appears', () => {
    assert.deepEqual(testsOf("\nit('one', () => {});")[0]?.location, { line: 2, column: 1 });
  });

  it('ignores calls that only share a name', () => {
    assert.deepEqual(testsOf('runner.it("no");\nconst test = 1;'), []);
  });
});

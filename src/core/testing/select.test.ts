import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { type GitHead } from '../git/types.js';
import { type ImpactAnalysis } from '../impact/types.js';
import { selectTests } from './select.js';
import { type DiscoveredFile } from './types.js';

const HEAD: GitHead = {
  branch: 'main',
  commit: 'a1b2c3d',
  shortCommit: 'a1b2c3d',
  detached: false,
  unborn: false,
};

const FILES: readonly DiscoveredFile[] = [
  {
    path: 'src/cart.test.ts',
    tests: [
      { title: 'cart', suite: true, line: 1 },
      { title: 'adds', suite: false, line: 2 },
    ],
  },
  { path: 'src/other.test.ts', tests: [{ title: 'unrelated', suite: false, line: 1 }] },
  { path: 'src/third.test.ts', tests: [{ title: 'also unrelated', suite: false, line: 1 }] },
];

/** An impact analysis that reached the given test files. */
function impactOf(
  tests: readonly { path: string; distance: number }[],
  reasons: Readonly<Record<string, string>> = {},
): ImpactAnalysis {
  return {
    root: '/workspace/demo',
    depth: 3,
    truncated: false,
    head: HEAD,
    changed: [],
    affected: Object.entries(reasons).map(([path, detail]) => ({
      path,
      distance: 1,
      reasons: [
        {
          via: 'src/cart.ts',
          relation: 'imports-file',
          symbol: null,
          specifier: './cart.js',
          typeOnly: false,
          detail,
        },
      ],
    })),
    tests: tests.map((test) => ({ ...test, tests: [] })),
    components: [],
    routes: [],
    notes: [],
    summary: {
      changedFiles: 1,
      changedAnalysedFiles: 1,
      changedSymbols: 1,
      directlyAffected: 0,
      indirectlyAffected: 0,
      affectedTests: tests.length,
      affectedComponents: 0,
      affectedRoutes: 0,
    },
  };
}

describe('selectTests', () => {
  it('selects everything in all mode', () => {
    const selection = selectTests(FILES, { mode: 'all', pattern: null, impact: null });

    assert.equal(selection.mode, 'all');
    assert.deepEqual(
      selection.files.map((file) => file.path),
      ['src/cart.test.ts', 'src/other.test.ts', 'src/third.test.ts'],
    );
    assert.equal(selection.tests, 3);
    assert.deepEqual(
      selection.files.map((file) => file.reason),
      [null, null, null],
    );
  });

  it('selects nothing when there is nothing to select', () => {
    const selection = selectTests([], { mode: 'all', pattern: null, impact: null });

    assert.deepEqual(selection.files, []);
    assert.equal(selection.tests, 0);
  });

  it('keeps a name filter alongside the files', () => {
    const selection = selectTests(FILES, { mode: 'all', pattern: 'adds', impact: null });

    assert.equal(selection.pattern, 'adds');
  });

  it('selects only the test files the impact search reached', () => {
    const selection = selectTests(FILES, {
      mode: 'impacted',
      pattern: null,
      impact: impactOf([{ path: 'src/cart.test.ts', distance: 1 }], {
        'src/cart.test.ts': 'src/cart.test.ts imports total from src/cart.ts, and total changed',
      }),
    });

    assert.equal(selection.mode, 'impacted');
    assert.deepEqual(
      selection.files.map((file) => file.path),
      ['src/cart.test.ts'],
    );
    assert.equal(selection.tests, 1);
  });

  it('carries the reason the impact search recorded', () => {
    const detail = 'src/cart.test.ts imports total from src/cart.ts, and total changed';
    const selection = selectTests(FILES, {
      mode: 'impacted',
      pattern: null,
      impact: impactOf([{ path: 'src/cart.test.ts', distance: 1 }], {
        'src/cart.test.ts': detail,
      }),
    });

    assert.equal(elementAt(selection.files).reason, detail);
  });

  it('says plainly when the test file itself changed', () => {
    const selection = selectTests(FILES, {
      mode: 'impacted',
      pattern: null,
      impact: impactOf([{ path: 'src/cart.test.ts', distance: 0 }]),
    });

    assert.equal(elementAt(selection.files).reason, 'src/cart.test.ts changed');
  });

  it('falls back to a plain reason when none was recorded', () => {
    const selection = selectTests(FILES, {
      mode: 'impacted',
      pattern: null,
      impact: impactOf([{ path: 'src/cart.test.ts', distance: 2 }]),
    });

    assert.equal(elementAt(selection.files).reason, 'src/cart.test.ts depends on what changed');
  });

  it('leaves out the tests nothing reached', () => {
    const selection = selectTests(FILES, {
      mode: 'impacted',
      pattern: null,
      impact: impactOf([{ path: 'src/cart.test.ts', distance: 1 }]),
    });

    assert.ok(!selection.files.some((file) => file.path === 'src/other.test.ts'));
    assert.ok(!selection.files.some((file) => file.path === 'src/third.test.ts'));
  });

  it('selects nothing when the change reached no tests', () => {
    const selection = selectTests(FILES, { mode: 'impacted', pattern: null, impact: impactOf([]) });

    assert.deepEqual(selection.files, []);
    assert.equal(selection.tests, 0);
  });

  it('ignores a test file the impact reached that is not a discovered one', () => {
    const selection = selectTests(FILES, {
      mode: 'impacted',
      pattern: null,
      impact: impactOf([{ path: 'src/gone.test.ts', distance: 1 }]),
    });

    assert.deepEqual(selection.files, []);
  });

  it('falls back to everything when impacted mode has no analysis to work from', () => {
    const selection = selectTests(FILES, { mode: 'impacted', pattern: null, impact: null });

    assert.equal(selection.mode, 'all');
    assert.equal(selection.files.length, 3);
  });

  it('sorts the selection by path', () => {
    const selection = selectTests([...FILES].reverse(), {
      mode: 'all',
      pattern: null,
      impact: null,
    });

    assert.deepEqual(
      selection.files.map((file) => file.path),
      ['src/cart.test.ts', 'src/other.test.ts', 'src/third.test.ts'],
    );
  });
});

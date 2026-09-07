import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { analyzeSource } from '../analysis/file.js';
import { type FileAnalysis } from '../analysis/types.js';
import { type DiffHunk, type FileChange } from '../git/types.js';
import { describeChange, symbolsCovering, touchedLines } from './changed.js';

const SOURCE = [
  'export function total() {', // 1
  '  return 1;', // 2
  '}', // 3
  '', // 4
  'export class Cart {', // 5
  '  add() {', // 6
  '    return 2;', // 7
  '  }', // 8
  '}', // 9
  '', // 10
  'export const NAME = "x";', // 11
  '',
].join('\n');

function analysis(text = SOURCE, path = 'src/cart.ts'): FileAnalysis {
  return analyzeSource(path, text, text.length);
}

/** Builds a hunk covering the given added and removed line numbers. */
function hunk(overrides: Partial<DiffHunk> = {}): DiffHunk {
  return {
    oldStart: 1,
    oldLines: 1,
    newStart: 1,
    newLines: 1,
    heading: null,
    addedLines: [],
    removedLines: [],
    ...overrides,
  };
}

function change(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'src/cart.ts',
    previousPath: null,
    kind: 'modified',
    scope: 'unstaged',
    binary: false,
    similarity: null,
    hunks: [],
    stats: { added: 0, removed: 0 },
    ...overrides,
  };
}

describe('touchedLines', () => {
  it('returns nothing for no hunks', () => {
    assert.deepEqual(touchedLines([]), []);
  });

  it('collects the added lines of every hunk, sorted and deduplicated', () => {
    assert.deepEqual(
      touchedLines([hunk({ addedLines: [7, 2] }), hunk({ addedLines: [2, 11] })]),
      [2, 7, 11],
    );
  });

  it('takes the lines a removal sits between when nothing was added', () => {
    assert.deepEqual(
      touchedLines([hunk({ newStart: 6, newLines: 0, removedLines: [6, 7] })]),
      [6, 7],
    );
  });

  it('never reports a line before the first', () => {
    assert.deepEqual(touchedLines([hunk({ newStart: 0, newLines: 0, removedLines: [1] })]), [1, 2]);
  });
});

describe('symbolsCovering', () => {
  it('returns nothing when no line falls inside a declaration', () => {
    assert.deepEqual(symbolsCovering(analysis(), [4, 10]), []);
  });

  it('names the declaration a line falls inside', () => {
    const found = symbolsCovering(analysis(), [2]);

    assert.deepEqual(
      found.map((symbol) => `${symbol.kind} ${symbol.name}`),
      ['function total'],
    );
    assert.deepEqual(elementAt(found).lines, [2]);
  });

  it('names both a method and the class around it', () => {
    assert.deepEqual(
      symbolsCovering(analysis(), [7]).map(
        (symbol) => `${symbol.kind} ${symbol.container ?? ''}${symbol.name}`,
      ),
      ['class Cart', 'method Cartadd'],
    );
  });

  it('names a single-line declaration', () => {
    assert.deepEqual(
      symbolsCovering(analysis(), [11]).map((symbol) => symbol.name),
      ['NAME'],
    );
  });

  it('reports every touched line inside a declaration', () => {
    assert.deepEqual(elementAt(symbolsCovering(analysis(), [1, 2, 3])).lines, [1, 2, 3]);
  });
});

describe('describeChange', () => {
  it('names the declarations a diff touched', () => {
    const described = describeChange(
      'src/cart.ts',
      change({ hunks: [hunk({ newStart: 2, addedLines: [2] })] }),
      analysis(),
    );

    assert.equal(described.precision, 'exact');
    assert.equal(described.analysed, true);
    assert.deepEqual(
      described.symbols.map((symbol) => symbol.name),
      ['total'],
    );
  });

  it('treats an untracked file as wholly new', () => {
    const described = describeChange('src/cart.ts', change({ kind: 'untracked' }), analysis());

    assert.equal(described.precision, 'whole-file');
    assert.deepEqual(
      described.symbols.map((symbol) => symbol.name),
      ['total', 'Cart', 'add', 'NAME'],
    );
  });

  it('claims no declarations for a file it could not analyse', () => {
    const described = describeChange('assets/logo.png', change({ kind: 'deleted' }), null);

    assert.equal(described.analysed, false);
    assert.equal(described.precision, 'unknown');
    assert.deepEqual(described.symbols, []);
  });

  it('claims no declarations for a modified file with no diff to read', () => {
    const described = describeChange('src/cart.ts', change({ binary: true }), analysis());

    assert.equal(described.precision, 'unknown');
    assert.deepEqual(described.symbols, []);
  });

  it('treats a rename git scored as identical as touching nothing', () => {
    const described = describeChange(
      'src/basket.ts',
      change({ kind: 'renamed', similarity: 100, previousPath: 'src/cart.ts' }),
      analysis(SOURCE, 'src/basket.ts'),
    );

    assert.equal(described.precision, 'exact');
    assert.deepEqual(described.symbols, []);
  });

  it('reads the diff of a rename that also changed content', () => {
    const described = describeChange(
      'src/basket.ts',
      change({
        kind: 'renamed',
        similarity: 82,
        previousPath: 'src/cart.ts',
        hunks: [hunk({ newStart: 7, addedLines: [7] })],
      }),
      analysis(SOURCE, 'src/basket.ts'),
    );

    assert.equal(described.precision, 'exact');
    assert.deepEqual(
      described.symbols.map((symbol) => symbol.name),
      ['Cart', 'add'],
    );
  });

  it('keeps the kind Git reported', () => {
    assert.equal(describeChange('a.ts', change({ kind: 'added' }), analysis()).kind, 'added');
  });
});

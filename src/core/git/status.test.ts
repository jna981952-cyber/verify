import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { parseStatus } from './status.js';

const HASH = '0000000000000000000000000000000000000000';

/** Builds an ordinary (`1`) porcelain v2 record. */
function ordinary(code: string, path: string): string {
  return `1 ${code} N... 100644 100644 100644 ${HASH} ${HASH} ${path}`;
}

/** Builds a rename (`2`) porcelain v2 record plus its original-path chunk. */
function renamed(code: string, score: string, path: string, previousPath: string): string {
  return `2 ${code} N... 100644 100644 100644 ${HASH} ${HASH} ${score} ${path}\0${previousPath}`;
}

/** Joins records the way `--porcelain=v2 -z` terminates them. */
function records(...entries: readonly string[]): string {
  return entries.map((entry) => `${entry}\0`).join('');
}

describe('parseStatus', () => {
  it('returns nothing for a clean working tree', () => {
    assert.deepEqual(parseStatus(''), []);
  });

  it('reads a file modified only in the working tree', () => {
    const entry = elementAt(parseStatus(records(ordinary('.M', 'src/cart.ts'))));

    assert.deepEqual(entry, {
      path: 'src/cart.ts',
      previousPath: null,
      kind: 'modified',
      scope: 'unstaged',
      similarity: null,
    });
  });

  it('reads a file modified only in the index', () => {
    const entry = elementAt(parseStatus(records(ordinary('M.', 'src/cart.ts'))));

    assert.equal(entry.kind, 'modified');
    assert.equal(entry.scope, 'staged');
  });

  it('reads a file modified in both the index and the working tree', () => {
    const entry = elementAt(parseStatus(records(ordinary('MM', 'src/cart.ts'))));

    assert.equal(entry.scope, 'both');
  });

  it('recognises additions, deletions and type changes', () => {
    const entries = parseStatus(
      records(ordinary('A.', 'added.ts'), ordinary('D.', 'gone.ts'), ordinary('T.', 'link.ts')),
    );

    assert.deepEqual(
      entries.map((entry) => entry.kind),
      ['added', 'deleted', 'modified'],
    );
  });

  it('lets the index decide the kind when both sides changed', () => {
    const entry = elementAt(parseStatus(records(ordinary('AM', 'fresh.ts'))));

    assert.equal(entry.kind, 'added');
    assert.equal(entry.scope, 'both');
  });

  it('reads renames together with their previous path and score', () => {
    const entry = elementAt(
      parseStatus(records(renamed('R.', 'R096', 'src/new.ts', 'src/old.ts'))),
    );

    assert.deepEqual(entry, {
      path: 'src/new.ts',
      previousPath: 'src/old.ts',
      kind: 'renamed',
      scope: 'staged',
      similarity: 96,
    });
  });

  it('treats a copy as an addition that remembers its source', () => {
    const entry = elementAt(
      parseStatus(records(renamed('C.', 'C075', 'src/copy.ts', 'src/original.ts'))),
    );

    assert.equal(entry.kind, 'added');
    assert.equal(entry.previousPath, 'src/original.ts');
    assert.equal(entry.similarity, 75);
  });

  it('continues parsing after a rename record', () => {
    const entries = parseStatus(
      records(renamed('R.', 'R100', 'b.ts', 'a.ts'), ordinary('.M', 'c.ts')),
    );

    assert.deepEqual(
      entries.map((entry) => entry.path),
      ['b.ts', 'c.ts'],
    );
  });

  it('reads untracked files', () => {
    const entry = elementAt(parseStatus(records('? notes.md')));

    assert.deepEqual(entry, {
      path: 'notes.md',
      previousPath: null,
      kind: 'untracked',
      scope: 'unstaged',
      similarity: null,
    });
  });

  it('reads unmerged paths as touching both the index and the working tree', () => {
    const record = `u UU N... 100644 100644 100644 100644 ${HASH} ${HASH} ${HASH} conflict.ts`;
    const entry = elementAt(parseStatus(records(record)));

    assert.equal(entry.kind, 'unmerged');
    assert.equal(entry.scope, 'both');
  });

  it('keeps paths containing spaces intact', () => {
    const entry = elementAt(parseStatus(records(ordinary('.M', 'src/my folder/file (v2).ts'))));

    assert.equal(entry.path, 'src/my folder/file (v2).ts');
  });

  it('skips records it does not model instead of failing', () => {
    const entries = parseStatus(
      records('# branch.head main', '! build/ignored.js', ordinary('.M', 'kept.ts')),
    );

    assert.deepEqual(
      entries.map((entry) => entry.path),
      ['kept.ts'],
    );
  });

  it('skips truncated records', () => {
    assert.deepEqual(parseStatus(records('1 .M')), []);
  });
});

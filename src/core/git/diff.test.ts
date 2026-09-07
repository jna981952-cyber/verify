import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { parseDiff, parseHunks, parseNumstat, splitPatch } from './diff.js';

const MODIFIED_PATCH = `diff --git a/src/cart.ts b/src/cart.ts
index 4cb29ea..6addb9b 100644
--- a/src/cart.ts
+++ b/src/cart.ts
@@ -2 +2 @@ export class Cart {
-  total = 0;
+  total = 1;
@@ -8,0 +9,2 @@ export class Cart {
+  clear() {}
+
`;

const BINARY_PATCH = `diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..0f49c4a
Binary files /dev/null and b/logo.png differ
`;

describe('parseNumstat', () => {
  it('returns nothing for an empty diff', () => {
    assert.deepEqual(parseNumstat(''), []);
  });

  it('reads counts and the path of an ordinary record', () => {
    assert.deepEqual(parseNumstat('2\t1\tsrc/cart.ts\0'), [
      { path: 'src/cart.ts', previousPath: null, binary: false },
    ]);
  });

  it('flags binary content', () => {
    assert.deepEqual(parseNumstat('-\t-\tlogo.png\0'), [
      { path: 'logo.png', previousPath: null, binary: true },
    ]);
  });

  it('reads the pair of paths a rename prints as separate chunks', () => {
    assert.deepEqual(parseNumstat('0\t0\t\0src/old.ts\0src/new.ts\0'), [
      { path: 'src/new.ts', previousPath: 'src/old.ts', binary: false },
    ]);
  });

  it('keeps reading after a rename record', () => {
    const entries = parseNumstat('0\t0\t\0old.ts\0new.ts\x004\t0\tnotes.md\0');

    assert.deepEqual(
      entries.map((entry) => entry.path),
      ['new.ts', 'notes.md'],
    );
  });

  it('keeps paths containing spaces and non-ASCII characters intact', () => {
    const entry = parseNumstat('1\t0\tsrc/my folder/日本語.ts\0')[0];

    assert.equal(entry?.path, 'src/my folder/日本語.ts');
  });
});

describe('splitPatch', () => {
  it('returns nothing for an empty patch', () => {
    assert.deepEqual(splitPatch(''), []);
  });

  it('splits one section per file', () => {
    const sections = splitPatch(`${MODIFIED_PATCH}${BINARY_PATCH}`);

    assert.equal(sections.length, 2);
    assert.ok(sections[0]?.startsWith('diff --git a/src/cart.ts'));
    assert.ok(sections[1]?.startsWith('diff --git a/logo.png'));
  });
});

describe('parseHunks', () => {
  it('reads the ranges, heading and line numbers of each hunk', () => {
    assert.deepEqual(parseHunks(MODIFIED_PATCH), [
      {
        oldStart: 2,
        oldLines: 1,
        newStart: 2,
        newLines: 1,
        heading: 'export class Cart {',
        addedLines: [2],
        removedLines: [2],
      },
      {
        oldStart: 8,
        oldLines: 0,
        newStart: 9,
        newLines: 2,
        heading: 'export class Cart {',
        addedLines: [9, 10],
        removedLines: [],
      },
    ]);
  });

  it('reports a missing heading as null', () => {
    const hunk = elementAt(parseHunks('@@ -1 +1 @@\n-a\n+b\n'));

    assert.equal(hunk.heading, null);
  });

  it('counts context lines towards both sides', () => {
    const hunk = elementAt(parseHunks('@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n'));

    assert.deepEqual(hunk.removedLines, [2]);
    assert.deepEqual(hunk.addedLines, [2]);
  });

  it('ignores the no-newline marker', () => {
    const hunk = elementAt(parseHunks('@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n'));

    assert.deepEqual(hunk.addedLines, [1]);
    assert.deepEqual(hunk.removedLines, [1]);
  });

  it('finds no hunks in a binary patch', () => {
    assert.deepEqual(parseHunks(BINARY_PATCH), []);
  });
});

describe('parseDiff', () => {
  it('pairs each numstat record with its patch section', () => {
    const files = parseDiff(
      '2\t1\tsrc/cart.ts\0-\t-\tlogo.png\0',
      `${MODIFIED_PATCH}${BINARY_PATCH}`,
    );

    const cart = elementAt(files);

    assert.equal(files.length, 2);
    assert.equal(cart.path, 'src/cart.ts');
    assert.equal(cart.binary, false);
    assert.equal(cart.hunks.length, 2);
    assert.deepEqual(cart.stats, { added: 3, removed: 1 });
  });

  it('leaves binary files without hunks', () => {
    const binary = elementAt(
      parseDiff('2\t1\tsrc/cart.ts\0-\t-\tlogo.png\0', `${MODIFIED_PATCH}${BINARY_PATCH}`),
      1,
    );

    assert.equal(binary.binary, true);
    assert.deepEqual(binary.hunks, []);
    assert.deepEqual(binary.stats, { added: 0, removed: 0 });
  });

  it('carries the previous path of a rename', () => {
    const file = elementAt(
      parseDiff(
        '0\t0\t\0src/old.ts\0src/new.ts\0',
        'diff --git a/src/old.ts b/src/new.ts\nsimilarity index 100%\n',
      ),
    );

    assert.equal(file.path, 'src/new.ts');
    assert.equal(file.previousPath, 'src/old.ts');
  });

  it('falls back to no hunks when the two views disagree', () => {
    const files = parseDiff('2\t1\tsrc/cart.ts\x004\t0\tother.ts\0', MODIFIED_PATCH);

    assert.equal(files.length, 2);
    assert.deepEqual(
      files.map((file) => file.hunks.length),
      [0, 0],
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type ChangeSet, type FileChange, type GitHead } from '../core/git/types.js';
import { type ChangesReport } from '../core/report.js';
import { createPalette } from '../utils/color.js';
import { describeHead, formatChangesJson, formatChangesText } from './changes.js';
import { formatChangesReport } from './index.js';

const ESC = String.fromCharCode(27);

const plain = createPalette(false);
const colourful = createPalette(true);

const HEAD: GitHead = {
  branch: 'main',
  commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  shortCommit: 'a1b2c3d',
  detached: false,
  unborn: false,
};

function file(path: string, overrides: Partial<FileChange> = {}): FileChange {
  return {
    path,
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

function report(files: readonly FileChange[], head: GitHead = HEAD): ChangesReport {
  const counts = { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0, unmerged: 0 };
  for (const change of files) {
    counts[change.kind] += 1;
  }

  const changes: ChangeSet = {
    root: '/workspace/demo',
    head,
    files,
    summary: { ...counts, total: files.length },
  };

  return { tool: { name: 'verify', version: '1.2.3' }, target: '/workspace/demo', changes };
}

describe('describeHead', () => {
  it('names the branch and the abbreviated commit', () => {
    assert.equal(describeHead(HEAD), 'On branch main at a1b2c3d');
  });

  it('says when HEAD is detached', () => {
    assert.equal(
      describeHead({ ...HEAD, branch: null, detached: true }),
      'At a1b2c3d (detached HEAD)',
    );
  });

  it('says when the repository has no commits yet', () => {
    assert.equal(
      describeHead({
        branch: 'main',
        commit: null,
        shortCommit: null,
        detached: false,
        unborn: true,
      }),
      'On branch main with no commits yet',
    );
  });
});

describe('formatChangesText', () => {
  it('lists the changed files and counts them by kind', () => {
    const output = formatChangesText(
      report([
        file('src/cart.ts'),
        file('src/checkout.ts'),
        file('tests/checkout.test.ts', { kind: 'added', scope: 'staged' }),
      ]),
      plain,
    );

    assert.equal(
      output,
      [
        'On branch main at a1b2c3d',
        '',
        'Changed files:',
        '',
        '  M src/cart.ts',
        '  M src/checkout.ts',
        '  A tests/checkout.test.ts',
        '',
        'Summary:',
        '  2 modified',
        '  1 added',
        '  0 deleted',
        '  0 renamed',
      ].join('\n'),
    );
  });

  it('uses the marker git prints for each kind', () => {
    const output = formatChangesText(
      report([
        file('a.ts', { kind: 'added' }),
        file('d.ts', { kind: 'deleted' }),
        file('m.ts', { kind: 'modified' }),
        file('u.ts', { kind: 'untracked' }),
        file('x.ts', { kind: 'unmerged' }),
      ]),
      plain,
    );

    assert.match(output, /^ {2}A a\.ts$/m);
    assert.match(output, /^ {2}D d\.ts$/m);
    assert.match(output, /^ {2}M m\.ts$/m);
    assert.match(output, /^ {2}\? u\.ts$/m);
    assert.match(output, /^ {2}U x\.ts$/m);
  });

  it('shows both sides of a rename', () => {
    const output = formatChangesText(
      report([file('src/new.ts', { kind: 'renamed', previousPath: 'src/old.ts' })]),
      plain,
    );

    assert.match(output, /^ {2}R src\/old\.ts -> src\/new\.ts$/m);
  });

  it('adds counters beyond the four only when they have something to report', () => {
    const withoutUntracked = formatChangesText(report([file('a.ts')]), plain);
    const withUntracked = formatChangesText(
      report([file('a.ts'), file('b.ts', { kind: 'untracked' })]),
      plain,
    );

    assert.doesNotMatch(withoutUntracked, /untracked/);
    assert.match(withUntracked, /^ {2}1 untracked$/m);
    assert.doesNotMatch(withUntracked, /unmerged/);
  });

  it('answers a clean working tree in one line', () => {
    const output = formatChangesText(report([]), plain);

    assert.equal(output, ['On branch main at a1b2c3d', '', '✔ No changes.'].join('\n'));
  });

  it('colours the markers when the palette is enabled', () => {
    const output = formatChangesText(report([file('a.ts', { kind: 'added' })]), colourful);

    assert.ok(output.includes(`${ESC}[32mA${ESC}[39m`));
  });

  it('emits no escape sequences when the palette is disabled', () => {
    const output = formatChangesText(report([file('a.ts')]), plain);

    assert.ok(!output.includes(ESC));
  });
});

describe('formatChangesJson', () => {
  it('serialises the whole report', () => {
    const source = report([file('src/cart.ts')]);
    const parsed: unknown = JSON.parse(formatChangesJson(source));

    assert.deepEqual(parsed, JSON.parse(JSON.stringify(source)));
  });

  it('pretty-prints the payload', () => {
    assert.match(formatChangesJson(report([])), /^\{\n {2}"tool": \{/);
  });
});

describe('formatChangesReport', () => {
  it('dispatches to the text reporter', () => {
    const output = formatChangesReport(report([]), { format: 'text', palette: plain });

    assert.match(output, /No changes\./);
  });

  it('dispatches to the JSON reporter', () => {
    const output = formatChangesReport(report([]), { format: 'json', palette: plain });

    assert.equal(output, formatChangesJson(report([])));
  });
});

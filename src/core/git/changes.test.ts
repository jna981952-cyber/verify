import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { createGitFixture, type GitFixture } from '../../test-helpers/git.js';
import { createFixture, type Fixture } from '../../test-helpers/fixtures.js';
import { collectChanges, requireChanges } from './changes.js';
import { createGitRunner, GitCommandError, GitUnavailableError, type GitRunner } from './runner.js';
import { type ChangeSet, type FileChange } from './types.js';

/** Stands in for a machine where `git` cannot be executed. */
const missingGit: GitRunner = () =>
  Promise.reject(new GitUnavailableError('Could not run git. Is it installed and on PATH?'));

function find(changes: ChangeSet, path: string): FileChange {
  const file = changes.files.find((candidate) => candidate.path === path);
  assert.ok(file !== undefined, `expected a change for ${path}`);
  return file;
}

/** Collects the changes of a directory that is expected to be a repository. */
async function changesFor(directory: string): Promise<ChangeSet> {
  const changes = await collectChanges(directory);
  assert.ok(changes !== null, `expected ${directory} to be a repository`);
  return changes;
}

describe('collectChanges', () => {
  const cleanups: (() => Promise<void>)[] = [];

  after(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  });

  /** Creates a repository whose first commit holds `files`. */
  async function committed(files: Readonly<Record<string, string>> = {}): Promise<GitFixture> {
    const repository = await createGitFixture(files);
    cleanups.push(repository.cleanup.bind(repository));
    await repository.commit('initial');
    return repository;
  }

  async function plainDirectory(): Promise<Fixture> {
    const fixture = await createFixture({ 'readme.md': '# not a repository\n' });
    cleanups.push(fixture.cleanup.bind(fixture));
    return fixture;
  }

  it('reports nothing for a clean repository', async () => {
    const repository = await committed({ 'src/cart.ts': 'export const cart = [];\n' });

    const changes = await changesFor(repository.path);

    assert.deepEqual(changes.files, []);
    assert.deepEqual(changes.summary, {
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      untracked: 0,
      unmerged: 0,
      total: 0,
    });
  });

  it('reports the repository root and the current branch and commit', async () => {
    const repository = await committed({ 'a.txt': 'a\n' });

    const changes = await changesFor(repository.path);

    assert.equal(changes.root, repository.path);
    assert.equal(changes.head.branch, 'main');
    assert.match(changes.head.commit ?? '', /^[0-9a-f]{40,}$/);
    assert.equal(changes.head.shortCommit, changes.head.commit?.slice(0, 7));
    assert.equal(changes.head.detached, false);
    assert.equal(changes.head.unborn, false);
  });

  it('reports a detached HEAD without a branch', async () => {
    const repository = await committed({ 'a.txt': 'a\n' });
    await repository.git('checkout', '--quiet', '--detach', 'HEAD');

    const changes = await changesFor(repository.path);

    assert.equal(changes.head.branch, null);
    assert.equal(changes.head.detached, true);
    assert.notEqual(changes.head.commit, null);
  });

  it('detects a file modified in the working tree', async () => {
    const repository = await committed({ 'src/cart.ts': 'one\ntwo\nthree\n' });
    await repository.write('src/cart.ts', 'one\nTWO\nthree\n');

    const changes = await changesFor(repository.path);
    const file = find(changes, 'src/cart.ts');

    assert.equal(file.kind, 'modified');
    assert.equal(file.scope, 'unstaged');
    assert.equal(file.binary, false);
    assert.deepEqual(file.stats, { added: 1, removed: 1 });
  });

  it('detects a staged change', async () => {
    const repository = await committed({ 'src/cart.ts': 'one\n' });
    await repository.write('src/cart.ts', 'one\ntwo\n');
    await repository.git('add', 'src/cart.ts');

    const file = find(await changesFor(repository.path), 'src/cart.ts');

    assert.equal(file.kind, 'modified');
    assert.equal(file.scope, 'staged');
  });

  it('detects a file changed in both the index and the working tree', async () => {
    const repository = await committed({ 'src/cart.ts': 'one\n' });
    await repository.write('src/cart.ts', 'one\ntwo\n');
    await repository.git('add', 'src/cart.ts');
    await repository.write('src/cart.ts', 'one\ntwo\nthree\n');

    const file = find(await changesFor(repository.path), 'src/cart.ts');

    assert.equal(file.scope, 'both');
    assert.deepEqual(file.stats, { added: 2, removed: 0 });
  });

  it('detects untracked files', async () => {
    const repository = await committed({ 'a.txt': 'a\n' });
    await repository.write('notes/todo.md', '- write tests\n');

    const changes = await changesFor(repository.path);
    const file = find(changes, 'notes/todo.md');

    assert.equal(file.kind, 'untracked');
    assert.equal(file.scope, 'unstaged');
    assert.deepEqual(file.hunks, []);
    assert.equal(changes.summary.untracked, 1);
  });

  it('detects an added file once it is staged', async () => {
    const repository = await committed({ 'a.txt': 'a\n' });
    await repository.write('tests/checkout.test.ts', 'test\n');
    await repository.git('add', 'tests/checkout.test.ts');

    const file = find(await changesFor(repository.path), 'tests/checkout.test.ts');

    assert.equal(file.kind, 'added');
    assert.equal(file.scope, 'staged');
    assert.deepEqual(file.stats, { added: 1, removed: 0 });
  });

  it('detects a deleted file', async () => {
    const repository = await committed({ 'a.txt': 'a\n', 'gone.txt': 'bye\n' });
    await repository.remove('gone.txt');

    const file = find(await changesFor(repository.path), 'gone.txt');

    assert.equal(file.kind, 'deleted');
    assert.deepEqual(file.stats, { added: 0, removed: 1 });
  });

  it('detects a rename together with its previous path', async () => {
    const repository = await committed({ 'src/old.ts': 'export const value = 1;\n' });
    await repository.git('mv', 'src/old.ts', 'src/new.ts');

    const changes = await changesFor(repository.path);
    const file = find(changes, 'src/new.ts');

    assert.equal(file.kind, 'renamed');
    assert.equal(file.previousPath, 'src/old.ts');
    assert.equal(file.similarity, 100);
    assert.equal(changes.summary.renamed, 1);
    assert.equal(changes.summary.total, 1);
  });

  it('parses hunks and changed line numbers', async () => {
    const repository = await committed({ 'src/cart.ts': 'one\ntwo\nthree\n' });
    await repository.write('src/cart.ts', 'one\nTWO\nthree\nfour\n');

    const file = find(await changesFor(repository.path), 'src/cart.ts');

    const replaced = elementAt(file.hunks, 0);
    const appended = elementAt(file.hunks, 1);

    // The section heading git attaches to a hunk depends on its diff driver,
    // so only the ranges are asserted here; headings are covered by the
    // parser's own tests, where the input is fixed.
    assert.equal(file.hunks.length, 2);
    assert.deepEqual(
      { start: replaced.oldStart, lines: replaced.oldLines },
      { start: 2, lines: 1 },
    );
    assert.deepEqual(replaced.addedLines, [2]);
    assert.deepEqual(replaced.removedLines, [2]);
    assert.deepEqual(appended.addedLines, [4]);
    assert.deepEqual(appended.removedLines, []);
  });

  it('flags binary content and leaves it without hunks', async () => {
    const repository = await committed({ 'a.txt': 'a\n' });
    await repository.writeBytes('logo.bin', Uint8Array.from([0, 1, 2, 0, 255, 7, 0]));
    await repository.git('add', 'logo.bin');

    const file = find(await changesFor(repository.path), 'logo.bin');

    assert.equal(file.binary, true);
    assert.deepEqual(file.hunks, []);
    assert.deepEqual(file.stats, { added: 0, removed: 0 });
  });

  it('handles paths with spaces and non-ASCII characters', async () => {
    const repository = await committed({ 'src/my folder/file (v2).ts': 'one\n' });
    await repository.write('src/my folder/file (v2).ts', 'two\n');
    await repository.write('docs/日本語.md', '# notes\n');

    const changes = await changesFor(repository.path);

    assert.equal(find(changes, 'src/my folder/file (v2).ts').kind, 'modified');
    assert.equal(find(changes, 'docs/日本語.md').kind, 'untracked');
  });

  it('reports several changes at once, sorted by path', async () => {
    const repository = await committed({
      'src/cart.ts': 'one\n',
      'src/checkout.ts': 'one\n',
      'src/legacy.ts': 'one\n',
      'src/old-name.ts': 'one\n',
    });
    await repository.write('src/cart.ts', 'two\n');
    await repository.write('src/checkout.ts', 'two\n');
    await repository.remove('src/legacy.ts');
    await repository.git('mv', 'src/old-name.ts', 'src/new-name.ts');
    await repository.write('tests/checkout.test.ts', 'test\n');
    await repository.git('add', 'tests/checkout.test.ts');

    const changes = await changesFor(repository.path);

    assert.deepEqual(
      changes.files.map((file) => file.path),
      [
        'src/cart.ts',
        'src/checkout.ts',
        'src/legacy.ts',
        'src/new-name.ts',
        'tests/checkout.test.ts',
      ],
    );
    assert.deepEqual(changes.summary, {
      added: 1,
      modified: 2,
      deleted: 1,
      renamed: 1,
      untracked: 0,
      unmerged: 0,
      total: 5,
    });
  });

  it('reports staged content in a repository with no commits yet', async () => {
    const repository = await createGitFixture({ 's.txt': 'x\ny\n', 'u.txt': 'u\n' });
    cleanups.push(repository.cleanup.bind(repository));
    await repository.git('add', 's.txt');

    const changes = await changesFor(repository.path);

    assert.equal(changes.head.unborn, true);
    assert.equal(changes.head.commit, null);
    assert.equal(changes.head.branch, 'main');
    assert.equal(find(changes, 's.txt').kind, 'added');
    assert.deepEqual(find(changes, 's.txt').stats, { added: 2, removed: 0 });
    assert.equal(find(changes, 'u.txt').kind, 'untracked');
  });

  it('reports nothing for an empty repository with an empty working tree', async () => {
    const repository = await createGitFixture();
    cleanups.push(repository.cleanup.bind(repository));

    const changes = await changesFor(repository.path);

    assert.equal(changes.head.unborn, true);
    assert.deepEqual(changes.files, []);
  });

  it('finds the repository from a subdirectory', async () => {
    const repository = await committed({ 'src/cart.ts': 'one\n' });
    await repository.write('src/cart.ts', 'two\n');

    const changes = await changesFor(`${repository.path}/src`);

    assert.equal(changes.root, repository.path);
    assert.equal(changes.files.length, 1);
  });

  it('returns null for a directory that is not a repository', async () => {
    const fixture = await plainDirectory();

    assert.equal(await collectChanges(fixture.path), null);
  });

  it('reports a failing status rather than calling the tree clean', async () => {
    const repository = await committed({ 'a.txt': 'a\n' });
    const brokenStatus: GitRunner = (args, options) =>
      args.includes('status')
        ? Promise.resolve({ code: 128, stdout: '', stderr: 'fatal: index file corrupt' })
        : createGitRunner()(args, options);

    await assert.rejects(
      collectChanges(repository.path, { runner: brokenStatus }),
      (error: unknown) => {
        assert.ok(error instanceof GitCommandError);
        assert.equal(error.exitCode, 3);
        assert.match(error.message, /index file corrupt/);
        return true;
      },
    );
  });

  it('propagates the failure when git cannot be run', async () => {
    const fixture = await plainDirectory();

    await assert.rejects(collectChanges(fixture.path, { runner: missingGit }), (error: unknown) => {
      assert.ok(error instanceof GitUnavailableError);
      assert.equal(error.exitCode, 3);
      assert.match(error.message, /Could not run git/);
      return true;
    });
  });
});

describe('requireChanges', () => {
  const cleanups: (() => Promise<void>)[] = [];

  after(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  });

  it('returns the change set for a repository', async () => {
    const repository = await createGitFixture({ 'a.txt': 'a\n' });
    cleanups.push(repository.cleanup.bind(repository));
    await repository.commit('initial');

    assert.deepEqual((await requireChanges(repository.path)).files, []);
  });

  it('rejects a directory that is not a repository', async () => {
    const fixture = await createFixture();
    cleanups.push(fixture.cleanup.bind(fixture));

    await assert.rejects(requireChanges(fixture.path), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Not a Git repository/);
      return true;
    });
  });
});

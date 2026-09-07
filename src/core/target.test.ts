import assert from 'node:assert/strict';
import { basename, join, resolve, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import { UsageError } from '../utils/errors.js';
import { createFixture, type Fixture } from '../test-helpers/fixtures.js';
import { resolveTarget, resolveTargetPath } from './target.js';

describe('resolveTargetPath', () => {
  // Built through `resolve` so the expectations hold on Windows too.
  const cwd = resolve(sep, 'workspace', 'project');

  it('resolves relative paths against the working directory', () => {
    assert.equal(resolveTargetPath('.', cwd), cwd);
    assert.equal(resolveTargetPath('packages', cwd), join(cwd, 'packages'));
  });

  it('keeps absolute paths untouched', () => {
    assert.equal(resolveTargetPath(cwd, resolve(sep, 'elsewhere')), cwd);
  });
});

describe('resolveTarget', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function fixture(files: Readonly<Record<string, string>> = {}): Promise<string> {
    const created = await createFixture(files);
    fixtures.push(created);
    return created.path;
  }

  it('describes an existing directory', async () => {
    const root = await fixture();

    const target = await resolveTarget('.', root);

    assert.equal(target.path, root);
    assert.equal(target.input, '.');
    assert.equal(target.label, basename(root));
  });

  it('rejects a path that does not exist', async () => {
    const root = await fixture();

    await assert.rejects(resolveTarget('missing', root), (error: unknown) => {
      assert.ok(error instanceof UsageError);
      assert.equal(error.exitCode, 2);
      assert.match(error.message, /Cannot read target path/);
      return true;
    });
  });

  it('rejects a path that is a file', async () => {
    const root = await fixture({ 'package.json': '{}' });

    await assert.rejects(resolveTarget('package.json', root), (error: unknown) => {
      assert.ok(error instanceof UsageError);
      assert.match(error.message, /not a directory/);
      return true;
    });
  });
});

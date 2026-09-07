import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { createFixture, type Fixture } from '../../test-helpers/fixtures.js';
import { scanSources } from './scan.js';

describe('scanSources', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function tree(files: Readonly<Record<string, string>> = {}): Promise<string> {
    const created = await createFixture(files);
    fixtures.push(created);
    return created.path;
  }

  it('finds nothing in an empty directory', async () => {
    const result = await scanSources(await tree());

    assert.deepEqual(result.files, []);
    assert.deepEqual(result.skipped, []);
  });

  it('finds source files in nested directories, sorted by path', async () => {
    const root = await tree({
      'src/b.ts': '',
      'src/a.ts': '',
      'src/deep/nested/c.tsx': '',
      'index.js': '',
    });

    const result = await scanSources(root);

    assert.deepEqual(
      result.files.map((file) => file.path),
      ['index.js', 'src/a.ts', 'src/b.ts', 'src/deep/nested/c.tsx'],
    );
  });

  it('ignores files it cannot read as source', async () => {
    const root = await tree({ 'a.ts': '', 'b.json': '{}', 'c.md': '#', 'd.css': '' });

    const result = await scanSources(root);

    assert.deepEqual(
      result.files.map((file) => file.path),
      ['a.ts'],
    );
  });

  it('skips dependency and build directories', async () => {
    const root = await tree({
      'src/a.ts': '',
      'node_modules/pkg/index.js': '',
      'dist/bundle.js': '',
      'build/out.js': '',
      'coverage/report.js': '',
      '.hidden/secret.ts': '',
    });

    const result = await scanSources(root);

    assert.deepEqual(
      result.files.map((file) => file.path),
      ['src/a.ts'],
    );
  });

  it('reports the size of each file', async () => {
    const root = await tree({ 'a.ts': 'export const a = 1;\n' });

    const result = await scanSources(root);

    assert.equal(result.files[0]?.bytes, 20);
  });

  it('skips a file larger than the limit and says why', async () => {
    const root = await tree({ 'small.ts': 'a', 'large.ts': 'x'.repeat(200) });

    const result = await scanSources(root, { maxFileBytes: 100 });

    assert.deepEqual(
      result.files.map((file) => file.path),
      ['small.ts'],
    );
    const skipped = elementAt(result.skipped);

    assert.equal(skipped.path, 'large.ts');
    assert.match(skipped.reason, /larger than/);
  });

  it('reports absolute paths alongside relative ones', async () => {
    const root = await tree({ 'src/a.ts': '' });

    const result = await scanSources(root);

    const found = elementAt(result.files);

    assert.equal(found.path, 'src/a.ts');
    assert.ok(found.absolutePath.startsWith(root));
  });
});

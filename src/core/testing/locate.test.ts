import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { join } from 'node:path';

import { createFixture, packageJson, type Fixture } from '../../test-helpers/fixtures.js';
import { locateIn, locateRunner } from './locate.js';

describe('locateRunner', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function project(files: Readonly<Record<string, string>> = {}): Promise<string> {
    const created = await createFixture(files);
    fixtures.push(created);
    return created.path;
  }

  it('returns null when the runner is not installed', async () => {
    assert.equal(await locateRunner(await project(), 'vitest'), null);
  });

  it('finds the entry point a package names in an object bin field', async () => {
    const root = await project({
      'node_modules/vitest/package.json': packageJson({
        name: 'vitest',
        version: '3.2.4',
        bin: { vitest: './vitest.mjs' },
      }),
      'node_modules/vitest/vitest.mjs': '',
    });

    const found = await locateRunner(root, 'vitest');
    assert.ok(found !== null);

    assert.equal(found.framework, 'vitest');
    assert.equal(found.version, '3.2.4');
    assert.equal(found.entry, join(root, 'node_modules/vitest/vitest.mjs'));
  });

  it('finds the entry point a package names in a string bin field', async () => {
    const root = await project({
      'node_modules/jest/package.json': packageJson({ name: 'jest', bin: './bin/jest.js' }),
      'node_modules/jest/bin/jest.js': '',
    });

    assert.equal(
      (await locateRunner(root, 'jest'))?.entry,
      join(root, 'node_modules/jest/bin/jest.js'),
    );
  });

  it('reports no version when the package does not declare one', async () => {
    const root = await project({
      'node_modules/vitest/package.json': packageJson({ bin: { vitest: './a.mjs' } }),
      'node_modules/vitest/a.mjs': '',
    });

    assert.equal((await locateRunner(root, 'vitest'))?.version, null);
  });

  it('walks up to a runner installed at the workspace root', async () => {
    const root = await project({
      'node_modules/vitest/package.json': packageJson({ bin: { vitest: './a.mjs' } }),
      'node_modules/vitest/a.mjs': '',
      'packages/api/package.json': packageJson({ name: 'api' }),
    });

    const found = await locateRunner(join(root, 'packages/api'), 'vitest');

    assert.equal(found?.entry, join(root, 'node_modules/vitest/a.mjs'));
  });

  it('ignores a package whose entry point is missing', async () => {
    const root = await project({
      'node_modules/vitest/package.json': packageJson({ bin: { vitest: './gone.mjs' } }),
    });

    assert.equal(await locateRunner(root, 'vitest'), null);
  });

  it('ignores a package with no bin field at all', async () => {
    const root = await project({
      'node_modules/vitest/package.json': packageJson({ main: 'a.js' }),
    });

    assert.equal(await locateRunner(root, 'vitest'), null);
  });
});

describe('locateIn', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  it('returns null for a directory with no manifest', async () => {
    const created = await createFixture();
    fixtures.push(created);

    assert.equal(await locateIn(created.path, 'jest'), null);
  });

  it('returns null for a manifest that will not parse', async () => {
    const created = await createFixture({ 'package.json': '{ not json' });
    fixtures.push(created);

    assert.equal(await locateIn(created.path, 'jest'), null);
  });
});

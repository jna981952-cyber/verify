import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createFixture, packageJson, type Fixture } from '../test-helpers/fixtures.js';
import { readManifest, toManifest } from './manifest.js';

describe('toManifest', () => {
  it('extracts the fields the CLI uses', () => {
    assert.deepEqual(toManifest({ name: 'demo', version: '1.2.3', description: 'A demo.' }), {
      name: 'demo',
      version: '1.2.3',
      description: 'A demo.',
    });
  });

  it('treats missing, empty and non-string fields as absent', () => {
    assert.deepEqual(toManifest({ name: '', version: 42 }), {
      name: null,
      version: null,
      description: null,
    });
  });

  it('rejects values that are not plain objects', () => {
    assert.equal(toManifest(null), null);
    assert.equal(toManifest([1, 2, 3]), null);
    assert.equal(toManifest('nope'), null);
  });
});

describe('readManifest', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function fixture(files: Readonly<Record<string, string>>): Promise<string> {
    const created = await createFixture(files);
    fixtures.push(created);
    return created.path;
  }

  it('reads a package.json from the given directory', async () => {
    const root = await fixture({ 'package.json': packageJson({ name: 'demo', version: '0.1.0' }) });

    assert.deepEqual(await readManifest(root), {
      name: 'demo',
      version: '0.1.0',
      description: null,
    });
  });

  it('returns null when there is no manifest', async () => {
    assert.equal(await readManifest(await fixture({})), null);
  });

  it('returns null when the manifest is not valid JSON', async () => {
    const root = await fixture({ 'package.json': '{ not json' });

    assert.equal(await readManifest(root), null);
  });
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { createFixture, packageJson, type Fixture } from './test-helpers/fixtures.js';
import { TOOL_NAME, VERSION, findNearestManifestPath } from './version.js';

describe('findNearestManifestPath', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  it('walks up from a nested directory to the closest manifest', async () => {
    const created = await createFixture({
      'package.json': packageJson({ name: 'root-package', version: '9.9.9' }),
      'src/deeply/nested/file.txt': 'hello',
    });
    fixtures.push(created);

    const found = findNearestManifestPath(join(created.path, 'src', 'deeply', 'nested'));

    assert.ok(found !== null);
    const contents: unknown = JSON.parse(await readFile(found, 'utf8'));
    assert.equal((contents as { name: string }).name, 'root-package');
  });
});

describe('VERSION', () => {
  it('matches the version declared in the package manifest', async () => {
    const manifestPath = findNearestManifestPath(import.meta.dirname);
    assert.ok(manifestPath !== null);

    const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(VERSION, (manifest as { version: string }).version);
  });

  it('exposes the CLI name used in help output', () => {
    assert.equal(TOOL_NAME, 'verify');
  });
});

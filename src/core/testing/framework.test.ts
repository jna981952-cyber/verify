import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createFixture, packageJson, type Fixture } from '../../test-helpers/fixtures.js';
import { detectFramework } from './framework.js';

describe('detectFramework', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function project(files: Readonly<Record<string, string>> = {}): Promise<string> {
    const created = await createFixture(files);
    fixtures.push(created);
    return created.path;
  }

  it('recognises nothing in an empty directory', async () => {
    assert.equal(await detectFramework(await project()), null);
  });

  it('recognises a runner listed as a dependency', async () => {
    const root = await project({
      'package.json': packageJson({ devDependencies: { vitest: '^3.0.0' } }),
    });

    assert.deepEqual(await detectFramework(root), {
      framework: 'vitest',
      evidence: 'dependency',
      source: 'package.json',
    });
  });

  it('looks in every dependency section', async () => {
    const runtime = await project({
      'package.json': packageJson({ dependencies: { jest: '^29' } }),
    });
    const peer = await project({
      'package.json': packageJson({ peerDependencies: { jest: '^29' } }),
    });

    assert.equal((await detectFramework(runtime))?.framework, 'jest');
    assert.equal((await detectFramework(peer))?.framework, 'jest');
  });

  it('recognises a runner from its config file', async () => {
    const vitest = await project({ 'vitest.config.ts': 'export default {};' });
    const jest = await project({ 'jest.config.js': 'module.exports = {};' });

    assert.deepEqual(await detectFramework(vitest), {
      framework: 'vitest',
      evidence: 'config-file',
      source: 'vitest.config.ts',
    });
    assert.deepEqual(await detectFramework(jest), {
      framework: 'jest',
      evidence: 'config-file',
      source: 'jest.config.js',
    });
  });

  it('recognises Jest configured inside the manifest', async () => {
    const root = await project({
      'package.json': packageJson({ jest: { testEnvironment: 'node' } }),
    });

    assert.deepEqual(await detectFramework(root), {
      framework: 'jest',
      evidence: 'manifest-field',
      source: 'package.json#jest',
    });
  });

  it('prefers a declared dependency over a config file left behind', async () => {
    const root = await project({
      'package.json': packageJson({ devDependencies: { vitest: '^3.0.0' } }),
      'jest.config.js': 'module.exports = {};',
    });

    assert.equal((await detectFramework(root))?.evidence, 'dependency');
  });

  it('prefers Vitest when a project declares both', async () => {
    const root = await project({
      'package.json': packageJson({ devDependencies: { jest: '^29', vitest: '^3' } }),
    });

    assert.equal((await detectFramework(root))?.framework, 'vitest');
  });

  it('reads past a manifest that will not parse', async () => {
    const root = await project({
      'package.json': '{ not json',
      'vitest.config.ts': 'export default {};',
    });

    assert.equal((await detectFramework(root))?.evidence, 'config-file');
  });

  it('recognises nothing from a project that uses neither', async () => {
    const root = await project({
      'package.json': packageJson({ devDependencies: { typescript: '^5' } }),
    });

    assert.equal(await detectFramework(root), null);
  });
});

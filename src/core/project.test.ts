import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { after, describe, it } from 'node:test';

import { createFixture, packageJson, type Fixture } from '../test-helpers/fixtures.js';
import { inspectProject } from './project.js';
import { resolveTarget } from './target.js';

describe('inspectProject', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function inspect(files: Readonly<Record<string, string>> = {}) {
    const created = await createFixture(files);
    fixtures.push(created);
    return {
      root: created.path,
      project: await inspectProject(await resolveTarget('.', created.path)),
    };
  }

  it('falls back to the directory name for a bare directory', async () => {
    const { root, project } = await inspect();

    assert.equal(project.root, root);
    assert.equal(project.name, basename(root));
    assert.equal(project.manifest, null);
    assert.equal(project.packageManager, null);
    assert.equal(project.lockfile, null);
    assert.equal(project.versionControl, null);
    assert.equal(project.typescript, false);
  });

  it('prefers the manifest name over the directory name', async () => {
    const { project } = await inspect({
      'package.json': packageJson({ name: 'demo-package', version: '2.0.0' }),
    });

    assert.equal(project.name, 'demo-package');
    assert.equal(project.manifest?.version, '2.0.0');
  });

  it('detects the package manager from the lockfile', async () => {
    const { project } = await inspect({ 'pnpm-lock.yaml': 'lockfileVersion: 9.0\n' });

    assert.equal(project.packageManager, 'pnpm');
    assert.equal(project.lockfile, 'pnpm-lock.yaml');
  });

  it('resolves competing lockfiles deterministically', async () => {
    const { project } = await inspect({ 'yarn.lock': '', 'package-lock.json': '{}' });

    assert.equal(project.packageManager, 'npm');
    assert.equal(project.lockfile, 'package-lock.json');
  });

  it('detects git and TypeScript', async () => {
    const { project } = await inspect({
      '.git/HEAD': 'ref: refs/heads/main\n',
      'tsconfig.json': '{}',
    });

    assert.equal(project.versionControl, 'git');
    assert.equal(project.typescript, true);
  });
});

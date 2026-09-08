import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { elementAt } from '../../test-helpers/assert.js';
import { createFixture, packageJson, type Fixture } from '../../test-helpers/fixtures.js';
import { analyzeCodebase } from '../analysis/analyze.js';
import { collectTestFiles, countTests, discoverTests } from './discover.js';

const SUITE = [
  "describe('cart', () => {",
  "  it('adds', () => {});",
  "  it('subtracts', () => {});",
  '});',
  '',
].join('\n');

describe('collectTestFiles', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function analyse(files: Readonly<Record<string, string>>) {
    const created = await createFixture(files);
    fixtures.push(created);
    return analyzeCodebase(created.path);
  }

  it('finds nothing in a project with no tests', async () => {
    assert.deepEqual(collectTestFiles(await analyse({ 'src/a.ts': 'export const a = 1;\n' })), []);
  });

  it('finds files following the naming conventions', async () => {
    const analysis = await analyse({
      'src/a.test.ts': SUITE,
      'src/b.spec.js': "it('works', () => {});\n",
      'src/__tests__/c.ts': "it('works', () => {});\n",
      'src/d.ts': 'export const d = 1;\n',
    });

    assert.deepEqual(
      collectTestFiles(analysis).map((file) => file.path),
      ['src/__tests__/c.ts', 'src/a.test.ts', 'src/b.spec.js'],
    );
  });

  it('reads the declarations of each file', async () => {
    const analysis = await analyse({ 'src/a.test.ts': SUITE });
    const file = elementAt(collectTestFiles(analysis));

    assert.deepEqual(
      file.tests.map((test) => `${test.suite ? 'suite' : 'case'} ${test.title}`),
      ['suite cart', 'case adds', 'case subtracts'],
    );
    assert.equal(elementAt(file.tests).line, 1);
  });

  it('leaves a test with a computed title out, having no name to run', async () => {
    const analysis = await analyse({
      'src/a.test.ts': "it(name, () => {});\nit('real', () => {});\n",
    });

    assert.deepEqual(
      elementAt(collectTestFiles(analysis)).tests.map((test) => test.title),
      ['real'],
    );
  });

  it('accepts a test file with no tests in it', async () => {
    const analysis = await analyse({ 'src/a.test.ts': 'export const nothing = 1;\n' });

    assert.deepEqual(elementAt(collectTestFiles(analysis)).tests, []);
  });
});

describe('countTests', () => {
  it('counts cases and leaves suites out', () => {
    assert.equal(
      countTests([
        {
          path: 'a.test.ts',
          tests: [
            { title: 'cart', suite: true, line: 1 },
            { title: 'adds', suite: false, line: 2 },
            { title: 'subtracts', suite: false, line: 3 },
          ],
        },
        { path: 'b.test.ts', tests: [{ title: 'works', suite: false, line: 1 }] },
      ]),
      3,
    );
  });

  it('counts nothing for no files', () => {
    assert.equal(countTests([]), 0);
  });
});

describe('discoverTests', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function project(files: Readonly<Record<string, string>>): Promise<string> {
    const created = await createFixture(files);
    fixtures.push(created);
    return created.path;
  }

  it('reports the runner and the files together', async () => {
    const root = await project({
      'package.json': packageJson({ devDependencies: { vitest: '^3' } }),
      'src/a.test.ts': SUITE,
    });

    const discovery = await discoverTests(root, await analyzeCodebase(root));

    assert.equal(discovery.detection?.framework, 'vitest');
    assert.equal(discovery.runner, null);
    assert.deepEqual(
      discovery.files.map((file) => file.path),
      ['src/a.test.ts'],
    );
    assert.equal(discovery.tests, 2);
  });

  it('reports tests even when no runner was recognised', async () => {
    const root = await project({ 'src/a.test.ts': SUITE });

    const discovery = await discoverTests(root, await analyzeCodebase(root));

    assert.equal(discovery.detection, null);
    assert.equal(discovery.tests, 2);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join, resolve, sep } from 'node:path';

import { elementAt } from '../../test-helpers/assert.js';
import { runnerResults } from '../../test-helpers/runner.js';
import { parseRunnerOutput, summarise, toFailure, toProjectPath } from './parse.js';

const ROOT = resolve(sep, 'workspace', 'demo');

function parse(payload: unknown): ReturnType<typeof parseRunnerOutput> {
  return parseRunnerOutput(ROOT, payload);
}

describe('toProjectPath', () => {
  it('makes an absolute path relative to the project', () => {
    assert.equal(toProjectPath(ROOT, join(ROOT, 'src', 'a.test.ts')), 'src/a.test.ts');
  });

  it('leaves a relative path alone', () => {
    assert.equal(toProjectPath(ROOT, 'src/a.test.ts'), 'src/a.test.ts');
  });
});

describe('toFailure', () => {
  it('takes the first meaningful line as the message', () => {
    const failure = toFailure('\nAssertionError: expected 1 to be 2\n    at a.ts:1:1');

    assert.equal(failure.message, 'AssertionError: expected 1 to be 2');
    assert.match(failure.detail, /at a\.ts:1:1/);
  });

  it('keeps the whole text as the detail', () => {
    assert.equal(toFailure('boom').detail, 'boom');
  });
});

describe('parseRunnerOutput', () => {
  it('rejects a payload that is not a run', () => {
    assert.equal(parse(null), null);
    assert.equal(parse('nope'), null);
    assert.equal(parse({}), null);
    assert.equal(parse({ testResults: 'nope' }), null);
  });

  it('accepts a run with no files', () => {
    assert.deepEqual(parse({ testResults: [] }), []);
  });

  it('reads a file and the tests it reported', () => {
    const files = parse(
      runnerResults([
        {
          name: join(ROOT, 'src', 'cart.test.ts'),
          startTime: 100,
          endTime: 1520,
          tests: [
            { title: 'adds', status: 'passed', ancestorTitles: ['cart'], duration: 3 },
            {
              title: 'subtracts',
              status: 'failed',
              ancestorTitles: ['cart'],
              duration: 5,
              failureMessages: ['AssertionError: expected 1 to be 2\n    at cart.ts:4:2'],
            },
          ],
        },
      ]),
    );

    const file = elementAt(files ?? []);

    assert.equal(file.path, 'src/cart.test.ts');
    assert.equal(file.status, 'failed');
    assert.equal(file.durationMs, 1420);
    assert.deepEqual(
      file.tests.map((test) => `${test.name}:${test.status}`),
      ['cart > adds:passed', 'cart > subtracts:failed'],
    );
    assert.equal(
      elementAt(file.tests, 1).failures[0]?.message,
      'AssertionError: expected 1 to be 2',
    );
  });

  it('maps every status a runner may report', () => {
    const files = parse({
      testResults: [
        {
          name: join(ROOT, 'a.test.ts'),
          assertionResults: [
            { title: 'a', status: 'passed' },
            { title: 'b', status: 'failed' },
            { title: 'c', status: 'pending' },
            { title: 'd', status: 'skipped' },
            { title: 'e', status: 'todo' },
            { title: 'f', status: 'something-new' },
          ],
        },
      ],
    });

    assert.deepEqual(
      elementAt(files ?? []).tests.map((test) => test.status),
      ['passed', 'failed', 'skipped', 'skipped', 'todo', 'skipped'],
    );
  });

  it('builds a full name when the runner gave none', () => {
    const files = parse({
      testResults: [
        {
          name: join(ROOT, 'a.test.ts'),
          assertionResults: [
            { title: 'adds', status: 'passed', ancestorTitles: ['cart', 'totals'] },
          ],
        },
      ],
    });

    assert.equal(elementAt(elementAt(files ?? []).tests).name, 'cart > totals > adds');
  });

  it('reports an unknown duration as null', () => {
    const files = parse({
      testResults: [
        { name: join(ROOT, 'a.test.ts'), assertionResults: [{ title: 'a', status: 'passed' }] },
      ],
    });

    assert.equal(elementAt(files ?? []).durationMs, null);
    assert.equal(elementAt(elementAt(files ?? []).tests).durationMs, null);
  });

  it('keeps a file-level message, such as an import that threw', () => {
    const files = parse({
      testResults: [
        {
          name: join(ROOT, 'a.test.ts'),
          message: 'Cannot find module ./gone.js',
          assertionResults: [],
        },
      ],
    });

    assert.equal(elementAt(files ?? []).message, 'Cannot find module ./gone.js');
  });

  it('skips entries it cannot make sense of instead of failing', () => {
    const files = parse({
      testResults: [
        'nonsense',
        { assertionResults: [] },
        { name: join(ROOT, 'a.test.ts'), assertionResults: ['nonsense', { status: 'passed' }] },
      ],
    });

    assert.deepEqual(
      (files ?? []).map((file) => file.path),
      ['a.test.ts'],
    );
    assert.deepEqual(elementAt(files ?? []).tests, []);
  });

  it('sorts the files by path', () => {
    const files = parse({
      testResults: [
        { name: join(ROOT, 'b.test.ts'), assertionResults: [] },
        { name: join(ROOT, 'a.test.ts'), assertionResults: [] },
      ],
    });

    assert.deepEqual(
      (files ?? []).map((file) => file.path),
      ['a.test.ts', 'b.test.ts'],
    );
  });
});

describe('summarise', () => {
  it('counts nothing for no files', () => {
    assert.deepEqual(summarise([]), {
      files: 0,
      tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      todo: 0,
    });
  });

  it('counts every test by status', () => {
    const files = parse({
      testResults: [
        {
          name: join(ROOT, 'a.test.ts'),
          assertionResults: [
            { title: 'a', status: 'passed' },
            { title: 'b', status: 'failed' },
            { title: 'c', status: 'pending' },
            { title: 'd', status: 'todo' },
          ],
        },
        { name: join(ROOT, 'b.test.ts'), assertionResults: [{ title: 'e', status: 'passed' }] },
      ],
    });

    assert.deepEqual(summarise(files ?? []), {
      files: 2,
      tests: 5,
      passed: 2,
      failed: 1,
      skipped: 1,
      todo: 1,
    });
  });
});

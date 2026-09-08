import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UsageError } from '../utils/errors.js';
import { DEFAULT_TARGET, parseCliArgs } from './args.js';

describe('parseCliArgs', () => {
  it('defaults to inspecting the working directory without colour overrides', () => {
    assert.deepEqual(parseCliArgs([]), {
      mode: 'inspect',
      target: DEFAULT_TARGET,
      json: false,
      noColor: false,
      depth: null,
      impacted: false,
      test: null,
      timeout: null,
      list: false,
    });
  });

  it('reads the target from the first positional argument', () => {
    assert.equal(parseCliArgs(['./packages/api']).target, './packages/api');
  });

  it('supports long and short help flags', () => {
    assert.equal(parseCliArgs(['--help']).mode, 'help');
    assert.equal(parseCliArgs(['-h']).mode, 'help');
  });

  it('supports long and short version flags', () => {
    assert.equal(parseCliArgs(['--version']).mode, 'version');
    assert.equal(parseCliArgs(['-v']).mode, 'version');
  });

  it('prefers help when both help and version are requested', () => {
    assert.equal(parseCliArgs(['--version', '--help']).mode, 'help');
  });

  it('reads output flags alongside a target', () => {
    const args = parseCliArgs(['.', '--json', '--no-color']);

    assert.equal(args.target, '.');
    assert.equal(args.json, true);
    assert.equal(args.noColor, true);
  });

  it('rejects unknown options', () => {
    assert.throws(() => parseCliArgs(['--nope']), UsageError);
  });

  it('rejects more than one target', () => {
    assert.throws(
      () => parseCliArgs(['one', 'two']),
      (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.equal(error.exitCode, 2);
        assert.match(error.message, /at most one path/);
        return true;
      },
    );
  });

  it('rejects a blank target', () => {
    assert.throws(() => parseCliArgs(['   ']), UsageError);
  });

  it('recognises the changes command', () => {
    assert.deepEqual(parseCliArgs(['changes']), {
      mode: 'changes',
      target: DEFAULT_TARGET,
      json: false,
      noColor: false,
      depth: null,
      impacted: false,
      test: null,
      timeout: null,
      list: false,
    });
  });

  it('reads a path and flags after the changes command', () => {
    const args = parseCliArgs(['changes', './packages/api', '--json']);

    assert.equal(args.mode, 'changes');
    assert.equal(args.target, './packages/api');
    assert.equal(args.json, true);
  });

  it('still treats a leading path as the inspection target', () => {
    const args = parseCliArgs(['.']);

    assert.equal(args.mode, 'inspect');
    assert.equal(args.target, '.');
  });

  it('lets help and version win over a command', () => {
    assert.equal(parseCliArgs(['changes', '--help']).mode, 'help');
    assert.equal(parseCliArgs(['changes', '--version']).mode, 'version');
  });

  it('treats a spelled-out path as a path even when it names a command', () => {
    const args = parseCliArgs(['./changes']);

    assert.equal(args.mode, 'inspect');
    assert.equal(args.target, './changes');
  });

  it('rejects more than one path after a command', () => {
    assert.throws(
      () => parseCliArgs(['changes', 'one', 'two']),
      (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /at most one path for `changes`/);
        return true;
      },
    );
  });

  it('rejects an unknown command as a second path', () => {
    assert.throws(() => parseCliArgs(['.', 'nonsense']), UsageError);
  });

  it('recognises the analyze command', () => {
    assert.deepEqual(parseCliArgs(['analyze']), {
      mode: 'analyze',
      target: DEFAULT_TARGET,
      json: false,
      noColor: false,
      depth: null,
      impacted: false,
      test: null,
      timeout: null,
      list: false,
    });
  });

  it('reads a path and flags after the analyze command', () => {
    const args = parseCliArgs(['analyze', './src', '--json']);

    assert.equal(args.mode, 'analyze');
    assert.equal(args.target, './src');
    assert.equal(args.json, true);
  });

  it('recognises the impact command', () => {
    assert.deepEqual(parseCliArgs(['impact']), {
      mode: 'impact',
      target: DEFAULT_TARGET,
      json: false,
      noColor: false,
      depth: null,
      impacted: false,
      test: null,
      timeout: null,
      list: false,
    });
  });

  it('reads the depth option', () => {
    assert.equal(parseCliArgs(['impact', '--depth', '1']).depth, 1);
    assert.equal(parseCliArgs(['impact', '--depth', '0']).depth, 0);
  });

  it('rejects a depth that is not a whole number of hops', () => {
    for (const value of ['x', '1.5', '', '0x2', ' 1']) {
      assert.throws(
        () => parseCliArgs(['impact', '--depth', value]),
        (error: unknown) => {
          assert.ok(error instanceof UsageError);
          assert.match(error.message, /--depth must be a whole number/);
          return true;
        },
        `--depth ${value} should be rejected`,
      );
    }
  });

  it('rejects a negative depth in either spelling', () => {
    // `--depth -1` is rejected by the argument parser itself, which reads the
    // leading dash as another option; `--depth=-1` reaches the depth check.
    assert.throws(() => parseCliArgs(['impact', '--depth', '-1']), UsageError);
    assert.throws(() => parseCliArgs(['impact', '--depth=-1']), UsageError);
  });

  it('leaves the depth unset when it is not given', () => {
    assert.equal(parseCliArgs(['.']).depth, null);
  });

  it('recognises the tests command', () => {
    assert.equal(parseCliArgs(['tests']).mode, 'tests');
    assert.equal(parseCliArgs(['tests', './packages/api']).target, './packages/api');
  });

  it('reads the options the tests command accepts', () => {
    const args = parseCliArgs([
      'tests',
      '--impacted',
      '--test',
      'adds items',
      '--timeout',
      '5000',
      '--list',
    ]);

    assert.equal(args.impacted, true);
    assert.equal(args.test, 'adds items');
    assert.equal(args.timeout, 5000);
    assert.equal(args.list, true);
  });

  it('leaves the test options unset when they are not given', () => {
    const args = parseCliArgs(['tests']);

    assert.equal(args.impacted, false);
    assert.equal(args.test, null);
    assert.equal(args.timeout, null);
    assert.equal(args.list, false);
  });

  it('rejects a timeout that is not a positive number of milliseconds', () => {
    for (const value of ['0', 'x', '1.5', '', '1e3']) {
      assert.throws(
        () => parseCliArgs(['tests', '--timeout', value]),
        (error: unknown) => {
          assert.ok(error instanceof UsageError);
          assert.match(error.message, /--timeout must be a positive number/);
          return true;
        },
        `--timeout ${value} should be rejected`,
      );
    }
  });

  it('accepts a test name that looks like a flag when spelled out', () => {
    assert.equal(parseCliArgs(['tests', '--test=--weird']).test, '--weird');
  });

  it('rejects more than one path after analyze', () => {
    assert.throws(
      () => parseCliArgs(['analyze', 'one', 'two']),
      (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /at most one path for `analyze`/);
        return true;
      },
    );
  });
});

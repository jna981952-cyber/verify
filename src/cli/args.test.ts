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
    });
  });

  it('reads a path and flags after the analyze command', () => {
    const args = parseCliArgs(['analyze', './src', '--json']);

    assert.equal(args.mode, 'analyze');
    assert.equal(args.target, './src');
    assert.equal(args.json, true);
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

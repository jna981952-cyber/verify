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
});

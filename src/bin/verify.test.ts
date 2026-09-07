import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { findNearestManifestPath } from '../version.js';

const manifestPath = findNearestManifestPath(import.meta.dirname);
const projectRoot = manifestPath === null ? null : dirname(manifestPath);
const binPath = projectRoot === null ? null : join(projectRoot, 'dist', 'bin', 'verify.js');

/**
 * The executable is only present after `npm run build`, so these end-to-end
 * checks skip rather than fail when the package has not been built yet.
 */
const skip =
  binPath !== null && existsSync(binPath) ? false : 'run `npm run build` to exercise the binary';

function runBinary(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [binPath ?? '', ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });

  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('verify executable', () => {
  it('prints help and exits zero', { skip }, () => {
    const result = runBinary(['--help']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage/);
  });

  it('inspects a directory passed as "."', { skip }, () => {
    const result = runBinary(['.']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Target/);
  });

  it('exits with the usage code for a bad path', { skip }, () => {
    const result = runBinary(['./definitely-not-here']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Cannot read target path/);
  });
});

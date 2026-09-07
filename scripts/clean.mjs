/**
 * Removes generated output directories so builds and test runs always start clean.
 * Written in plain ESM to keep the toolchain free of extra dependencies.
 */
import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedDirectories = ['dist', 'test-build', 'coverage'];

for (const directory of generatedDirectories) {
  rmSync(join(projectRoot, directory), { recursive: true, force: true });
}

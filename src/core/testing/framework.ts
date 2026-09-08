import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { pathExists } from '../../utils/fs.js';
import { TEST_FRAMEWORKS, type FrameworkDetection, type TestFramework } from './types.js';

/** Config file names that identify each runner, in the order they are tried. */
const CONFIG_FILES: Readonly<Record<TestFramework, readonly string[]>> = {
  vitest: [
    'vitest.config.ts',
    'vitest.config.mts',
    'vitest.config.cts',
    'vitest.config.js',
    'vitest.config.mjs',
    'vitest.config.cjs',
    'vitest.workspace.ts',
    'vitest.workspace.js',
  ],
  jest: [
    'jest.config.ts',
    'jest.config.mts',
    'jest.config.cts',
    'jest.config.js',
    'jest.config.mjs',
    'jest.config.cjs',
    'jest.config.json',
  ],
};

/** Manifest keys a runner may be configured under. */
const MANIFEST_FIELDS: Readonly<Record<TestFramework, string | null>> = {
  vitest: null,
  jest: 'jest',
};

/** Reads a project's manifest, returning `null` for anything unreadable. */
async function readPackageJson(root: string): Promise<Record<string, unknown> | null> {
  let contents: string;
  try {
    contents = await readFile(join(root, 'package.json'), 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(contents);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // A manifest that will not parse is not a reason to fail; it simply says
    // nothing about which runner the project uses.
    return null;
  }
}

/** True when the manifest lists the package under any dependency field. */
function isDependency(manifest: Record<string, unknown>, name: string): boolean {
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const section = manifest[field];
    if (typeof section === 'object' && section !== null && name in section) {
      return true;
    }
  }
  return false;
}

async function findConfigFile(root: string, framework: TestFramework): Promise<string | null> {
  for (const name of CONFIG_FILES[framework]) {
    if (await pathExists(join(root, name))) {
      return name;
    }
  }
  return null;
}

/**
 * Works out which test runner a project uses.
 *
 * A declared dependency is the strongest signal and is checked first, then a
 * config file, then a section in the manifest. Vitest is preferred over Jest
 * when both appear, because a project migrating between them keeps the old
 * config around long after it has stopped being used.
 *
 * Returns `null` when nothing said which runner to use; that is a fact about
 * the project rather than an error.
 */
export async function detectFramework(root: string): Promise<FrameworkDetection | null> {
  const manifest = await readPackageJson(root);

  if (manifest !== null) {
    for (const framework of TEST_FRAMEWORKS) {
      if (isDependency(manifest, framework)) {
        return { framework, evidence: 'dependency', source: 'package.json' };
      }
    }
  }

  for (const framework of TEST_FRAMEWORKS) {
    const config = await findConfigFile(root, framework);
    if (config !== null) {
      return { framework, evidence: 'config-file', source: config };
    }
  }

  if (manifest !== null) {
    for (const framework of TEST_FRAMEWORKS) {
      const field = MANIFEST_FIELDS[framework];
      if (field !== null && field in manifest) {
        return { framework, evidence: 'manifest-field', source: `package.json#${field}` };
      }
    }
  }

  return null;
}

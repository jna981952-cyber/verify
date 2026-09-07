import { join } from 'node:path';

import { pathExists } from '../utils/fs.js';
import { type Manifest, readManifest } from './manifest.js';
import { type Target } from './target.js';

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

interface LockfileSignature {
  readonly lockfile: string;
  readonly packageManager: PackageManager;
}

/**
 * Lockfiles that identify a package manager, in priority order.
 *
 * The first match wins, which keeps the result deterministic in repositories
 * that carry more than one lockfile.
 */
const LOCKFILE_SIGNATURES: readonly LockfileSignature[] = [
  { lockfile: 'package-lock.json', packageManager: 'npm' },
  { lockfile: 'npm-shrinkwrap.json', packageManager: 'npm' },
  { lockfile: 'pnpm-lock.yaml', packageManager: 'pnpm' },
  { lockfile: 'yarn.lock', packageManager: 'yarn' },
  { lockfile: 'bun.lock', packageManager: 'bun' },
  { lockfile: 'bun.lockb', packageManager: 'bun' },
];

/** Everything the CLI currently knows about the directory it was pointed at. */
export interface ProjectInfo {
  /** Absolute path to the inspected directory. */
  readonly root: string;
  /** Display name: the manifest name when present, otherwise the directory name. */
  readonly name: string;
  /** Parsed `package.json`, or `null` when the directory is not an npm package. */
  readonly manifest: Manifest | null;
  /** Package manager inferred from the lockfile, or `null` when none was found. */
  readonly packageManager: PackageManager | null;
  /** Name of the lockfile that produced {@link packageManager}. */
  readonly lockfile: string | null;
  /** Version control system detected in the directory. */
  readonly versionControl: 'git' | null;
  /** Whether a `tsconfig.json` sits at the root of the directory. */
  readonly typescript: boolean;
}

async function detectLockfile(root: string): Promise<LockfileSignature | null> {
  for (const signature of LOCKFILE_SIGNATURES) {
    if (await pathExists(join(root, signature.lockfile))) {
      return signature;
    }
  }
  return null;
}

/**
 * Gathers the baseline facts about a target directory.
 *
 * This is deliberately shallow: it reads the root of the directory only and
 * never executes anything it finds there.
 */
export async function inspectProject(target: Target): Promise<ProjectInfo> {
  const { path: root } = target;

  const [manifest, lockfileSignature, hasGit, typescript] = await Promise.all([
    readManifest(root),
    detectLockfile(root),
    pathExists(join(root, '.git')),
    pathExists(join(root, 'tsconfig.json')),
  ]);

  return {
    root,
    name: manifest?.name ?? target.label,
    manifest,
    packageManager: lockfileSignature?.packageManager ?? null,
    lockfile: lockfileSignature?.lockfile ?? null,
    versionControl: hasGit ? 'git' : null,
    typescript,
  };
}

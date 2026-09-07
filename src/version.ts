import { readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toManifest } from './core/manifest.js';

/** Reported when the CLI's own manifest cannot be located (e.g. an odd bundle). */
export const UNKNOWN_VERSION = '0.0.0-unknown';

/** Human readable name of the tool, used in help output and reports. */
export const TOOL_NAME = 'verify';

/**
 * Walks up from `startDirectory` looking for the nearest `package.json`.
 *
 * Searching rather than hard-coding a relative path keeps the lookup correct
 * whatever the compiled layout of the module happens to be.
 */
export function findNearestManifestPath(startDirectory: string): string | null {
  const { root } = parse(startDirectory);
  let directory = startDirectory;

  for (;;) {
    const candidate = join(directory, 'package.json');
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      if (directory === root) {
        return null;
      }
      directory = dirname(directory);
    }
  }
}

function readOwnVersion(): string {
  const manifestPath = findNearestManifestPath(dirname(fileURLToPath(import.meta.url)));
  if (manifestPath === null) {
    return UNKNOWN_VERSION;
  }

  try {
    const manifest = toManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
    return manifest?.version ?? UNKNOWN_VERSION;
  } catch {
    return UNKNOWN_VERSION;
  }
}

/** The version of this package, read from its own `package.json`. */
export const VERSION: string = readOwnVersion();

import { stat } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';

import { UsageError } from '../utils/errors.js';

/** A validated directory that the CLI has been pointed at. */
export interface Target {
  /** Absolute path to the directory. */
  readonly path: string;
  /** The path exactly as the user typed it. */
  readonly input: string;
  /** Directory name, used as a display label. */
  readonly label: string;
}

/** Expands a user supplied path against the working directory. */
export function resolveTargetPath(input: string, cwd: string): string {
  return isAbsolute(input) ? resolve(input) : resolve(cwd, input);
}

/**
 * Resolves and validates the directory the CLI should operate on.
 *
 * @throws {UsageError} If the path does not exist or is not a directory.
 */
export async function resolveTarget(input: string, cwd: string): Promise<Target> {
  const path = resolveTargetPath(input, cwd);

  let stats;
  try {
    stats = await stat(path);
  } catch (cause) {
    throw new UsageError(`Cannot read target path: ${path}`, { cause });
  }

  if (!stats.isDirectory()) {
    throw new UsageError(`Target path is not a directory: ${path}`);
  }

  return { path, input, label: basename(path) || path };
}

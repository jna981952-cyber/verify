import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { isSourcePath } from './parser.js';
import { type SkippedFile } from './types.js';

/**
 * Directories the analyser never descends into.
 *
 * Dependencies and build output would double-count every symbol they mirror,
 * and neither is source anybody is about to change.
 */
export const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'bower_components',
  'tmp',
]);

/** Largest file the analyser will read, in bytes. */
export const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Overrides accepted by {@link scanSources}. */
export interface ScanOptions {
  /** Files larger than this are skipped instead of read. */
  readonly maxFileBytes?: number;
}

/** A source file found on disk. */
export interface ScannedFile {
  /** Path relative to the scanned root, using forward slashes. */
  readonly path: string;
  /** Absolute path on disk. */
  readonly absolutePath: string;
  readonly bytes: number;
}

/** What a scan turned up. */
export interface ScanResult {
  readonly files: readonly ScannedFile[];
  readonly skipped: readonly SkippedFile[];
}

/** Rewrites a platform path as the forward-slash form used throughout. */
export function toPosixPath(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

function describeSize(bytes: number): string {
  return `file is larger than ${String(Math.round(bytes / 1024))} KiB`;
}

/** Orders paths by code unit so a scan does not depend on directory order. */
function byPath(left: { path: string }, right: { path: string }): number {
  if (left.path === right.path) {
    return 0;
  }
  return left.path < right.path ? -1 : 1;
}

/**
 * Finds every source file under a directory.
 *
 * Hidden directories and the ignored list are skipped outright; entries that
 * are neither a plain file nor a directory — symlinks among them — are passed
 * over, which is also what keeps a linked cycle from being walked forever.
 */
export async function scanSources(root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const files: ScannedFile[] = [];
  const skipped: SkippedFile[] = [];

  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      skipped.push({
        path: toPosixPath(relative(root, directory)),
        reason: 'directory is unreadable',
      });
      return;
    }

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !IGNORED_DIRECTORIES.has(entry.name)) {
          await visit(absolutePath);
        }
        continue;
      }

      if (!entry.isFile() || !isSourcePath(entry.name)) {
        continue;
      }

      const path = toPosixPath(relative(root, absolutePath));
      let bytes: number;
      try {
        bytes = (await stat(absolutePath)).size;
      } catch {
        skipped.push({ path, reason: 'file is unreadable' });
        continue;
      }

      if (bytes > maxFileBytes) {
        skipped.push({ path, reason: describeSize(maxFileBytes) });
        continue;
      }

      files.push({ path, absolutePath, bytes });
    }
  }

  await visit(root);

  return { files: files.sort(byPath), skipped: skipped.sort(byPath) };
}

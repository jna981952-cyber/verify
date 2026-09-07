import { type ChangeKind, type ChangeScope } from './types.js';
import { expectSuccess, type GitRunner } from './runner.js';

/** One record of `git status --porcelain=v2`, decoded but not yet enriched. */
export interface StatusEntry {
  /** Path relative to the repository root. */
  readonly path: string;
  /** Path the file had before a rename or copy, `null` otherwise. */
  readonly previousPath: string | null;
  readonly kind: ChangeKind;
  readonly scope: ChangeScope;
  /** Similarity score git assigned to a rename or copy, 0-100, or `null`. */
  readonly similarity: number | null;
}

/**
 * Fields preceding the path in each porcelain v2 record type.
 *
 * Paths may contain spaces, so the leading fields are counted rather than the
 * record being split wholesale.
 */
const FIELD_COUNTS = { ordinary: 7, rename: 8, unmerged: 9 } as const;

/** Splits `text` into `count` space-separated fields plus the remainder. */
function splitFields(text: string, count: number): readonly string[] | null {
  const fields: string[] = [];
  let rest = text;

  for (let index = 0; index < count; index += 1) {
    const separator = rest.indexOf(' ');
    if (separator === -1) {
      return null;
    }
    fields.push(rest.slice(0, separator));
    rest = rest.slice(separator + 1);
  }

  fields.push(rest);
  return fields;
}

/**
 * Maps a porcelain status letter to a change kind.
 *
 * A copy becomes `added`: the new path did not exist before, and the source is
 * still reported through {@link StatusEntry.previousPath}.
 */
function toKind(letter: string): ChangeKind {
  switch (letter) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'added';
    // `T` is a type change (file to symlink and such), which is a content
    // change as far as everything downstream is concerned.
    default:
      return 'modified';
  }
}

/**
 * Derives the kind and scope from the two-letter `XY` status code.
 *
 * `X` describes the index and `Y` the working tree; `.` means unchanged. The
 * index takes precedence when both moved, because it describes the change
 * relative to the last commit, which is the question being asked.
 */
function readStatusCode(code: string): { kind: ChangeKind; scope: ChangeScope } {
  const staged = code[0] ?? '.';
  const unstaged = code[1] ?? '.';
  const stagedChanged = staged !== '.';
  const unstagedChanged = unstaged !== '.';

  let scope: ChangeScope = 'unstaged';
  if (stagedChanged && unstagedChanged) {
    scope = 'both';
  } else if (stagedChanged) {
    scope = 'staged';
  }

  return { kind: toKind(stagedChanged ? staged : unstaged), scope };
}

/** Reads the numeric part of a rename or copy score such as `R100`. */
function readSimilarity(score: string): number | null {
  const parsed = Number.parseInt(score.slice(1), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Decodes the NUL-separated output of `git status --porcelain=v2 -z`.
 *
 * Records this parser does not model — ignored files, submodule headers — are
 * skipped rather than treated as failures, so a newer git printing something
 * unexpected degrades quietly instead of breaking the command.
 */
export function parseStatus(stdout: string): readonly StatusEntry[] {
  const chunks = stdout.split('\0');
  const entries: StatusEntry[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index] ?? '';
    if (chunk === '') {
      continue;
    }

    const marker = chunk[0];
    const body = chunk.slice(2);

    if (marker === '?') {
      entries.push({
        path: body,
        previousPath: null,
        kind: 'untracked',
        scope: 'unstaged',
        similarity: null,
      });
      continue;
    }

    if (marker === '1') {
      const fields = splitFields(body, FIELD_COUNTS.ordinary);
      if (fields === null) {
        continue;
      }
      const { kind, scope } = readStatusCode(fields[0] ?? '');
      entries.push({
        path: fields[FIELD_COUNTS.ordinary] ?? '',
        previousPath: null,
        kind,
        scope,
        similarity: null,
      });
      continue;
    }

    if (marker === '2') {
      const fields = splitFields(body, FIELD_COUNTS.rename);
      if (fields === null) {
        continue;
      }
      // The original path follows the record as a separate NUL-terminated chunk.
      const previousPath = chunks[index + 1] ?? '';
      index += 1;

      const { kind, scope } = readStatusCode(fields[0] ?? '');
      entries.push({
        path: fields[FIELD_COUNTS.rename] ?? '',
        previousPath: previousPath === '' ? null : previousPath,
        kind,
        scope,
        similarity: readSimilarity(fields[FIELD_COUNTS.rename - 1] ?? ''),
      });
      continue;
    }

    if (marker === 'u') {
      const fields = splitFields(body, FIELD_COUNTS.unmerged);
      if (fields === null) {
        continue;
      }
      entries.push({
        path: fields[FIELD_COUNTS.unmerged] ?? '',
        previousPath: null,
        kind: 'unmerged',
        scope: 'both',
        similarity: null,
      });
    }
  }

  return entries;
}

/**
 * Asks git for the state of every tracked and untracked path.
 *
 * Rename detection is requested explicitly so the result does not depend on
 * whatever `status.renames` happens to be set to in the user's config.
 *
 * @throws {GitCommandError} If git could not report the status.
 * @throws {GitUnavailableError} If `git` cannot be executed.
 */
export async function readStatus(root: string, runner: GitRunner): Promise<readonly StatusEntry[]> {
  const result = await runner(
    ['-c', 'status.renames=true', 'status', '--porcelain=v2', '-z', '--untracked-files=all'],
    { cwd: root },
  );

  return parseStatus(expectSuccess('status', result));
}

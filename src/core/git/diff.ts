import { type DiffHunk, type DiffStats } from './types.js';
import { expectSuccess, type GitRunner } from './runner.js';

/** Diff detail for a single path. */
export interface DiffFile {
  /** Path relative to the repository root. */
  readonly path: string;
  /** Path before a rename or copy, `null` otherwise. */
  readonly previousPath: string | null;
  /** True when git could not produce a textual diff for the content. */
  readonly binary: boolean;
  readonly hunks: readonly DiffHunk[];
  readonly stats: DiffStats;
}

/** Totals and paths taken from one `--numstat` record. */
interface NumstatEntry {
  readonly path: string;
  readonly previousPath: string | null;
  readonly binary: boolean;
}

/**
 * Empty tree object for each hash algorithm git supports.
 *
 * Diffing against it is how a repository with no commits yet gets a diff at
 * all: there is no `HEAD` to compare with.
 */
const EMPTY_TREE: Readonly<Record<string, string>> = {
  sha1: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
  sha256: '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321',
};

/** Marks the start of a file's section within a patch. */
const FILE_HEADER = 'diff --git ';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: (.*))?$/;

const NUMSTAT_RECORD = /^(\d+|-)\t(\d+|-)\t(.*)$/s;

/**
 * Zero context is requested from git, so each hunk covers changed lines only.
 *
 * That makes the reported ranges exactly the lines that moved, which is what
 * every consumer of {@link DiffHunk} actually wants.
 */
const CONTEXT_LINES = '-U0';

/** Decodes the NUL-separated output of `git diff --numstat -z`. */
export function parseNumstat(stdout: string): readonly NumstatEntry[] {
  const chunks = stdout.split('\0');
  const entries: NumstatEntry[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index] ?? '';
    if (chunk === '') {
      continue;
    }

    const match = NUMSTAT_RECORD.exec(chunk);
    if (match === null) {
      continue;
    }

    const binary = match[1] === '-' && match[2] === '-';
    const inlinePath = match[3] ?? '';

    if (inlinePath === '') {
      // Renames and copies print the two paths as separate chunks.
      entries.push({
        path: chunks[index + 2] ?? '',
        previousPath: chunks[index + 1] ?? '',
        binary,
      });
      index += 2;
      continue;
    }

    entries.push({ path: inlinePath, previousPath: null, binary });
  }

  return entries;
}

/** Splits a patch into one string per file, preserving git's ordering. */
export function splitPatch(patch: string): readonly string[] {
  if (patch === '') {
    return [];
  }

  const sections: string[] = [];
  let current: string[] | null = null;

  for (const line of patch.split('\n')) {
    if (line.startsWith(FILE_HEADER)) {
      if (current !== null) {
        sections.push(current.join('\n'));
      }
      current = [line];
      continue;
    }
    current?.push(line);
  }

  if (current !== null) {
    sections.push(current.join('\n'));
  }

  return sections;
}

/**
 * Reads the hunks out of one file's patch section.
 *
 * The bodies are walked line by line rather than trusting the counts in the
 * `@@` header, which keeps the numbers right for any amount of context.
 */
export function parseHunks(section: string): readonly DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let oldLine = 0;
  let newLine = 0;
  let addedLines: number[] = [];
  let removedLines: number[] = [];
  let open: Omit<DiffHunk, 'addedLines' | 'removedLines'> | null = null;

  const close = (): void => {
    if (open !== null) {
      hunks.push({ ...open, addedLines, removedLines });
    }
  };

  for (const line of section.split('\n')) {
    const header = HUNK_HEADER.exec(line);
    if (header !== null) {
      close();
      const heading = header[5] ?? '';
      open = {
        oldStart: Number(header[1] ?? '0'),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3] ?? '0'),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        heading: heading === '' ? null : heading,
      };
      oldLine = open.oldStart;
      newLine = open.newStart;
      addedLines = [];
      removedLines = [];
      continue;
    }

    if (open === null) {
      continue;
    }

    // `\ No newline at end of file` annotates the previous line, and the
    // trailing empty string left by splitting is not part of the diff.
    if (line.startsWith('\\') || line === '') {
      continue;
    }

    if (line.startsWith('+')) {
      addedLines.push(newLine);
      newLine += 1;
    } else if (line.startsWith('-')) {
      removedLines.push(oldLine);
      oldLine += 1;
    } else {
      oldLine += 1;
      newLine += 1;
    }
  }

  close();
  return hunks;
}

function toStats(hunks: readonly DiffHunk[]): DiffStats {
  let added = 0;
  let removed = 0;

  for (const hunk of hunks) {
    added += hunk.addedLines.length;
    removed += hunk.removedLines.length;
  }

  return { added, removed };
}

/**
 * Joins the two views git gives of the same diff.
 *
 * `--numstat` names the paths unambiguously and flags binary content;
 * the patch carries the hunks. Both come from one diff invocation each with
 * identical options, so they list the same files in the same order and can be
 * paired positionally — which avoids re-parsing git's quoting rules for paths.
 */
export function parseDiff(numstat: string, patch: string): readonly DiffFile[] {
  const entries = parseNumstat(numstat);
  const sections = splitPatch(patch);
  const aligned = sections.length === entries.length;

  return entries.map((entry, index) => {
    const hunks = entry.binary || !aligned ? [] : parseHunks(sections[index] ?? '');
    return {
      path: entry.path,
      previousPath: entry.previousPath === '' ? null : entry.previousPath,
      binary: entry.binary,
      hunks,
      stats: toStats(hunks),
    };
  });
}

/**
 * Resolves what the working tree should be compared against.
 *
 * Normally that is `HEAD`; a repository with no commits yet is compared with
 * the empty tree instead, so its staged content still shows up as added.
 * Returns `null` when the hash algorithm is one this build has no empty tree
 * for, which costs the line detail but leaves the file list intact.
 */
async function resolveBase(
  root: string,
  runner: GitRunner,
  unborn: boolean,
): Promise<string | null> {
  if (!unborn) {
    return 'HEAD';
  }

  const format = await runner(['rev-parse', '--show-object-format'], { cwd: root });
  if (format.code !== 0) {
    return null;
  }

  return EMPTY_TREE[format.stdout.trim()] ?? null;
}

/**
 * Collects the diff between the given base and the working tree.
 *
 * Rename detection and the context setting are passed explicitly, and external
 * diff drivers and textconv filters are disabled, so the result depends only on
 * the repository's content.
 *
 * @throws {GitCommandError} If git could not produce the diff.
 * @throws {GitUnavailableError} If `git` cannot be executed.
 */
export async function readDiff(
  root: string,
  runner: GitRunner,
  unborn: boolean,
): Promise<readonly DiffFile[]> {
  const base = await resolveBase(root, runner, unborn);
  if (base === null) {
    return [];
  }

  const shared = ['--no-color', '--no-ext-diff', '--no-textconv', '--find-renames'];
  const [numstat, patch] = await Promise.all([
    runner(['diff', ...shared, '--numstat', '-z', base, '--'], { cwd: root }),
    runner(['diff', ...shared, CONTEXT_LINES, base, '--'], { cwd: root }),
  ]);

  return parseDiff(expectSuccess('diff --numstat', numstat), expectSuccess('diff', patch));
}

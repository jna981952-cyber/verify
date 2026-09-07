/**
 * Typed models describing a working tree's changes.
 *
 * These types are the boundary between raw `git` output and the rest of the
 * tool: parsers produce them, reporters consume them, and nothing downstream
 * needs to know how porcelain formats look.
 */

/** How a path changed relative to its previous state. */
export const CHANGE_KINDS = [
  'added',
  'modified',
  'deleted',
  'renamed',
  'untracked',
  'unmerged',
] as const;

/** Union of the recognised change kinds. */
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Where a change lives: the index, the working tree, or both. */
export const CHANGE_SCOPES = ['staged', 'unstaged', 'both'] as const;

/** Union of the recognised change scopes. */
export type ChangeScope = (typeof CHANGE_SCOPES)[number];

/** A contiguous block of lines reported by a unified diff. */
export interface DiffHunk {
  /** First line number on the "before" side, 1-based. */
  readonly oldStart: number;
  /** Number of lines the hunk covers on the "before" side. */
  readonly oldLines: number;
  /** First line number on the "after" side, 1-based. */
  readonly newStart: number;
  /** Number of lines the hunk covers on the "after" side. */
  readonly newLines: number;
  /** Section heading git prints after the `@@` marker, when it found one. */
  readonly heading: string | null;
  /** Line numbers added on the "after" side. */
  readonly addedLines: readonly number[];
  /** Line numbers removed from the "before" side. */
  readonly removedLines: readonly number[];
}

/** Line-level totals for a single file. */
export interface DiffStats {
  /** Number of added lines across every hunk. */
  readonly added: number;
  /** Number of removed lines across every hunk. */
  readonly removed: number;
}

/** A single changed path together with its diff detail. */
export interface FileChange {
  /** Path relative to the repository root, using forward slashes. */
  readonly path: string;
  /** Previous path for renames, `null` otherwise. */
  readonly previousPath: string | null;
  /** How the path changed. */
  readonly kind: ChangeKind;
  /** Whether the change is staged, unstaged, or partly both. */
  readonly scope: ChangeScope;
  /** True when git reported the content as binary. */
  readonly binary: boolean;
  /** Similarity score git assigned to a rename, 0-100, or `null`. */
  readonly similarity: number | null;
  /** Hunks parsed from the unified diff; empty for binary and untracked files. */
  readonly hunks: readonly DiffHunk[];
  /** Line totals derived from {@link hunks}. */
  readonly stats: DiffStats;
}

/** Counts of each change kind in a {@link ChangeSet}. */
export type ChangeCounts = Readonly<Record<ChangeKind, number>>;

/** Counts of each change kind plus the overall total. */
export interface ChangeSummary extends ChangeCounts {
  /** Total number of changed paths. */
  readonly total: number;
}

/** Which commit the working tree sits on. */
export interface GitHead {
  /** Current branch name, or `null` when detached. */
  readonly branch: string | null;
  /** Full commit SHA, or `null` in a repository with no commits yet. */
  readonly commit: string | null;
  /** First 7 characters of {@link commit}, or `null`. */
  readonly shortCommit: string | null;
  /** True when HEAD points at a commit rather than a branch. */
  readonly detached: boolean;
  /** True when the repository has no commits yet. */
  readonly unborn: boolean;
}

/** Everything Stage 2 knows about a repository's current changes. */
export interface ChangeSet {
  /** Absolute path to the repository's top level. */
  readonly root: string;
  /** Commit and branch the changes are measured against. */
  readonly head: GitHead;
  /** Changed paths, sorted by path. */
  readonly files: readonly FileChange[];
  /** Counts per change kind. */
  readonly summary: ChangeSummary;
}

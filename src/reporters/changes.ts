import { type ChangesReport } from '../core/report.js';
import {
  type ChangeKind,
  type ChangeSummary,
  type FileChange,
  type GitHead,
} from '../core/git/types.js';
import { type Palette } from '../utils/color.js';

const JSON_INDENT = 2;

/** Single-letter markers, matching the ones `git status` prints. */
const MARKERS: Readonly<Record<ChangeKind, string>> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
  unmerged: 'U',
};

/**
 * Order of the summary counters.
 *
 * The first four are always shown so the block has a stable shape; the rest
 * only appear when they have something to report.
 */
const ALWAYS_SUMMARISED: readonly ChangeKind[] = ['modified', 'added', 'deleted', 'renamed'];
const OPTIONALLY_SUMMARISED: readonly ChangeKind[] = ['untracked', 'unmerged'];

function colourMarker(kind: ChangeKind, palette: Palette): string {
  const marker = MARKERS[kind];

  switch (kind) {
    case 'added':
      return palette.green(marker);
    case 'deleted':
    case 'unmerged':
      return palette.red(marker);
    case 'untracked':
      return palette.dim(marker);
    default:
      return palette.cyan(marker);
  }
}

/** Describes where HEAD is, in the wording git itself uses. */
export function describeHead(head: GitHead): string {
  if (head.unborn) {
    const branch = head.branch ?? 'HEAD';
    return `On branch ${branch} with no commits yet`;
  }

  const commit = head.shortCommit ?? 'unknown';
  return head.branch === null
    ? `At ${commit} (detached HEAD)`
    : `On branch ${head.branch} at ${commit}`;
}

function formatFile(file: FileChange, palette: Palette): string {
  const marker = colourMarker(file.kind, palette);
  const path =
    file.previousPath === null ? file.path : `${palette.dim(file.previousPath)} -> ${file.path}`;

  return `  ${marker} ${path}`;
}

function summaryLines(summary: ChangeSummary): readonly string[] {
  const shown = [
    ...ALWAYS_SUMMARISED,
    ...OPTIONALLY_SUMMARISED.filter((kind) => summary[kind] > 0),
  ];

  return shown.map((kind) => `  ${String(summary[kind])} ${kind}`);
}

/**
 * Renders a change report as the human-facing summary shown by default.
 *
 * A clean working tree gets a single sentence rather than two empty blocks,
 * which is the answer someone running the command actually wants.
 */
export function formatChangesText(report: ChangesReport, palette: Palette): string {
  const { changes } = report;
  const header = palette.dim(describeHead(changes.head));

  if (changes.files.length === 0) {
    return [header, '', `${palette.green('✔')} No changes.`].join('\n');
  }

  return [
    header,
    '',
    palette.bold('Changed files:'),
    '',
    ...changes.files.map((file) => formatFile(file, palette)),
    '',
    palette.bold('Summary:'),
    ...summaryLines(changes.summary),
  ].join('\n');
}

/** Renders a change report as pretty-printed JSON for scripts and other tools. */
export function formatChangesJson(report: ChangesReport): string {
  return JSON.stringify(report, null, JSON_INDENT);
}

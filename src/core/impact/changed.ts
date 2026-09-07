import { type FileAnalysis } from '../analysis/types.js';
import { type DiffHunk, type FileChange } from '../git/types.js';
import { type ChangedFile, type ChangedSymbol, type SymbolPrecision } from './types.js';

/** Similarity score at which a rename carries no content change at all. */
const IDENTICAL = 100;

/**
 * Lines of the new file that a hunk touched.
 *
 * Added lines are read straight off the hunk. A hunk that only removes lines
 * has none, so the two new-side lines the removal sits between are taken
 * instead: the removed text is gone, but whatever surrounded it changed.
 */
export function touchedLines(hunks: readonly DiffHunk[]): readonly number[] {
  const lines = new Set<number>();

  for (const hunk of hunks) {
    if (hunk.addedLines.length > 0) {
      for (const line of hunk.addedLines) {
        lines.add(line);
      }
      continue;
    }
    lines.add(Math.max(hunk.newStart, 1));
    lines.add(Math.max(hunk.newStart, 1) + 1);
  }

  return [...lines].sort((left, right) => left - right);
}

/** Declarations of a file that contain at least one of the given lines. */
export function symbolsCovering(
  analysis: FileAnalysis,
  lines: readonly number[],
): readonly ChangedSymbol[] {
  const changed: ChangedSymbol[] = [];

  for (const symbol of analysis.symbols) {
    const inside = lines.filter((line) => line >= symbol.location.line && line <= symbol.endLine);
    if (inside.length > 0) {
      changed.push({
        name: symbol.name,
        kind: symbol.kind,
        container: symbol.container,
        lines: inside,
      });
    }
  }

  return changed;
}

/** Every declaration of a file, as a change covering its whole range. */
function allSymbols(analysis: FileAnalysis): readonly ChangedSymbol[] {
  return analysis.symbols.map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    container: symbol.container,
    lines: [symbol.location.line],
  }));
}

/**
 * Decides how precisely a file's changed declarations can be named.
 *
 * Diff hunks give the exact lines. Without them, a file that is wholly new is
 * still exact enough — every declaration in it is new — but anything else is
 * left as `unknown` rather than assuming the whole file moved.
 */
function precisionOf(change: FileChange, analysis: FileAnalysis | null): SymbolPrecision {
  if (analysis === null) {
    return 'unknown';
  }
  if (change.hunks.length > 0) {
    return 'exact';
  }
  if (change.kind === 'added' || change.kind === 'untracked') {
    return 'whole-file';
  }
  // A rename git scored as identical moved the file without touching a line.
  if (change.kind === 'renamed' && change.similarity === IDENTICAL) {
    return 'exact';
  }
  return 'unknown';
}

/**
 * Works out which declarations a single change touched.
 *
 * The file's own analysis is needed to answer that; without it — the file was
 * deleted, is not source, or sits outside the analysed directory — the change
 * is still reported, with no declarations claimed for it.
 */
export function describeChange(
  path: string,
  change: FileChange,
  analysis: FileAnalysis | null,
): ChangedFile {
  const precision = precisionOf(change, analysis);

  let symbols: readonly ChangedSymbol[] = [];
  if (analysis !== null) {
    if (precision === 'exact') {
      symbols = symbolsCovering(analysis, touchedLines(change.hunks));
    } else if (precision === 'whole-file') {
      symbols = allSymbols(analysis);
    }
  }

  return {
    path,
    kind: change.kind,
    analysed: analysis !== null,
    precision,
    symbols,
  };
}

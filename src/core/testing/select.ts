import { type ImpactAnalysis } from '../impact/types.js';
import { countTests } from './discover.js';
import {
  type DiscoveredFile,
  type SelectedFile,
  type SelectionMode,
  type TestSelection,
} from './types.js';

/** What {@link selectTests} needs beyond the discovered files. */
export interface SelectOptions {
  readonly mode: SelectionMode;
  /** Name filter to pass to the runner, `null` for none. */
  readonly pattern: string | null;
  /** Impact analysis, required in `impacted` mode and ignored otherwise. */
  readonly impact: ImpactAnalysis | null;
}

/** Orders paths by code unit so a selection does not depend on the locale. */
function byPath(left: SelectedFile, right: SelectedFile): number {
  if (left.path === right.path) {
    return 0;
  }
  return left.path < right.path ? -1 : 1;
}

/**
 * Explains why a test file was reached, in the impact analysis's own words.
 *
 * A test file at distance zero is one that changed; anything further carries
 * the reason the search recorded when it got there.
 */
function reasonFor(impact: ImpactAnalysis, path: string, distance: number): string {
  if (distance === 0) {
    return `${path} changed`;
  }

  const affected = impact.affected.find((file) => file.path === path);
  return affected?.reasons[0]?.detail ?? `${path} depends on what changed`;
}

/**
 * Chooses which test files to run.
 *
 * In `impacted` mode the choice comes from Stage 4: a test file is selected
 * only when the impact search reached it, and the reason it was reached is
 * carried through so the selection can be explained rather than asserted.
 */
export function selectTests(
  files: readonly DiscoveredFile[],
  options: SelectOptions,
): TestSelection {
  const { mode, pattern, impact } = options;

  if (mode === 'all' || impact === null) {
    return {
      mode: impact === null ? 'all' : mode,
      files: files.map((file) => ({ path: file.path, reason: null })).sort(byPath),
      pattern,
      tests: countTests(files),
    };
  }

  const distances = new Map(impact.tests.map((test) => [test.path, test.distance]));
  const chosen = files.filter((file) => distances.has(file.path));

  return {
    mode,
    files: chosen
      .map((file) => ({
        path: file.path,
        reason: reasonFor(impact, file.path, distances.get(file.path) ?? 0),
      }))
      .sort(byPath),
    pattern,
    tests: countTests(chosen),
  };
}

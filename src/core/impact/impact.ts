import { relative } from 'node:path';

import { analyzeCodebase, type AnalyzeOptions } from '../analysis/analyze.js';
import { toPosixPath } from '../analysis/scan.js';
import { type CodebaseAnalysis, type FileAnalysis } from '../analysis/types.js';
import { requireChanges, type CollectChangesOptions } from '../git/changes.js';
import { type ChangeSet } from '../git/types.js';
import { UsageError } from '../../utils/errors.js';
import { describeChange } from './changed.js';
import { traverseImpact } from './traverse.js';
import {
  type AffectedComponent,
  type AffectedFile,
  type AffectedRoute,
  type AffectedTest,
  type ChangedFile,
  type ImpactAnalysis,
  type ImpactSummary,
} from './types.js';

/** How many hops away from a change the search follows unless told otherwise. */
export const DEFAULT_IMPACT_DEPTH = 3;

/** Overrides accepted by {@link analyzeImpact}. */
export interface ImpactOptions extends CollectChangesOptions, AnalyzeOptions {
  /** Hops to follow away from the changed files; `0` reports changes only. */
  readonly depth?: number;
}

/** Orders paths by code unit so the result does not depend on the locale. */
function byText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/**
 * Rewrites a repository-relative path as one relative to the analysed root.
 *
 * `verify impact ./packages/api` measures changes against the repository but
 * analyses one directory inside it, so the two sets of paths have to be brought
 * into the same frame before anything can be matched up. A change outside the
 * analysed directory has no path in that frame and is reported as `null`.
 */
export function rebasePath(path: string, prefix: string): string | null {
  if (prefix === '') {
    return path;
  }
  if (path === prefix) {
    return '';
  }
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : null;
}

/** Maps the change set onto the analysed tree, keeping the parts that landed in it. */
function describeChanges(
  changes: ChangeSet,
  analysis: CodebaseAnalysis,
  prefix: string,
): { changed: readonly ChangedFile[]; deleted: ReadonlySet<string> } {
  const byPath = new Map(analysis.files.map((file) => [file.path, file]));
  const changed: ChangedFile[] = [];
  const deleted = new Set<string>();

  for (const change of changes.files) {
    const path = rebasePath(change.path, prefix);
    if (path === null) {
      continue;
    }

    changed.push(describeChange(path, change, byPath.get(path) ?? null));

    if (change.kind === 'deleted') {
      deleted.add(path);
    }

    // A rename leaves the old path behind; anything still importing it points
    // at a file that is no longer there.
    if (change.previousPath !== null) {
      const previous = rebasePath(change.previousPath, prefix);
      if (previous !== null && !byPath.has(previous)) {
        deleted.add(previous);
      }
    }
  }

  return { changed: changed.sort((left, right) => byText(left.path, right.path)), deleted };
}

/** Every file the change set reaches, the changed ones included, with distances. */
function reachedFiles(
  changed: readonly ChangedFile[],
  affected: readonly AffectedFile[],
): readonly (readonly [string, number])[] {
  return [
    ...changed.filter((file) => file.analysed).map((file) => [file.path, 0] as const),
    ...affected.map((file) => [file.path, file.distance] as const),
  ];
}

/**
 * Collects the tests, components and routes of every file the change reaches.
 *
 * A file that changed contributes everything it declares. A change anywhere in
 * a file can reach anything else in it — through module-level state, shared
 * imports or the declarations themselves — and which of those the change really
 * touched is what the per-file declaration list answers.
 */
function derive(
  reached: readonly (readonly [string, number])[],
  analysed: ReadonlyMap<string, FileAnalysis>,
): {
  tests: readonly AffectedTest[];
  components: readonly AffectedComponent[];
  routes: readonly AffectedRoute[];
} {
  const tests: AffectedTest[] = [];
  const components: AffectedComponent[] = [];
  const routes: AffectedRoute[] = [];

  for (const [path, distance] of reached) {
    const file = analysed.get(path);
    if (file === undefined) {
      continue;
    }

    if (file.testFile || file.tests.length > 0) {
      tests.push({
        path,
        distance,
        tests: file.tests.filter((test) => test.name !== null).map((test) => test.name ?? ''),
      });
    }

    for (const symbol of file.symbols) {
      if (symbol.kind === 'component') {
        components.push({ path, name: symbol.name, distance });
      }
    }

    for (const route of file.routes) {
      routes.push({ path, method: route.method, route: route.path, distance });
    }
  }

  const order = (
    left: { path: string; distance: number },
    right: { path: string; distance: number },
  ): number => left.distance - right.distance || byText(left.path, right.path);

  return {
    tests: tests.sort(order),
    components: components.sort(
      (left, right) => order(left, right) || byText(left.name, right.name),
    ),
    routes: routes.sort((left, right) => order(left, right) || byText(left.route, right.route)),
  };
}

/** Caveats that apply to this particular run, in words meant for a person. */
function buildNotes(
  changed: readonly ChangedFile[],
  deleted: ReadonlySet<string>,
  depth: number,
  truncated: boolean,
  outside: number,
): readonly string[] {
  const notes: string[] = [];

  // A deleted file is missing from the analysis by definition, and has a note
  // of its own; this one is for changes that are not analysable source at all.
  const unanalysed = changed.filter(
    (file) => !file.analysed && file.kind !== 'deleted' && !deleted.has(file.path),
  ).length;
  if (unanalysed > 0) {
    notes.push(
      `${String(unanalysed)} changed ${unanalysed === 1 ? 'file is' : 'files are'} not analysed source; nothing was followed from ${unanalysed === 1 ? 'it' : 'them'}.`,
    );
  }

  if (outside > 0) {
    notes.push(
      `${String(outside)} changed ${outside === 1 ? 'file lies' : 'files lie'} outside the analysed directory and ${outside === 1 ? 'was' : 'were'} left out.`,
    );
  }

  const vague = changed.filter((file) => file.analysed && file.precision === 'unknown').length;
  if (vague > 0) {
    notes.push(
      `${String(vague)} changed ${vague === 1 ? 'file has' : 'files have'} no diff to read, so no declarations are claimed for ${vague === 1 ? 'it' : 'them'}.`,
    );
  }

  if (deleted.size > 0) {
    notes.push(
      `${String(deleted.size)} removed ${deleted.size === 1 ? 'path was' : 'paths were'} followed through imports that no longer resolve.`,
    );
  }

  if (truncated) {
    notes.push(
      `The search stopped at depth ${String(depth)}; more files depend on what changed. Raise the depth to follow them.`,
    );
  }

  return notes;
}

function summarise(
  changed: readonly ChangedFile[],
  affected: readonly AffectedFile[],
  tests: readonly AffectedTest[],
  components: readonly AffectedComponent[],
  routes: readonly AffectedRoute[],
): ImpactSummary {
  return {
    changedFiles: changed.length,
    changedAnalysedFiles: changed.filter((file) => file.analysed).length,
    changedSymbols: changed.reduce((total, file) => total + file.symbols.length, 0),
    directlyAffected: affected.filter((file) => file.distance === 1).length,
    indirectlyAffected: affected.filter((file) => file.distance > 1).length,
    affectedTests: tests.length,
    affectedComponents: components.length,
    affectedRoutes: routes.length,
  };
}

/**
 * Works out what a repository's current changes reach.
 *
 * Combines the Git change set with the codebase analysis and walks the
 * dependency graph backwards from what changed. Every selection carries the
 * relationship that produced it, and relationships the source does not state —
 * anything wired up at runtime, or reached through a specifier that is built
 * rather than written — are not followed at all.
 *
 * @throws {UsageError} If `directory` is not inside a Git repository, or the
 *   depth is not a whole number of hops.
 */
export async function analyzeImpact(
  directory: string,
  options: ImpactOptions = {},
): Promise<ImpactAnalysis> {
  const depth = options.depth ?? DEFAULT_IMPACT_DEPTH;
  if (!Number.isInteger(depth) || depth < 0) {
    throw new UsageError(`Depth must be a whole number of hops, not ${String(depth)}.`);
  }

  const [changes, analysis] = await Promise.all([
    requireChanges(directory, options),
    analyzeCodebase(directory, options),
  ]);

  const prefix = toPosixPath(relative(changes.root, analysis.root));
  const outside = changes.files.filter((change) => rebasePath(change.path, prefix) === null).length;

  const { changed, deleted } = describeChanges(changes, analysis, prefix);
  const { affected, truncated } = traverseImpact({
    graph: analysis.graph,
    changed,
    deleted,
    depth,
  });

  const analysed = new Map(analysis.files.map((file) => [file.path, file]));
  const { tests, components, routes } = derive(reachedFiles(changed, affected), analysed);

  return {
    root: analysis.root,
    depth,
    truncated,
    head: changes.head,
    changed,
    affected,
    tests,
    components,
    routes,
    notes: buildNotes(changed, deleted, depth, truncated, outside),
    summary: summarise(changed, affected, tests, components, routes),
  };
}

import { resolveSpecifier } from '../analysis/resolve.js';
import { type DependencyGraph, type FileDependency } from '../analysis/types.js';
import {
  type AffectedFile,
  type ChangedFile,
  type ImpactReason,
  type ImpactRelation,
} from './types.js';

/** What the search needs to know about the codebase and the change set. */
export interface TraverseInput {
  readonly graph: DependencyGraph;
  readonly changed: readonly ChangedFile[];
  /** Paths the change set removed, which no longer appear in the graph. */
  readonly deleted: ReadonlySet<string>;
  /** How many hops to follow away from the changed files. */
  readonly depth: number;
}

/** What the search found. */
export interface TraverseResult {
  readonly affected: readonly AffectedFile[];
  /** True when the depth limit stopped the search with more still to explore. */
  readonly truncated: boolean;
}

/** One file's reference to another, ready to be turned into a reason. */
interface IncomingEdge {
  readonly from: string;
  readonly specifier: string;
  readonly typeOnly: boolean;
  readonly reExport: boolean;
  readonly deleted: boolean;
}

/** Orders paths by code unit so the result does not depend on the locale. */
function byText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function toIncoming(edge: FileDependency, deleted: boolean): IncomingEdge {
  return {
    from: edge.from,
    specifier: edge.specifier,
    typeOnly: edge.typeOnly,
    reExport: edge.via === 're-export',
    deleted,
  };
}

/**
 * Indexes the graph by the file being depended on.
 *
 * Specifiers the analysis could not resolve are given a second chance against
 * the deleted paths: an import that stopped resolving because its target was
 * removed is exactly the relationship impact analysis is looking for.
 */
export function buildIncoming(
  graph: DependencyGraph,
  deleted: ReadonlySet<string>,
): ReadonlyMap<string, readonly IncomingEdge[]> {
  const incoming = new Map<string, IncomingEdge[]>();

  const add = (target: string, edge: IncomingEdge): void => {
    const existing = incoming.get(target);
    if (existing === undefined) {
      incoming.set(target, [edge]);
    } else {
      existing.push(edge);
    }
  };

  for (const edge of graph.edges) {
    if (edge.to !== null) {
      add(edge.to, toIncoming(edge, false));
      continue;
    }

    if (edge.kind !== 'unresolved' || deleted.size === 0) {
      continue;
    }

    const removed = resolveSpecifier(edge.from, edge.specifier, deleted);
    if (removed !== null) {
      add(removed, toIncoming(edge, true));
    }
  }

  return incoming;
}

/** Names a file imports from another, indexed by the pair. */
function buildSymbolIndex(graph: DependencyGraph): ReadonlyMap<string, readonly string[]> {
  const names = new Map<string, string[]>();

  for (const edge of graph.symbolEdges) {
    const key = `${edge.from} ${edge.to}`;
    const existing = names.get(key);
    if (existing === undefined) {
      names.set(key, [edge.exported]);
    } else if (!existing.includes(edge.exported)) {
      existing.push(edge.exported);
    }
  }

  return names;
}

/**
 * Puts a reason into words that claim no more than was established.
 *
 * The distinction that matters is between a name that was shown to have
 * changed and one that merely comes from a file that changed somewhere: the
 * first is a proven relationship, the second is a reason to look, and the
 * wording keeps them apart.
 */
function detailFor(
  relation: ImpactRelation,
  from: string,
  via: string,
  symbol: string | null,
  specifier: string,
  viaChanged: boolean,
): string {
  const consequence = viaChanged ? 'which changed' : 'which is affected';
  const name = symbol ?? '';

  switch (relation) {
    case 'imports-deleted-file':
      return `${from} imports '${specifier}', which was deleted`;
    case 'imports-changed-symbol':
      return `${from} imports ${name} from ${via}, and ${name} changed`;
    case 'imports-symbol':
      return viaChanged
        ? `${from} imports ${name} from ${via}, which changed elsewhere`
        : `${from} imports ${name} from ${via}, which is affected`;
    case 're-exports':
      return `${from} re-exports from ${via}, ${consequence}`;
    case 'imports-file':
      return `${from} imports ${via}, ${consequence}`;
  }
}

/** Builds the reasons one file reaches another across a single edge. */
function reasonsFor(
  edge: IncomingEdge,
  via: string,
  importedNames: readonly string[],
  changedNames: ReadonlySet<string> | null,
): readonly ImpactReason[] {
  const viaChanged = changedNames !== null;

  const build = (relation: ImpactRelation, symbol: string | null): ImpactReason => ({
    via,
    relation,
    symbol,
    specifier: edge.specifier,
    typeOnly: edge.typeOnly,
    detail: detailFor(relation, edge.from, via, symbol, edge.specifier, viaChanged),
  });

  if (edge.deleted) {
    return [build('imports-deleted-file', null)];
  }

  if (importedNames.length === 0) {
    return [build(edge.reExport ? 're-exports' : 'imports-file', null)];
  }

  return importedNames.map((name) =>
    build(changedNames?.has(name) === true ? 'imports-changed-symbol' : 'imports-symbol', name),
  );
}

/**
 * Walks outwards from the changed files along the dependency graph, reversed.
 *
 * Each file is reported once, at the shortest distance it was reached, together
 * with every reason it was reached at that distance. Files that changed are not
 * reported as affected by themselves, and the search stops at `depth`, saying
 * so when there was more to follow.
 */
export function traverseImpact(input: TraverseInput): TraverseResult {
  const { graph, changed, deleted, depth } = input;

  const incoming = buildIncoming(graph, deleted);
  const importedNames = buildSymbolIndex(graph);
  const changedSymbols = new Map(
    changed.map((file) => [file.path, new Set(file.symbols.map((symbol) => symbol.name))]),
  );

  const origins = [
    ...changed.filter((file) => file.analysed).map((file) => file.path),
    ...deleted,
  ].sort(byText);

  const seen = new Set(origins);
  const affected: AffectedFile[] = [];

  let frontier: readonly string[] = origins;
  let truncated = false;

  for (let distance = 1; frontier.length > 0; distance += 1) {
    if (distance > depth) {
      truncated = frontier.some((path) =>
        (incoming.get(path) ?? []).some((edge) => !seen.has(edge.from)),
      );
      break;
    }

    const reached = new Map<string, ImpactReason[]>();

    for (const target of frontier) {
      const changedNames = changedSymbols.get(target) ?? null;

      for (const edge of incoming.get(target) ?? []) {
        if (seen.has(edge.from)) {
          continue;
        }

        const names = importedNames.get(`${edge.from} ${target}`) ?? [];
        const reasons = reasonsFor(edge, target, names, changedNames);
        const existing = reached.get(edge.from);
        if (existing === undefined) {
          reached.set(edge.from, [...reasons]);
        } else {
          existing.push(...reasons);
        }
      }
    }

    const next = [...reached.keys()].sort(byText);
    for (const path of next) {
      seen.add(path);
      affected.push({ path, distance, reasons: reached.get(path) ?? [] });
    }

    frontier = next;
  }

  return { affected, truncated };
}

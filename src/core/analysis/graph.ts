import { isBuiltinSpecifier, isRelativeSpecifier, resolveSpecifier } from './resolve.js';
import {
  type DependencyGraph,
  type DependencyKind,
  type DependencyOrigin,
  type FileAnalysis,
  type FileDependency,
  type SymbolDependency,
} from './types.js';

/** A specifier paired with how the importing file used it. */
interface Reference {
  readonly specifier: string;
  readonly via: DependencyOrigin;
  readonly typeOnly: boolean;
  /** Names taken from the module as `[exported, local]` pairs. */
  readonly bindings: readonly (readonly [string, string])[];
}

/** Orders paths by code unit so the graph does not depend on the active locale. */
function byText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function classify(specifier: string, resolved: string | null): DependencyKind {
  if (isRelativeSpecifier(specifier)) {
    return resolved === null ? 'unresolved' : 'local';
  }
  return isBuiltinSpecifier(specifier) ? 'builtin' : 'package';
}

/**
 * Every other module a file refers to.
 *
 * Re-exports are included alongside imports: `export { x } from './y.js'` makes
 * the file depend on `./y.js` just as surely as importing it would.
 */
function referencesOf(file: FileAnalysis): readonly Reference[] {
  const references: Reference[] = [];

  for (const entry of file.imports) {
    references.push({
      specifier: entry.specifier,
      via: 'import',
      typeOnly: entry.typeOnly,
      bindings: entry.bindings
        .filter((binding) => binding.imported !== '*')
        .map((binding) => [binding.imported, binding.local] as const),
    });
  }

  for (const entry of file.exports) {
    if (entry.source === null) {
      continue;
    }
    references.push({
      specifier: entry.source,
      via: 're-export',
      typeOnly: entry.typeOnly,
      bindings:
        entry.local === null || entry.local === '*' ? [] : [[entry.local, entry.name] as const],
    });
  }

  return references;
}

function sortedUnique(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].sort(byText);
}

/**
 * Builds the dependency graph over a set of analysed files.
 *
 * File edges are recorded for every specifier, resolved or not, so nothing a
 * file refers to disappears. Symbol edges are recorded only where the target
 * really exports the name: a relationship that was checked rather than guessed.
 */
export function buildGraph(files: readonly FileAnalysis[]): DependencyGraph {
  const paths = files.map((file) => file.path).sort(byText);
  const known = new Set(paths);
  const exportedNames = new Map(
    files.map((file) => [file.path, new Set(file.exports.map((entry) => entry.name))]),
  );

  const edges: FileDependency[] = [];
  const symbolEdges: SymbolDependency[] = [];
  const dependencies = new Map<string, Set<string>>(paths.map((path) => [path, new Set()]));
  const dependents = new Map<string, Set<string>>(paths.map((path) => [path, new Set()]));

  for (const file of files) {
    for (const reference of referencesOf(file)) {
      const resolved = resolveSpecifier(file.path, reference.specifier, known);
      const kind = classify(reference.specifier, resolved);

      edges.push({
        from: file.path,
        to: resolved,
        specifier: reference.specifier,
        kind,
        via: reference.via,
        typeOnly: reference.typeOnly,
      });

      if (resolved === null || resolved === file.path) {
        continue;
      }

      dependencies.get(file.path)?.add(resolved);
      dependents.get(resolved)?.add(file.path);

      const available = exportedNames.get(resolved);
      for (const [exported, local] of reference.bindings) {
        if (available?.has(exported) === true) {
          symbolEdges.push({
            from: file.path,
            to: resolved,
            exported,
            local,
            typeOnly: reference.typeOnly,
          });
        }
      }
    }
  }

  return {
    files: paths,
    edges,
    symbolEdges,
    dependencies: Object.fromEntries(
      [...dependencies].map(([path, targets]) => [path, sortedUnique(targets)]),
    ),
    dependents: Object.fromEntries(
      [...dependents].map(([path, sources]) => [path, sortedUnique(sources)]),
    ),
  };
}

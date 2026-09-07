import { type ApiRoute, type SymbolKind } from '../analysis/types.js';
import { type ChangeKind, type GitHead } from '../git/types.js';

/**
 * Typed models describing what a set of changes reaches.
 *
 * Everything here is derived from the Stage 2 change set and the Stage 3
 * analysis by following relationships those two established. Nothing is
 * inferred about behaviour at runtime: a relationship appears only when it was
 * read out of the source, and where the source does not say, the model records
 * that it does not know rather than guessing.
 */

/** A declaration a change touched. */
export interface ChangedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  /** Enclosing class for a method, `null` for a top-level declaration. */
  readonly container: string | null;
  /** Lines inside the declaration that the diff touched, sorted. */
  readonly lines: readonly number[];
}

/** Why a changed file's declarations could not be narrowed down. */
export const SYMBOL_PRECISIONS = ['exact', 'whole-file', 'unknown'] as const;

/** Union of the recognised levels of declaration precision. */
export type SymbolPrecision = (typeof SYMBOL_PRECISIONS)[number];

/** One file the change set touched. */
export interface ChangedFile {
  /** Path relative to the analysed root, using forward slashes. */
  readonly path: string;
  /** How Git described the change. */
  readonly kind: ChangeKind;
  /** True when the file is part of the analysed codebase. */
  readonly analysed: boolean;
  /**
   * How the declarations below were arrived at.
   *
   * `exact` means diff hunks named the lines and the declarations were matched
   * against them; `whole-file` means the file is new or wholly new to the
   * analysis, so every declaration in it is a change; `unknown` means neither
   * was available — a binary or deleted file, say — and no declarations are
   * claimed rather than every one being assumed.
   */
  readonly precision: SymbolPrecision;
  readonly symbols: readonly ChangedSymbol[];
}

/** How one file reaches another. */
export const IMPACT_RELATIONS = [
  'imports-changed-symbol',
  'imports-symbol',
  'imports-file',
  're-exports',
  'imports-deleted-file',
] as const;

/** Union of the recognised relationships between two files. */
export type ImpactRelation = (typeof IMPACT_RELATIONS)[number];

/** Why one file was selected as affected. */
export interface ImpactReason {
  /** The file one hop closer to the change. */
  readonly via: string;
  readonly relation: ImpactRelation;
  /** Name the dependency refers to, `null` when it names none. */
  readonly symbol: string | null;
  /** Specifier as written in the source. */
  readonly specifier: string;
  /** True when the reference is `import type` or an equivalent. */
  readonly typeOnly: boolean;
  /** One sentence explaining the selection, ready to print. */
  readonly detail: string;
}

/** A file the change set reaches. */
export interface AffectedFile {
  /** Path relative to the analysed root, using forward slashes. */
  readonly path: string;
  /** Hops from the nearest changed file; `1` is a direct dependent. */
  readonly distance: number;
  /** Every reason the file was reached at {@link distance}. */
  readonly reasons: readonly ImpactReason[];
}

/** A test file the change set reaches. */
export interface AffectedTest {
  readonly path: string;
  /** `0` when the test file itself changed. */
  readonly distance: number;
  /** Titles of the tests it declares, as written. */
  readonly tests: readonly string[];
}

/** A React component the change set reaches. */
export interface AffectedComponent {
  readonly path: string;
  readonly name: string;
  /** `0` when the component's own file changed. */
  readonly distance: number;
}

/** An API route the change set reaches. */
export interface AffectedRoute {
  readonly path: string;
  readonly method: ApiRoute['method'];
  /** Route path, as written or derived from the file path. */
  readonly route: string;
  /** `0` when the route's own file changed. */
  readonly distance: number;
}

/** Headline numbers for an impact analysis. */
export interface ImpactSummary {
  readonly changedFiles: number;
  /** Changed files that are part of the analysed codebase. */
  readonly changedAnalysedFiles: number;
  readonly changedSymbols: number;
  /** Files reached in one hop. */
  readonly directlyAffected: number;
  /** Files reached in two hops or more. */
  readonly indirectlyAffected: number;
  readonly affectedTests: number;
  readonly affectedComponents: number;
  readonly affectedRoutes: number;
}

/** Everything Stage 4 can say about the reach of a change set. */
export interface ImpactAnalysis {
  /** Absolute path to the analysed directory. */
  readonly root: string;
  /** How many hops the search was allowed to follow. */
  readonly depth: number;
  /** True when files were left unexplored because {@link depth} was reached. */
  readonly truncated: boolean;
  /** Commit and branch the changes were measured against. */
  readonly head: GitHead;
  /** Changed files, sorted by path. */
  readonly changed: readonly ChangedFile[];
  /** Affected files, sorted by distance and then by path. */
  readonly affected: readonly AffectedFile[];
  readonly tests: readonly AffectedTest[];
  readonly components: readonly AffectedComponent[];
  readonly routes: readonly AffectedRoute[];
  /** Caveats that apply to this particular run, in words meant for a person. */
  readonly notes: readonly string[];
  readonly summary: ImpactSummary;
}

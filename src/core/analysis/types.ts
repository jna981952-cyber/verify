/**
 * Typed models describing a JavaScript or TypeScript codebase.
 *
 * These types are the boundary between the syntax tree and the rest of the
 * tool: the extractors produce them, the reporters consume them, and nothing
 * downstream needs to know that TypeScript's parser produced the input.
 */

/** A position in a source file. */
export interface SourceLocation {
  /** Line number, 1-based. */
  readonly line: number;
  /** Column number, 1-based. */
  readonly column: number;
}

/** Kinds of declaration the analyser recognises. */
export const SYMBOL_KINDS = [
  'function',
  'class',
  'method',
  'variable',
  'interface',
  'type',
  'enum',
  'component',
] as const;

/** Union of the recognised declaration kinds. */
export type SymbolKind = (typeof SYMBOL_KINDS)[number];

/** A declaration found in a source file. */
export interface CodeSymbol {
  /** Declared name; `default` for an anonymous default export. */
  readonly name: string;
  /**
   * What was declared.
   *
   * A React component is reported as `component` rather than as the `function`
   * or `class` it happens to be written as, so each declaration has exactly one
   * kind.
   */
  readonly kind: SymbolKind;
  /** Whether the declaration leaves the module. */
  readonly exported: boolean;
  /** Enclosing class for a method, `null` for a top-level declaration. */
  readonly container: string | null;
  /** Where the declaration starts. */
  readonly location: SourceLocation;
  /**
   * Last line the declaration spans, 1-based and inclusive.
   *
   * Together with {@link location} this gives the range a changed line can be
   * tested against, which is what lets impact analysis name the declarations a
   * diff actually touched instead of guessing from the file alone.
   */
  readonly endLine: number;
}

/** How a module brings another module in. */
export const IMPORT_KINDS = ['static', 'dynamic', 'require'] as const;

/** Union of the recognised import forms. */
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** One name taken from an imported module. */
export interface ImportBinding {
  /** Name the target module exports: a name, `default`, or `*`. */
  readonly imported: string;
  /** Name the importing module uses. */
  readonly local: string;
  /** True for `import type` and `import { type x }`. */
  readonly typeOnly: boolean;
}

/** A module brought into a file. */
export interface ModuleImport {
  /** Module specifier exactly as written. */
  readonly specifier: string;
  readonly kind: ImportKind;
  /** Bindings taken from the module; empty for a side-effect import. */
  readonly bindings: readonly ImportBinding[];
  /** True when the whole statement is type-only. */
  readonly typeOnly: boolean;
  readonly location: SourceLocation;
}

/** A name a file makes available to other modules. */
export interface ModuleExport {
  /** Exported name; `default` for a default export, `*` for a star re-export. */
  readonly name: string;
  /** Local name behind the export, `null` when it comes from another module. */
  readonly local: string | null;
  /** Module the name is re-exported from, `null` for a local export. */
  readonly source: string | null;
  readonly typeOnly: boolean;
  readonly location: SourceLocation;
}

/** Whether a test declaration groups other tests or is one itself. */
export const TEST_KINDS = ['suite', 'case'] as const;

/** Union of the recognised test declaration kinds. */
export type TestKind = (typeof TEST_KINDS)[number];

/** A `describe`, `it` or `test` declaration. */
export interface TestCase {
  /** Title given to the declaration, `null` when it is not a plain string. */
  readonly name: string | null;
  readonly kind: TestKind;
  /** Function the declaration was written with, such as `it` or `describe.only`. */
  readonly callee: string;
  readonly location: SourceLocation;
}

/** HTTP methods a detected route can answer. */
export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'ALL',
] as const;

/** Union of the recognised HTTP methods. */
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** How a route was recognised. */
export const ROUTE_SOURCES = ['router-call', 'route-handler', 'pages-api'] as const;

/** Union of the recognised route shapes. */
export type RouteSource = (typeof ROUTE_SOURCES)[number];

/** An HTTP endpoint the analyser could recognise from syntax alone. */
export interface ApiRoute {
  readonly method: HttpMethod;
  /** Route path, as written for a router call or derived from the file path. */
  readonly path: string;
  readonly source: RouteSource;
  readonly location: SourceLocation;
}

/** Languages the analyser reads. */
export const LANGUAGES = ['javascript', 'typescript'] as const;

/** Union of the recognised languages. */
export type Language = (typeof LANGUAGES)[number];

/** Everything the analyser found in one file. */
export interface FileAnalysis {
  /** Path relative to the analysed root, using forward slashes. */
  readonly path: string;
  readonly language: Language;
  /** Size of the file on disk, in bytes. */
  readonly bytes: number;
  /** Number of lines in the file. */
  readonly lines: number;
  /** True for a `.d.ts` declaration file. */
  readonly declaration: boolean;
  /** True when the path follows a test naming convention. */
  readonly testFile: boolean;
  readonly symbols: readonly CodeSymbol[];
  readonly imports: readonly ModuleImport[];
  readonly exports: readonly ModuleExport[];
  readonly tests: readonly TestCase[];
  readonly routes: readonly ApiRoute[];
}

/** A file the analyser deliberately did not read. */
export interface SkippedFile {
  /** Path relative to the analysed root, using forward slashes. */
  readonly path: string;
  /** Why it was skipped, in words meant for a person. */
  readonly reason: string;
}

/** What a module specifier turned out to point at. */
export const DEPENDENCY_KINDS = ['local', 'package', 'builtin', 'unresolved'] as const;

/** Union of the recognised dependency kinds. */
export type DependencyKind = (typeof DEPENDENCY_KINDS)[number];

/** Whether a dependency was written as an import or as a re-export. */
export const DEPENDENCY_ORIGINS = ['import', 're-export'] as const;

/** Union of the recognised dependency origins. */
export type DependencyOrigin = (typeof DEPENDENCY_ORIGINS)[number];

/** One file's use of another module. */
export interface FileDependency {
  /** Importing file, relative to the analysed root. */
  readonly from: string;
  /** Imported file, relative to the analysed root; `null` unless it is `local`. */
  readonly to: string | null;
  /** Specifier exactly as written. */
  readonly specifier: string;
  readonly kind: DependencyKind;
  /** How the reference was written. */
  readonly via: DependencyOrigin;
  readonly typeOnly: boolean;
}

/**
 * One file's use of a name another file exports.
 *
 * Only recorded when the specifier resolved to an analysed file and that file
 * really exports the name, so an edge here is a relationship that was checked
 * rather than guessed.
 */
export interface SymbolDependency {
  readonly from: string;
  readonly to: string;
  /** Name as exported by {@link to}. */
  readonly exported: string;
  /** Name as used in {@link from}. */
  readonly local: string;
  readonly typeOnly: boolean;
}

/** How the analysed files relate to one another. */
export interface DependencyGraph {
  /** Every analysed file, sorted by path. */
  readonly files: readonly string[];
  readonly edges: readonly FileDependency[];
  readonly symbolEdges: readonly SymbolDependency[];
  /** Files each file imports, keyed by path and sorted. */
  readonly dependencies: Readonly<Record<string, readonly string[]>>;
  /** Files that import each file, keyed by path and sorted. */
  readonly dependents: Readonly<Record<string, readonly string[]>>;
}

/** Counts of each declaration kind. */
export type SymbolCounts = Readonly<Record<SymbolKind, number>>;

/** Declaration counts plus the overall total. */
export interface SymbolSummary extends SymbolCounts {
  readonly total: number;
}

/** Headline numbers for a whole analysis. */
export interface AnalysisSummary {
  /** Files that were read and parsed. */
  readonly files: number;
  /** Files that were found but not read. */
  readonly skipped: number;
  readonly lines: number;
  readonly symbols: SymbolSummary;
  readonly imports: number;
  /** Imports that resolved to another analysed file. */
  readonly localImports: number;
  /** Imports of packages and Node built-ins. */
  readonly externalImports: number;
  /** Imports of a path that no analysed file matched. */
  readonly unresolvedImports: number;
  readonly exports: number;
  readonly testFiles: number;
  readonly tests: number;
  readonly routes: number;
}

/** Everything Stage 3 knows about a codebase. */
export interface CodebaseAnalysis {
  /** Absolute path to the analysed directory. */
  readonly root: string;
  /** Analysed files, sorted by path. */
  readonly files: readonly FileAnalysis[];
  /** Files that were skipped, sorted by path. */
  readonly skipped: readonly SkippedFile[];
  readonly graph: DependencyGraph;
  readonly summary: AnalysisSummary;
}

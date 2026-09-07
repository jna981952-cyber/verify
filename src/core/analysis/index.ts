/**
 * Static analysis of JavaScript and TypeScript source.
 *
 * The modules underneath split the work by concern — finding files, parsing,
 * reading modules, declarations, tests and routes, then relating the files to
 * one another — and this barrel is what the rest of the tool imports.
 */
export {
  analyzeCodebase,
  summariseAnalysis,
  summariseSymbols,
  type AnalyzeOptions,
} from './analyze.js';
export { accessPath, literalText, nameOf, walk } from './ast.js';
export { analyzeSource } from './file.js';
export { buildGraph } from './graph.js';
export { collectExports, collectImports } from './modules.js';
export {
  extensionOf,
  isDeclarationPath,
  isSourcePath,
  languageOf,
  parseSource,
  SOURCE_EXTENSIONS,
} from './parser.js';
export {
  containsJsx,
  isComponentFunction,
  isComponentName,
  isReactComponentClass,
} from './react.js';
export {
  isBuiltinSpecifier,
  isRelativeSpecifier,
  resolutionCandidates,
  resolveSpecifier,
} from './resolve.js';
export { collectRoutes, pagesApiPath, routeHandlerPath } from './routes.js';
export {
  DEFAULT_MAX_FILE_BYTES,
  IGNORED_DIRECTORIES,
  scanSources,
  toPosixPath,
  type ScannedFile,
  type ScanOptions,
  type ScanResult,
} from './scan.js';
export { collectSymbols } from './symbols.js';
export { collectTests, isTestPath } from './tests.js';
export {
  DEPENDENCY_KINDS,
  DEPENDENCY_ORIGINS,
  HTTP_METHODS,
  IMPORT_KINDS,
  LANGUAGES,
  ROUTE_SOURCES,
  SYMBOL_KINDS,
  TEST_KINDS,
  type AnalysisSummary,
  type ApiRoute,
  type CodebaseAnalysis,
  type CodeSymbol,
  type DependencyGraph,
  type DependencyKind,
  type DependencyOrigin,
  type FileAnalysis,
  type FileDependency,
  type HttpMethod,
  type ImportBinding,
  type ImportKind,
  type Language,
  type ModuleExport,
  type ModuleImport,
  type RouteSource,
  type SkippedFile,
  type SourceLocation,
  type SymbolCounts,
  type SymbolDependency,
  type SymbolKind,
  type SymbolSummary,
  type TestCase,
  type TestKind,
} from './types.js';

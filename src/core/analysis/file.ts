import { collectExports, collectImports } from './modules.js';
import { isDeclarationPath, languageOf, parseSource } from './parser.js';
import { collectRoutes } from './routes.js';
import { collectSymbols } from './symbols.js';
import { collectTests, isTestPath } from './tests.js';
import { type CodeSymbol, type FileAnalysis, type ModuleExport } from './types.js';

/**
 * Marks declarations that leave the module through a separate export statement.
 *
 * `export { total }` sits well away from `function total()`, so the export list
 * has to be folded back into the symbols rather than read off each declaration.
 */
function withExportedFlags(
  symbols: readonly CodeSymbol[],
  exports: readonly ModuleExport[],
): readonly CodeSymbol[] {
  const exportedLocals = new Set(
    exports
      .filter((entry) => entry.source === null && entry.local !== null)
      .map((entry) => entry.local ?? ''),
  );

  return symbols.map((symbol) =>
    symbol.exported || symbol.container !== null || !exportedLocals.has(symbol.name)
      ? symbol
      : { ...symbol, exported: true },
  );
}

/** Counts the lines in a file the way an editor would. */
function countLines(text: string): number {
  if (text === '') {
    return 0;
  }
  const newlines = text.split('\n').length;
  return text.endsWith('\n') ? newlines - 1 : newlines;
}

/**
 * Analyses one file's text.
 *
 * Pure and synchronous: everything reported comes from the text handed in, so
 * the same input always produces the same result.
 */
export function analyzeSource(path: string, text: string, bytes: number): FileAnalysis {
  const source = parseSource(path, text);
  const exports = collectExports(source);

  return {
    path,
    language: languageOf(path) ?? 'javascript',
    bytes,
    lines: countLines(text),
    declaration: isDeclarationPath(path),
    testFile: isTestPath(path),
    symbols: withExportedFlags(collectSymbols(source), exports),
    imports: collectImports(source),
    exports,
    tests: collectTests(source),
    routes: collectRoutes(source, path),
  };
}

import { readFile, stat } from 'node:fs/promises';

import { UsageError, toErrorMessage } from '../../utils/errors.js';
import { analyzeSource } from './file.js';
import { buildGraph } from './graph.js';
import { scanSources, type ScanOptions } from './scan.js';
import {
  SYMBOL_KINDS,
  type AnalysisSummary,
  type CodebaseAnalysis,
  type DependencyGraph,
  type FileAnalysis,
  type SkippedFile,
  type SymbolKind,
  type SymbolSummary,
} from './types.js';

/** Overrides accepted by {@link analyzeCodebase}. */
export type AnalyzeOptions = ScanOptions;

/** Counts the declarations of each kind across every analysed file. */
export function summariseSymbols(files: readonly FileAnalysis[]): SymbolSummary {
  const counts = Object.fromEntries(SYMBOL_KINDS.map((kind) => [kind, 0])) as Record<
    SymbolKind,
    number
  >;
  let total = 0;

  for (const file of files) {
    for (const symbol of file.symbols) {
      counts[symbol.kind] += 1;
      total += 1;
    }
  }

  return { ...counts, total };
}

/** Splits the import edges of a graph by where each one led. */
function countImports(graph: DependencyGraph): {
  local: number;
  external: number;
  unresolved: number;
} {
  const imports = graph.edges.filter((edge) => edge.via === 'import');

  return {
    local: imports.filter((edge) => edge.kind === 'local').length,
    external: imports.filter((edge) => edge.kind === 'package' || edge.kind === 'builtin').length,
    unresolved: imports.filter((edge) => edge.kind === 'unresolved').length,
  };
}

/**
 * Reduces an analysis to its headline numbers.
 *
 * Exported so anything assembling a {@link CodebaseAnalysis} by hand counts the
 * same way this module does.
 */
export function summariseAnalysis(
  files: readonly FileAnalysis[],
  skipped: readonly SkippedFile[],
  graph: DependencyGraph,
): AnalysisSummary {
  let lines = 0;
  let imports = 0;
  let exports = 0;
  let testFiles = 0;
  let tests = 0;
  let routes = 0;

  for (const file of files) {
    lines += file.lines;
    imports += file.imports.length;
    exports += file.exports.length;
    tests += file.tests.length;
    routes += file.routes.length;
    if (file.testFile) {
      testFiles += 1;
    }
  }

  const counted = countImports(graph);

  return {
    files: files.length,
    skipped: skipped.length,
    lines,
    symbols: summariseSymbols(files),
    imports,
    localImports: counted.local,
    externalImports: counted.external,
    unresolvedImports: counted.unresolved,
    exports,
    testFiles,
    tests,
    routes,
  };
}

/** Text containing a NUL byte is data that happens to carry a source extension. */
function looksBinary(text: string): boolean {
  return text.includes('\0');
}

/**
 * Analyses every JavaScript and TypeScript file under a directory.
 *
 * A file that cannot be read, or that turns out not to be text, is recorded as
 * skipped and the run continues: one unreadable file is never a reason to
 * report nothing about the rest. Malformed source is not skipped at all —
 * TypeScript's parser recovers, so whatever could still be read is reported.
 *
 * @throws {UsageError} If `directory` cannot be read or is not a directory.
 */
export async function analyzeCodebase(
  directory: string,
  options: AnalyzeOptions = {},
): Promise<CodebaseAnalysis> {
  let stats;
  try {
    stats = await stat(directory);
  } catch (cause) {
    throw new UsageError(`Cannot read directory: ${directory}`, { cause });
  }
  if (!stats.isDirectory()) {
    throw new UsageError(`Not a directory: ${directory}`);
  }

  const scan = await scanSources(directory, options);
  const files: FileAnalysis[] = [];
  const skipped: SkippedFile[] = [...scan.skipped];

  for (const found of scan.files) {
    let text: string;
    try {
      text = await readFile(found.absolutePath, 'utf8');
    } catch (cause) {
      skipped.push({ path: found.path, reason: `file is unreadable: ${toErrorMessage(cause)}` });
      continue;
    }

    if (looksBinary(text)) {
      skipped.push({ path: found.path, reason: 'file is not text' });
      continue;
    }

    try {
      files.push(analyzeSource(found.path, text, found.bytes));
    } catch (cause) {
      skipped.push({ path: found.path, reason: `could not be analysed: ${toErrorMessage(cause)}` });
    }
  }

  const graph = buildGraph(files);

  return {
    root: directory,
    files,
    skipped,
    graph,
    summary: summariseAnalysis(files, skipped, graph),
  };
}

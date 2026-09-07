import {
  SYMBOL_KINDS,
  type AnalysisSummary,
  type ApiRoute,
  type CodebaseAnalysis,
  type SkippedFile,
  type SymbolKind,
} from '../core/analysis/types.js';
import { type AnalysisReport } from '../core/report.js';
import { type Palette } from '../utils/color.js';

const JSON_INDENT = 2;

/** Singular and plural labels, spelled out because `classes` is irregular. */
const SYMBOL_LABELS: Readonly<Record<SymbolKind, readonly [string, string]>> = {
  function: ['function', 'functions'],
  class: ['class', 'classes'],
  method: ['method', 'methods'],
  variable: ['variable', 'variables'],
  interface: ['interface', 'interfaces'],
  type: ['type', 'types'],
  enum: ['enum', 'enums'],
  component: ['React component', 'React components'],
};

/** Renders a count with a label that agrees with it. */
function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${String(value)} ${value === 1 ? singular : plural}`;
}

function symbolLines(summary: AnalysisSummary): readonly string[] {
  return SYMBOL_KINDS.filter((kind) => summary.symbols[kind] > 0).map((kind) => {
    const [singular, plural] = SYMBOL_LABELS[kind];
    return `  ${count(summary.symbols[kind], singular, plural)}`;
  });
}

function moduleLines(analysis: CodebaseAnalysis): readonly string[] {
  const { summary, graph } = analysis;
  const resolved = [
    `${String(summary.localImports)} local`,
    `${String(summary.externalImports)} external`,
    ...(summary.unresolvedImports > 0 ? [`${String(summary.unresolvedImports)} unresolved`] : []),
  ].join(', ');

  return [
    `  ${count(summary.imports, 'import')} (${resolved})`,
    `  ${count(summary.exports, 'export')}`,
    `  ${count(graph.edges.length, 'dependency edge')}, ${count(graph.symbolEdges.length, 'symbol edge')}`,
  ];
}

/** Pads every entry of a column to the width of its widest member. */
function column(values: readonly string[]): readonly string[] {
  const width = values.reduce((widest, value) => Math.max(widest, value.length), 0);
  return values.map((value) => value.padEnd(width));
}

interface LocatedRoute {
  readonly route: ApiRoute;
  readonly path: string;
}

function routeLines(routes: readonly LocatedRoute[], palette: Palette): readonly string[] {
  const methods = column(routes.map((entry) => entry.route.method));
  const paths = column(routes.map((entry) => entry.route.path));

  return routes.map((entry, index) => {
    const where = `${entry.path}:${String(entry.route.location.line)}`;
    return `  ${palette.cyan(methods[index] ?? '')}  ${paths[index] ?? ''}  ${palette.dim(where)}`;
  });
}

function skippedLines(skipped: readonly SkippedFile[], palette: Palette): readonly string[] {
  return skipped.map((entry) => `  ${entry.path}  ${palette.dim(`(${entry.reason})`)}`);
}

/** Appends a titled block, or nothing at all when the block would be empty. */
function section(lines: string[], title: string, body: readonly string[], palette: Palette): void {
  if (body.length === 0) {
    return;
  }
  lines.push('', palette.bold(title), ...body);
}

/**
 * Renders an analysis as the human-facing summary shown by default.
 *
 * The full inventory is what `--json` is for; this answers the questions worth
 * asking at a glance — how much is there, how does it hang together, and what
 * could the analyser not read.
 */
export function formatAnalysisText(report: AnalysisReport, palette: Palette): string {
  const { analysis } = report;
  const { summary } = analysis;

  if (summary.files === 0 && summary.skipped === 0) {
    return [
      palette.dim(report.target),
      '',
      `${palette.green('✔')} No JavaScript or TypeScript files found.`,
    ].join('\n');
  }

  const routes = analysis.files.flatMap((file) =>
    file.routes.map((route) => ({ route, path: file.path })),
  );

  const lines: string[] = [
    `${palette.bold(`Analysed ${count(summary.files, 'file')}`)} under ${palette.cyan(report.target)}`,
    `  ${count(summary.lines, 'line')} of source`,
  ];

  section(lines, 'Symbols:', symbolLines(summary), palette);
  section(lines, 'Modules:', moduleLines(analysis), palette);
  section(
    lines,
    'Tests:',
    summary.tests === 0 && summary.testFiles === 0
      ? []
      : [`  ${count(summary.testFiles, 'test file')}, ${count(summary.tests, 'test')}`],
    palette,
  );
  section(lines, 'API routes:', routeLines(routes, palette), palette);
  section(lines, 'Skipped:', skippedLines(analysis.skipped, palette), palette);

  return lines.join('\n');
}

/** Renders an analysis as pretty-printed JSON for scripts and other tools. */
export function formatAnalysisJson(report: AnalysisReport): string {
  return JSON.stringify(report, null, JSON_INDENT);
}

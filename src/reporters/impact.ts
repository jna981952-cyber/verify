import { type ImpactAnalysis } from '../core/impact/types.js';
import { type ImpactReport } from '../core/report.js';
import { type Palette } from '../utils/color.js';

const JSON_INDENT = 2;

/** Appends a titled block, or nothing at all when the block would be empty. */
function section(lines: string[], title: string, body: readonly string[], palette: Palette): void {
  if (body.length === 0) {
    return;
  }
  if (lines.length > 0) {
    lines.push('');
  }
  lines.push(palette.bold(title), ...body);
}

/** Pads every entry of a column to the width of its widest member. */
function column(values: readonly string[]): readonly string[] {
  const width = values.reduce((widest, value) => Math.max(widest, value.length), 0);
  return values.map((value) => value.padEnd(width));
}

/** Describes where HEAD is, matching the wording `verify changes` uses. */
function describeHead(analysis: ImpactAnalysis): string {
  const { head } = analysis;
  if (head.unborn) {
    return `On branch ${head.branch ?? 'HEAD'} with no commits yet`;
  }
  const commit = head.shortCommit ?? 'unknown';
  return head.branch === null
    ? `At ${commit} (detached HEAD)`
    : `On branch ${head.branch} at ${commit}`;
}

/** Names a declaration the way it is written, including its class. */
function describeSymbol(name: string, container: string | null): string {
  return container === null ? name : `${container}.${name}`;
}

function changedSymbolLines(analysis: ImpactAnalysis, palette: Palette): readonly string[] {
  const rows = analysis.changed.flatMap((file) =>
    file.symbols.map((symbol) => ({
      name: describeSymbol(symbol.name, symbol.container),
      kind: symbol.kind,
      path: file.path,
    })),
  );

  const names = column(rows.map((row) => row.name));

  return rows.map(
    (row, index) => `  ${names[index] ?? ''}  ${palette.dim(`${row.kind} in ${row.path}`)}`,
  );
}

function testLines(analysis: ImpactAnalysis, palette: Palette): readonly string[] {
  return analysis.tests.map((test) => {
    const count = test.tests.length;
    const detail = count === 0 ? '' : ` ${palette.dim(`(${String(count)} tests)`)}`;
    return `  ${test.path}${detail}`;
  });
}

function componentLines(analysis: ImpactAnalysis, palette: Palette): readonly string[] {
  const names = column(analysis.components.map((component) => component.name));

  return analysis.components.map(
    (component, index) => `  ${names[index] ?? ''}  ${palette.dim(component.path)}`,
  );
}

function routeLines(analysis: ImpactAnalysis, palette: Palette): readonly string[] {
  const methods = column(analysis.routes.map((route) => route.method));
  const paths = column(analysis.routes.map((route) => route.route));

  return analysis.routes.map(
    (route, index) =>
      `  ${palette.cyan(methods[index] ?? '')}  ${paths[index] ?? ''}  ${palette.dim(route.path)}`,
  );
}

/**
 * Every reason, in the order the files were reached.
 *
 * Identical sentences are collapsed: the same relationship can be reached by
 * more than one route, and repeating it says nothing new.
 */
function reasonLines(analysis: ImpactAnalysis): readonly string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const file of analysis.affected) {
    for (const reason of file.reasons) {
      if (!seen.has(reason.detail)) {
        seen.add(reason.detail);
        lines.push(`  ${reason.detail}`);
      }
    }
  }

  return lines;
}

function pathsAtDistance(analysis: ImpactAnalysis, direct: boolean): readonly string[] {
  return analysis.affected
    .filter((file) => (direct ? file.distance === 1 : file.distance > 1))
    .map((file) => `  ${file.path}`);
}

/**
 * Renders an impact analysis as the human-facing summary shown by default.
 *
 * Sections appear only when they have something in them, and every affected
 * item is backed by a sentence in the reasons block, so nothing in the output
 * is asserted without saying where it came from.
 */
export function formatImpactText(report: ImpactReport, palette: Palette): string {
  const { impact } = report;
  const header = palette.dim(describeHead(impact));

  if (impact.changed.length === 0) {
    return [header, '', `${palette.green('✔')} No changes to analyse.`].join('\n');
  }

  const lines: string[] = [];
  section(
    lines,
    'Changed:',
    impact.changed.map((file) => `  ${file.path}`),
    palette,
  );
  section(lines, 'Changed symbols:', changedSymbolLines(impact, palette), palette);
  section(lines, 'Directly affected:', pathsAtDistance(impact, true), palette);
  section(lines, 'Indirectly affected:', pathsAtDistance(impact, false), palette);
  section(lines, 'Affected tests:', testLines(impact, palette), palette);
  section(lines, 'Affected components:', componentLines(impact, palette), palette);
  section(lines, 'Affected API routes:', routeLines(impact, palette), palette);
  section(lines, 'Reasons:', reasonLines(impact), palette);
  section(
    lines,
    'Notes:',
    impact.notes.map((note) => palette.dim(`  ${note}`)),
    palette,
  );

  if (impact.affected.length === 0) {
    lines.push('', `${palette.green('✔')} Nothing else depends on what changed.`);
  }

  return [header, '', ...lines].join('\n');
}

/** Renders an impact analysis as pretty-printed JSON for scripts and other tools. */
export function formatImpactJson(report: ImpactReport): string {
  return JSON.stringify(report, null, JSON_INDENT);
}

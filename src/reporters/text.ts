import { type Report } from '../core/report.js';
import { type ProjectInfo } from '../core/project.js';
import { type Palette } from '../utils/color.js';

const NOT_DETECTED = 'not detected';

interface Row {
  readonly label: string;
  readonly value: string;
}

function describeProject(project: ProjectInfo): string {
  const version = project.manifest?.version;
  return version === null || version === undefined ? project.name : `${project.name}@${version}`;
}

function describePackageManager(project: ProjectInfo): string {
  if (project.packageManager === null) {
    return NOT_DETECTED;
  }
  return project.lockfile === null
    ? project.packageManager
    : `${project.packageManager} (${project.lockfile})`;
}

function buildRows(report: Report): readonly Row[] {
  const { project } = report;

  return [
    { label: 'Target', value: report.target },
    { label: 'Project', value: describeProject(project) },
    { label: 'Package manager', value: describePackageManager(project) },
    { label: 'Version control', value: project.versionControl ?? NOT_DETECTED },
    { label: 'TypeScript', value: project.typescript ? 'tsconfig.json' : NOT_DETECTED },
  ];
}

/** Renders a report as the aligned, human-facing summary shown by default. */
export function formatTextReport(report: Report, palette: Palette): string {
  const rows = buildRows(report);
  const labelWidth = rows.reduce((widest, row) => Math.max(widest, row.label.length), 0);

  const lines: string[] = [
    palette.bold(`${report.tool.name} ${report.tool.version}`),
    '',
    ...rows.map((row) => `  ${palette.dim(row.label.padEnd(labelWidth))}  ${row.value}`),
    '',
    `${palette.green('✔')} Inspected ${palette.cyan(report.project.name)}.`,
    palette.dim('  This release reports project context only; no checks were run.'),
  ];

  return lines.join('\n');
}

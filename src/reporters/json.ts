import { type Report } from '../core/report.js';

const JSON_INDENT = 2;

/** Renders a report as pretty-printed JSON for scripts and other tools. */
export function formatJsonReport(report: Report): string {
  return JSON.stringify(report, null, JSON_INDENT);
}

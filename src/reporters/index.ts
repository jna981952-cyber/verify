import { type Report } from '../core/report.js';
import { type Palette } from '../utils/color.js';
import { formatJsonReport } from './json.js';
import { formatTextReport } from './text.js';

export const REPORT_FORMATS = ['text', 'json'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export interface FormatOptions {
  readonly format: ReportFormat;
  readonly palette: Palette;
}

/**
 * Renders a report in the requested format.
 *
 * Adding an output format means adding a module here rather than touching the
 * command layer.
 */
export function formatReport(report: Report, options: FormatOptions): string {
  switch (options.format) {
    case 'json':
      return formatJsonReport(report);
    case 'text':
      return formatTextReport(report, options.palette);
  }
}

export { formatJsonReport } from './json.js';
export { formatTextReport } from './text.js';

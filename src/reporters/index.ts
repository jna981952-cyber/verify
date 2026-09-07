import { type ChangesReport, type Report } from '../core/report.js';
import { type Palette } from '../utils/color.js';
import { formatChangesJson, formatChangesText } from './changes.js';
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

/** Renders a change report in the requested format. */
export function formatChangesReport(report: ChangesReport, options: FormatOptions): string {
  switch (options.format) {
    case 'json':
      return formatChangesJson(report);
    case 'text':
      return formatChangesText(report, options.palette);
  }
}

export { describeHead, formatChangesJson, formatChangesText } from './changes.js';
export { formatJsonReport } from './json.js';
export { formatTextReport } from './text.js';

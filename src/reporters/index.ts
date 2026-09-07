import {
  type AnalysisReport,
  type ChangesReport,
  type ImpactReport,
  type Report,
} from '../core/report.js';
import { type Palette } from '../utils/color.js';
import { formatAnalysisJson, formatAnalysisText } from './analysis.js';
import { formatChangesJson, formatChangesText } from './changes.js';
import { formatImpactJson, formatImpactText } from './impact.js';
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

/** Renders an analysis report in the requested format. */
export function formatAnalysisReport(report: AnalysisReport, options: FormatOptions): string {
  switch (options.format) {
    case 'json':
      return formatAnalysisJson(report);
    case 'text':
      return formatAnalysisText(report, options.palette);
  }
}

/** Renders an impact report in the requested format. */
export function formatImpactReport(report: ImpactReport, options: FormatOptions): string {
  switch (options.format) {
    case 'json':
      return formatImpactJson(report);
    case 'text':
      return formatImpactText(report, options.palette);
  }
}

export { formatAnalysisJson, formatAnalysisText } from './analysis.js';
export { describeHead, formatChangesJson, formatChangesText } from './changes.js';
export { formatImpactJson, formatImpactText } from './impact.js';
export { formatJsonReport } from './json.js';
export { formatTextReport } from './text.js';

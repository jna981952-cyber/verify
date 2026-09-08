import { TOOL_NAME, VERSION } from '../version.js';
import { type CodebaseAnalysis } from './analysis/types.js';
import { type ChangeSet } from './git/types.js';
import { type ImpactAnalysis } from './impact/types.js';
import { type TestReport } from './testing/types.js';
import { type ProjectInfo } from './project.js';
import { type Target } from './target.js';

/** Identifies the build that produced a report. */
export interface ToolInfo {
  readonly name: string;
  readonly version: string;
}

/**
 * The result of a single `verify` run.
 *
 * This is the value both reporters render, and the shape emitted by `--json`,
 * so it doubles as the machine-readable contract of the CLI.
 */
export interface Report {
  readonly tool: ToolInfo;
  /** Absolute path that was inspected. */
  readonly target: string;
  readonly project: ProjectInfo;
}

/** Builds the report for an inspected target. */
export function createReport(target: Target, project: ProjectInfo): Report {
  return {
    tool: { name: TOOL_NAME, version: VERSION },
    target: target.path,
    project,
  };
}

/**
 * The result of a single `verify changes` run.
 *
 * Wrapping the change set in the same envelope as {@link Report} keeps both
 * `--json` payloads recognisable as output from the same tool.
 */
export interface ChangesReport {
  readonly tool: ToolInfo;
  /** Absolute path the command was pointed at. */
  readonly target: string;
  readonly changes: ChangeSet;
}

/** Builds the report for a detected set of changes. */
export function createChangesReport(target: Target, changes: ChangeSet): ChangesReport {
  return {
    tool: { name: TOOL_NAME, version: VERSION },
    target: target.path,
    changes,
  };
}

/**
 * The result of a single `verify analyze` run.
 *
 * Uses the same envelope as the other reports so every `--json` payload is
 * recognisable as output from the same tool.
 */
export interface AnalysisReport {
  readonly tool: ToolInfo;
  /** Absolute path the command was pointed at. */
  readonly target: string;
  readonly analysis: CodebaseAnalysis;
}

/** Builds the report for an analysed codebase. */
export function createAnalysisReport(target: Target, analysis: CodebaseAnalysis): AnalysisReport {
  return {
    tool: { name: TOOL_NAME, version: VERSION },
    target: target.path,
    analysis,
  };
}

/**
 * The result of a single `verify impact` run.
 *
 * Uses the same envelope as the other reports so every `--json` payload is
 * recognisable as output from the same tool.
 */
export interface ImpactReport {
  readonly tool: ToolInfo;
  /** Absolute path the command was pointed at. */
  readonly target: string;
  readonly impact: ImpactAnalysis;
}

/** Builds the report for an impact analysis. */
export function createImpactReport(target: Target, impact: ImpactAnalysis): ImpactReport {
  return {
    tool: { name: TOOL_NAME, version: VERSION },
    target: target.path,
    impact,
  };
}

/**
 * The result of a single `verify tests` run.
 *
 * Uses the same envelope as the other reports so every `--json` payload is
 * recognisable as output from the same tool.
 */
export interface TestsReport {
  readonly tool: ToolInfo;
  /** Absolute path the command was pointed at. */
  readonly target: string;
  readonly tests: TestReport;
}

/** Builds the report for a test discovery and run. */
export function createTestsReport(target: Target, tests: TestReport): TestsReport {
  return {
    tool: { name: TOOL_NAME, version: VERSION },
    target: target.path,
    tests,
  };
}

import { TOOL_NAME, VERSION } from '../version.js';
import { type ProjectInfo } from './project.js';
import { type Target } from './target.js';

/**
 * The result of a single `verify` run.
 *
 * This is the value both reporters render, and the shape emitted by `--json`,
 * so it doubles as the machine-readable contract of the CLI.
 */
export interface Report {
  readonly tool: {
    readonly name: string;
    readonly version: string;
  };
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

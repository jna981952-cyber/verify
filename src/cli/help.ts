import { TOOL_NAME, VERSION } from '../version.js';

const HELP_TEXT = `${TOOL_NAME} — checks code changes, finds what might break, and tests it before you ship.

Usage
  ${TOOL_NAME} [command] [path] [options]

Commands
  (none)           Report project context for the path
  changes          List the Git changes in the path's repository
  analyze          Inventory the JavaScript and TypeScript source in the path
  impact           Trace what the current Git changes reach

Arguments
  path             Directory to inspect (default: ".")

Options
  -h, --help       Show this help text and exit
  -v, --version    Show the version number and exit
      --json       Print the report as JSON
      --no-color   Disable coloured output
      --depth N    Hops the impact command follows (default: 3)

Exit codes
  0  Success
  1  Verification reported problems
  2  Invalid usage
  3  Unexpected internal error

Examples
  ${TOOL_NAME} .
  ${TOOL_NAME} ./packages/api --json
  ${TOOL_NAME} changes
  ${TOOL_NAME} changes ./packages/api --json
  ${TOOL_NAME} analyze ./src
  ${TOOL_NAME} analyze --json
  ${TOOL_NAME} impact
  ${TOOL_NAME} impact --depth 1 --json`;

/** Returns the full `--help` output. */
export function formatHelp(): string {
  return HELP_TEXT;
}

/** Returns the `--version` output. */
export function formatVersion(): string {
  return VERSION;
}

/** One-line pointer shown after a usage error. */
export function formatUsageHint(): string {
  return `Run \`${TOOL_NAME} --help\` for usage.`;
}

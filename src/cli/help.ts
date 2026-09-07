import { TOOL_NAME, VERSION } from '../version.js';

const HELP_TEXT = `${TOOL_NAME} — checks code changes, finds what might break, and tests it before you ship.

Usage
  ${TOOL_NAME} [path] [options]

Arguments
  path             Directory to inspect (default: ".")

Options
  -h, --help       Show this help text and exit
  -v, --version    Show the version number and exit
      --json       Print the report as JSON
      --no-color   Disable coloured output

Exit codes
  0  Success
  1  Verification reported problems
  2  Invalid usage
  3  Unexpected internal error

Examples
  ${TOOL_NAME} .
  ${TOOL_NAME} ./packages/api --json`;

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

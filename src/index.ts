/**
 * Public entry point of the package.
 *
 * The CLI is the primary interface; these exports let the same logic be reused
 * programmatically without spawning a process.
 */
export { parseCliArgs, DEFAULT_TARGET, type CliArgs, type CliMode } from './cli/args.js';
export { formatHelp, formatVersion } from './cli/help.js';
export { createDefaultContext, runCli, type CliContext } from './cli/run.js';
export { readManifest, type Manifest } from './core/manifest.js';
export {
  inspectProject,
  PACKAGE_MANAGERS,
  type PackageManager,
  type ProjectInfo,
} from './core/project.js';
export { createReport, type Report } from './core/report.js';
export { resolveTarget, resolveTargetPath, type Target } from './core/target.js';
export { formatReport, REPORT_FORMATS, type ReportFormat } from './reporters/index.js';
export { createPalette, shouldUseColor, type Palette } from './utils/color.js';
export { ExitCode, UsageError, VerifyError } from './utils/errors.js';
export { createLogger, type Logger } from './utils/logger.js';
export { TOOL_NAME, VERSION } from './version.js';

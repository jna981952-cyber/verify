/**
 * Public entry point of the package.
 *
 * The CLI is the primary interface; these exports let the same logic be reused
 * programmatically without spawning a process.
 */
export {
  parseCliArgs,
  COMMANDS,
  DEFAULT_TARGET,
  type CliArgs,
  type CliCommand,
  type CliMode,
} from './cli/args.js';
export { formatHelp, formatVersion } from './cli/help.js';
export { createDefaultContext, runCli, type CliContext } from './cli/run.js';
export {
  CHANGE_KINDS,
  CHANGE_SCOPES,
  collectChanges,
  createGitRunner,
  findRepository,
  GitCommandError,
  GitUnavailableError,
  isGitUnavailableError,
  parseDiff,
  parseHunks,
  parseNumstat,
  parseStatus,
  readDiff,
  readHead,
  readStatus,
  requireChanges,
  splitPatch,
  summarise,
  type ChangeKind,
  type ChangeScope,
  type ChangeSet,
  type ChangeSummary,
  type CollectChangesOptions,
  type DiffFile,
  type DiffHunk,
  type DiffStats,
  type FileChange,
  type GitHead,
  type GitRepository,
  type GitResult,
  type GitRunner,
  type StatusEntry,
} from './core/git/index.js';
export { readManifest, type Manifest } from './core/manifest.js';
export {
  inspectProject,
  PACKAGE_MANAGERS,
  type PackageManager,
  type ProjectInfo,
} from './core/project.js';
export {
  createChangesReport,
  createReport,
  type ChangesReport,
  type Report,
  type ToolInfo,
} from './core/report.js';
export { resolveTarget, resolveTargetPath, type Target } from './core/target.js';
export {
  formatChangesReport,
  formatReport,
  REPORT_FORMATS,
  type FormatOptions,
  type ReportFormat,
} from './reporters/index.js';
export { createPalette, shouldUseColor, type Palette } from './utils/color.js';
export { ExitCode, UsageError, VerifyError } from './utils/errors.js';
export { createLogger, type Logger } from './utils/logger.js';
export { TOOL_NAME, VERSION } from './version.js';

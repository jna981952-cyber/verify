import { requireChanges } from '../core/git/changes.js';
import { createGitRunner, type GitRunner } from '../core/git/runner.js';
import { inspectProject } from '../core/project.js';
import { createChangesReport, createReport, type ChangesReport } from '../core/report.js';
import { resolveTarget, type Target } from '../core/target.js';
import { formatChangesReport, formatReport, type FormatOptions } from '../reporters/index.js';
import { createPalette, shouldUseColor, type Palette } from '../utils/color.js';
import { ExitCode, isVerifyError, toErrorMessage } from '../utils/errors.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { TOOL_NAME } from '../version.js';
import { parseCliArgs } from './args.js';
import { formatHelp, formatUsageHint, formatVersion } from './help.js';

/**
 * Everything the command layer needs from the outside world.
 *
 * Passing it in rather than reaching for `process` keeps `runCli` a pure
 * function of its inputs, which is what makes the CLI testable end to end.
 */
export interface CliContext {
  /** Directory that relative target paths are resolved against. */
  readonly cwd: string;
  /** Environment used for colour detection. */
  readonly env: Readonly<Partial<Record<string, string>>>;
  /** Destination for all output. */
  readonly logger: Logger;
  /** Whether standard output is an interactive terminal. */
  readonly isTTY: boolean;
  /** How `git` is invoked; replaced by the tests. */
  readonly gitRunner: GitRunner;
}

/**
 * Node sets `isTTY` to `true` on terminals and leaves it `undefined` elsewhere,
 * even though the bundled type declarations promise a boolean.
 */
function detectTTY(stream: { isTTY?: boolean }): boolean {
  return stream.isTTY ?? false;
}

/** Builds the context backed by the real process. */
export function createDefaultContext(): CliContext {
  return {
    cwd: process.cwd(),
    env: process.env,
    logger: createLogger({ stdout: process.stdout, stderr: process.stderr }),
    isTTY: detectTTY(process.stdout),
    gitRunner: createGitRunner(),
  };
}

function reportError(error: unknown, logger: Logger, palette: Palette): ExitCode {
  const exitCode = isVerifyError(error) ? error.exitCode : ExitCode.Internal;

  logger.err(`${palette.red(`${TOOL_NAME}:`)} ${toErrorMessage(error)}`);
  if (exitCode === ExitCode.Usage) {
    logger.err(palette.dim(formatUsageHint()));
  }

  return exitCode;
}

async function buildChangesReport(target: Target, context: CliContext): Promise<ChangesReport> {
  const changes = await requireChanges(target.path, { runner: context.gitRunner });
  return createChangesReport(target, changes);
}

/**
 * Runs the CLI end to end and returns the process exit code.
 *
 * Never throws: every failure is turned into a message on standard error and a
 * non-zero exit code.
 */
export async function runCli(
  argv: readonly string[],
  overrides: Partial<CliContext> = {},
): Promise<ExitCode> {
  const context: CliContext = { ...createDefaultContext(), ...overrides };
  const { logger } = context;

  // Colour is resolved before parsing so that errors about malformed
  // arguments still honour `--no-color`.
  const palette = createPalette(
    shouldUseColor({
      noColorFlag: argv.includes('--no-color'),
      env: context.env,
      isTTY: context.isTTY,
    }),
  );

  try {
    const args = parseCliArgs(argv);

    if (args.mode === 'help') {
      logger.out(formatHelp());
      return ExitCode.Success;
    }

    if (args.mode === 'version') {
      logger.out(formatVersion());
      return ExitCode.Success;
    }

    const format: FormatOptions = { format: args.json ? 'json' : 'text', palette };
    const target = await resolveTarget(args.target, context.cwd);

    logger.out(
      args.mode === 'changes'
        ? formatChangesReport(await buildChangesReport(target, context), format)
        : formatReport(createReport(target, await inspectProject(target)), format),
    );
    return ExitCode.Success;
  } catch (error) {
    return reportError(error, logger, palette);
  }
}

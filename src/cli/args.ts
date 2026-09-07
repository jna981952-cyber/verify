import { parseArgs } from 'node:util';

import { UsageError, toErrorMessage } from '../utils/errors.js';

/** Subcommands the CLI understands. */
export const COMMANDS = ['changes', 'analyze', 'impact'] as const;

/** Union of the recognised subcommands. */
export type CliCommand = (typeof COMMANDS)[number];

/** What the invocation asked the CLI to do. */
export type CliMode = 'help' | 'version' | 'inspect' | CliCommand;

/** Normalised view of the command line. */
export interface CliArgs {
  readonly mode: CliMode;
  /** Path to inspect, exactly as typed by the user. */
  readonly target: string;
  /** Emit the report as JSON instead of text. */
  readonly json: boolean;
  /** Suppress ANSI colour regardless of terminal support. */
  readonly noColor: boolean;
  /** Hops to follow when tracing impact, or `null` to use the default. */
  readonly depth: number | null;
}

/** Directory inspected when the user does not pass one. */
export const DEFAULT_TARGET = '.';

const OPTIONS = {
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
  json: { type: 'boolean', default: false },
  'no-color': { type: 'boolean', default: false },
  depth: { type: 'string' },
} as const;

/**
 * Reads `--depth`, which must be a whole number of hops.
 *
 * The digits are matched rather than the value being coerced: `Number` accepts
 * an empty string, hexadecimal and surrounding whitespace, none of which anyone
 * typing a depth meant.
 *
 * @throws {UsageError} If the value is not a non-negative whole number.
 */
function parseDepth(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    throw new UsageError(`--depth must be a whole number of hops, but received: ${value}`);
  }

  return Number(value);
}

function isCommand(value: string): value is CliCommand {
  return (COMMANDS as readonly string[]).includes(value);
}

/**
 * Splits the positional arguments into a subcommand and a path.
 *
 * Without a leading subcommand the first positional is the path, which is what
 * keeps plain `verify .` working exactly as it did before subcommands existed.
 * A directory genuinely named after a command can still be reached by spelling
 * the path out, as in `verify ./changes`.
 *
 * @throws {UsageError} If more paths were given than the invocation accepts.
 */
function splitPositionals(positionals: readonly string[]): {
  command: CliCommand | null;
  target: string;
} {
  const first = positionals[0];
  const command = first !== undefined && isCommand(first) ? first : null;
  const paths = command === null ? positionals : positionals.slice(1);

  if (paths.length > 1) {
    const context = command === null ? '' : ` for \`${command}\``;
    throw new UsageError(
      `Expected at most one path${context} but received ${String(paths.length)}: ${paths.join(', ')}`,
    );
  }

  return { command, target: paths[0] ?? DEFAULT_TARGET };
}

function resolveMode(help: boolean, version: boolean, command: CliCommand | null): CliMode {
  if (help) {
    return 'help';
  }
  if (version) {
    return 'version';
  }
  return command ?? 'inspect';
}

/**
 * Parses raw `process.argv` fragments into {@link CliArgs}.
 *
 * Uses Node's built-in `parseArgs` so the CLI needs no argument-parsing
 * dependency; unknown flags surface as {@link UsageError}.
 *
 * @throws {UsageError} On unknown options or too many positional paths.
 */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  let values: { readonly [K in keyof typeof OPTIONS]?: boolean | string };
  let positionals: string[];

  try {
    const parsed = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (cause) {
    throw new UsageError(toErrorMessage(cause), { cause });
  }

  const { command, target } = splitPositionals(positionals);
  if (target.trim() === '') {
    throw new UsageError('The target path must not be empty.');
  }

  return {
    mode: resolveMode(values.help === true, values.version === true, command),
    target,
    json: values.json === true,
    noColor: values['no-color'] === true,
    depth: parseDepth(typeof values.depth === 'string' ? values.depth : undefined),
  };
}

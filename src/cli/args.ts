import { parseArgs } from 'node:util';

import { UsageError, toErrorMessage } from '../utils/errors.js';

/** What the invocation asked the CLI to do. */
export type CliMode = 'help' | 'version' | 'inspect';

/** Normalised view of the command line. */
export interface CliArgs {
  readonly mode: CliMode;
  /** Path to inspect, exactly as typed by the user. */
  readonly target: string;
  /** Emit the report as JSON instead of text. */
  readonly json: boolean;
  /** Suppress ANSI colour regardless of terminal support. */
  readonly noColor: boolean;
}

/** Directory inspected when the user does not pass one. */
export const DEFAULT_TARGET = '.';

const OPTIONS = {
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
  json: { type: 'boolean', default: false },
  'no-color': { type: 'boolean', default: false },
} as const;

function resolveMode(help: boolean, version: boolean): CliMode {
  if (help) {
    return 'help';
  }
  if (version) {
    return 'version';
  }
  return 'inspect';
}

/**
 * Parses raw `process.argv` fragments into {@link CliArgs}.
 *
 * Uses Node's built-in `parseArgs` so the CLI needs no argument-parsing
 * dependency; unknown flags surface as {@link UsageError}.
 *
 * @throws {UsageError} On unknown options or more than one positional path.
 */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  let values: Partial<Record<keyof typeof OPTIONS, boolean>>;
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

  if (positionals.length > 1) {
    throw new UsageError(
      `Expected at most one path but received ${String(positionals.length)}: ${positionals.join(', ')}`,
    );
  }

  const target = positionals[0] ?? DEFAULT_TARGET;
  if (target.trim() === '') {
    throw new UsageError('The target path must not be empty.');
  }

  return {
    mode: resolveMode(values.help ?? false, values.version ?? false),
    target,
    json: values.json ?? false,
    noColor: values['no-color'] ?? false,
  };
}

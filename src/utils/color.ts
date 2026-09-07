/**
 * A very small ANSI styling helper.
 *
 * A dependency-free palette keeps the install footprint at zero runtime
 * packages; when colour is disabled every function is the identity function so
 * call sites never need to branch.
 */
export interface Palette {
  bold(text: string): string;
  dim(text: string): string;
  red(text: string): string;
  green(text: string): string;
  cyan(text: string): string;
}

export interface ColorSupportOptions {
  /** True when the user passed `--no-color`. */
  noColorFlag: boolean;
  /** Environment to inspect for `NO_COLOR` / `FORCE_COLOR` / `TERM`. */
  env: Readonly<Partial<Record<string, string>>>;
  /** Whether the destination stream is an interactive terminal. */
  isTTY: boolean;
}

const CSI = '\u001b[';

const identity = (text: string): string => text;

function wrap(open: number, close: number): (text: string) => string {
  return (text: string): string => `${CSI}${String(open)}m${text}${CSI}${String(close)}m`;
}

const PLAIN_PALETTE: Palette = {
  bold: identity,
  dim: identity,
  red: identity,
  green: identity,
  cyan: identity,
};

const ANSI_PALETTE: Palette = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  cyan: wrap(36, 39),
};

/**
 * Decides whether ANSI escapes should be emitted.
 *
 * Precedence, highest first: the `--no-color` flag, `NO_COLOR`, `FORCE_COLOR`,
 * a dumb terminal, then whether the stream is a TTY. See https://no-color.org.
 */
export function shouldUseColor(options: ColorSupportOptions): boolean {
  const { noColorFlag, env, isTTY } = options;

  if (noColorFlag) {
    return false;
  }

  const noColor = env['NO_COLOR'];
  if (typeof noColor === 'string' && noColor !== '') {
    return false;
  }

  const forceColor = env['FORCE_COLOR'];
  if (typeof forceColor === 'string' && forceColor !== '' && forceColor !== '0') {
    return true;
  }

  if (env['TERM'] === 'dumb') {
    return false;
  }

  return isTTY;
}

/** Returns the ANSI palette when enabled, otherwise a pass-through palette. */
export function createPalette(enabled: boolean): Palette {
  return enabled ? ANSI_PALETTE : PLAIN_PALETTE;
}

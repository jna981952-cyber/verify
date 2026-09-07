import { builtinModules } from 'node:module';
import { posix } from 'node:path';

/** Extensions tried, in order, when a specifier has none of its own. */
const APPENDED_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const;

/**
 * Extensions a written specifier may stand in for.
 *
 * Under Node's ESM resolution a TypeScript file imports its sibling as
 * `./cart.js` even though only `cart.ts` exists, so the written extension has
 * to be tried against its TypeScript counterparts too.
 */
const SUBSTITUTED_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

const BUILTINS = new Set(builtinModules);

/** True for a specifier that names a path rather than a package. */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || /^\.{1,2}\//.test(specifier);
}

/** True for a Node built-in such as `node:fs` or `path`. */
export function isBuiltinSpecifier(specifier: string): boolean {
  if (specifier.startsWith('node:')) {
    return true;
  }
  return BUILTINS.has(specifier) || BUILTINS.has(specifier.split('/')[0] ?? specifier);
}

/**
 * Paths a specifier could mean, in the order they should be tried.
 *
 * An exact match wins, then a substituted extension, then an appended one, then
 * a directory's index file — the same precedence a bundler applies, so the
 * first hit is the file the runtime would load.
 */
export function resolutionCandidates(fromFile: string, specifier: string): readonly string[] {
  const base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  const candidates = [base];

  const written = APPENDED_EXTENSIONS.find((known) => base.endsWith(known));
  if (written !== undefined) {
    const stem = base.slice(0, -written.length);
    for (const substitute of SUBSTITUTED_EXTENSIONS[written] ?? []) {
      candidates.push(`${stem}${substitute}`);
    }
  }

  for (const appended of APPENDED_EXTENSIONS) {
    candidates.push(`${base}${appended}`);
  }
  for (const appended of APPENDED_EXTENSIONS) {
    candidates.push(posix.join(base, `index${appended}`));
  }

  return candidates;
}

/**
 * Resolves a relative specifier against the files that were analysed.
 *
 * Matching against the known file list rather than the filesystem keeps the
 * result deterministic and confines the graph to the codebase in front of it;
 * a specifier pointing outside that set is reported as unresolved rather than
 * guessed at.
 */
export function resolveSpecifier(
  fromFile: string,
  specifier: string,
  files: ReadonlySet<string>,
): string | null {
  if (!isRelativeSpecifier(specifier)) {
    return null;
  }

  for (const candidate of resolutionCandidates(fromFile, specifier)) {
    if (files.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

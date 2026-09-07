import ts from 'typescript';

import { type Language } from './types.js';

/** File extensions the analyser reads. */
export const SOURCE_EXTENSIONS = [
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
] as const;

/**
 * How each extension is parsed.
 *
 * TypeScript parses every JavaScript variant with JSX enabled, so a `.js` file
 * holding JSX is read correctly without the author having renamed it.
 */
const SCRIPT_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
  '.js': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
};

const LANGUAGES: Readonly<Record<string, Language>> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
};

/** Returns the lower-cased extension of a path, including the leading dot. */
export function extensionOf(path: string): string {
  const separator = path.lastIndexOf('.');
  return separator === -1 ? '' : path.slice(separator).toLowerCase();
}

/** True when the analyser knows how to read the file at `path`. */
export function isSourcePath(path: string): boolean {
  return extensionOf(path) in SCRIPT_KINDS;
}

/** Returns the language of a path, or `null` when it is not a source file. */
export function languageOf(path: string): Language | null {
  return LANGUAGES[extensionOf(path)] ?? null;
}

/** True for a TypeScript declaration file, which declares rather than defines. */
export function isDeclarationPath(path: string): boolean {
  return /\.d\.[cm]?ts$/i.test(path);
}

/**
 * Parses one file into a syntax tree.
 *
 * Nothing is type-checked and no program is created, so the result depends only
 * on the text handed in. TypeScript's parser recovers from broken syntax rather
 * than throwing, which is what lets a malformed file yield whatever could still
 * be read instead of failing the run.
 */
export function parseSource(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    SCRIPT_KINDS[extensionOf(path)] ?? ts.ScriptKind.TS,
  );
}

/** Converts a node's start offset into a 1-based line and column. */
export function locationOf(
  source: ts.SourceFile,
  node: ts.Node,
): {
  line: number;
  column: number;
} {
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { line: line + 1, column: character + 1 };
}

/** The lines a node covers: where it starts, and the last line it reaches. */
export interface NodeSpan {
  readonly location: { readonly line: number; readonly column: number };
  readonly endLine: number;
}

/** Measures the range of lines a node occupies. */
export function spanOf(source: ts.SourceFile, node: ts.Node): NodeSpan {
  const location = locationOf(source, node);
  const { line } = source.getLineAndCharacterOfPosition(node.getEnd());
  return { location, endLine: Math.max(line + 1, location.line) };
}

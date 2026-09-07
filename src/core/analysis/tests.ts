import ts from 'typescript';

import { accessPath, literalText, walk } from './ast.js';
import { locationOf } from './parser.js';
import { type TestCase, type TestKind } from './types.js';

/** Functions that group tests. */
const SUITE_FUNCTIONS = new Set(['describe', 'suite', 'context']);

/** Functions that declare a single test. */
const CASE_FUNCTIONS = new Set(['it', 'test', 'bench', 'fit', 'xit', 'specify']);

/**
 * Paths that mark a file as a test.
 *
 * Covers the two conventions in wide use: a `.test.` or `.spec.` infix, and a
 * `__tests__` directory.
 */
const TEST_PATH = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i;

/** True when the path follows a test naming convention. */
export function isTestPath(path: string): boolean {
  return TEST_PATH.test(path);
}

/**
 * Reads the base function of a test call.
 *
 * Modifiers are part of the API rather than the name, so `it.only`, `test.skip`
 * and `describe.each` all resolve to their base while the written form is kept
 * for reporting.
 */
function testFunction(callee: string): { base: string; kind: TestKind } | null {
  const base = callee.split('.')[0] ?? '';

  if (SUITE_FUNCTIONS.has(base)) {
    return { base, kind: 'suite' };
  }
  if (CASE_FUNCTIONS.has(base)) {
    return { base, kind: 'case' };
  }
  return null;
}

/**
 * Collects the test declarations in a file.
 *
 * The whole tree is walked because tests nest inside suites, and a title that
 * is not a plain string is reported as `null` rather than guessed at.
 */
export function collectTests(source: ts.SourceFile): readonly TestCase[] {
  const tests: TestCase[] = [];

  walk(source, (node) => {
    if (!ts.isCallExpression(node) || node.arguments.length === 0) {
      return;
    }

    const callee = accessPath(node.expression);
    if (callee === null) {
      return;
    }

    const matched = testFunction(callee);
    if (matched === null) {
      return;
    }

    tests.push({
      name: literalText(node.arguments[0]),
      kind: matched.kind,
      callee,
      location: locationOf(source, node),
    });
  });

  return tests;
}

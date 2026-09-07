import assert from 'node:assert/strict';

/**
 * Returns one element of an array, failing the test when it is not there.
 *
 * `noUncheckedIndexedAccess` makes indexing return `T | undefined`, and
 * narrowing that with an assertion per property quickly buries what a test is
 * actually checking; this keeps the check to a single line.
 */
export function elementAt<T>(items: readonly T[], index = 0): T {
  const item = items[index];
  assert.ok(item !== undefined, `expected an element at index ${String(index)}`);
  return item;
}

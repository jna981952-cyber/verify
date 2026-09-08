import { type CodebaseAnalysis } from '../analysis/types.js';
import { detectFramework } from './framework.js';
import { locateRunner } from './locate.js';
import { type DiscoveredFile, type TestDiscovery } from './types.js';

/**
 * Reads the test files out of a codebase analysis.
 *
 * Selection follows the naming conventions both runners use by default — a
 * `.test.` or `.spec.` infix, or a `__tests__` directory — which is what
 * Stage 3 already recognises. A runner pointed at other patterns by its config
 * will see a different set, and that is a difference this cannot close without
 * running the runner.
 */
export function collectTestFiles(analysis: CodebaseAnalysis): readonly DiscoveredFile[] {
  return analysis.files
    .filter((file) => file.testFile)
    .map((file) => ({
      path: file.path,
      tests: file.tests
        .filter((test) => test.name !== null)
        .map((test) => ({
          title: test.name ?? '',
          suite: test.kind === 'suite',
          line: test.location.line,
        })),
    }));
}

/** Counts the test declarations that are cases rather than suites. */
export function countTests(files: readonly DiscoveredFile[]): number {
  return files.reduce((total, file) => total + file.tests.filter((test) => !test.suite).length, 0);
}

/**
 * Finds a project's test runner and the files it would run.
 *
 * Everything here comes from reading the project: no runner is executed, so
 * discovery works the same whether or not one is installed.
 */
export async function discoverTests(
  root: string,
  analysis: CodebaseAnalysis,
): Promise<TestDiscovery> {
  const detection = await detectFramework(root);
  const runner = detection === null ? null : await locateRunner(root, detection.framework);
  const files = collectTestFiles(analysis);

  return { detection, runner, files, tests: countTests(files) };
}

/**
 * Test discovery and execution.
 *
 * The modules underneath split the work by concern — recognising the runner,
 * finding it on disk, reading the test files, choosing which to run, running
 * one, and reading what it reported — and this barrel is what the rest of the
 * tool imports.
 */
export { collectTestFiles, countTests, discoverTests } from './discover.js';
export { exitCodeFor, runTests, type RunTestsOptions } from './engine.js';
export { detectFramework } from './framework.js';
export { locateIn, locateRunner } from './locate.js';
export { parseRunnerOutput, summarise, toFailure, toProjectPath } from './parse.js';
export {
  createProcessRunner,
  MAX_CAPTURED_OUTPUT,
  TERMINATION_GRACE_MS,
  type ProcessRequest,
  type ProcessResult,
  type ProcessRunner,
} from './process.js';
export {
  buildArgs,
  buildEnv,
  DEFAULT_TIMEOUT_MS,
  executeRun,
  outcomeOf,
  runInTempDirectory,
  type RunRequest,
} from './run.js';
export { selectTests, type SelectOptions } from './select.js';
export {
  FRAMEWORK_EVIDENCE,
  RUN_OUTCOMES,
  SELECTION_MODES,
  TEST_FRAMEWORKS,
  TEST_STATUSES,
  type DiscoveredFile,
  type DiscoveredTest,
  type FrameworkDetection,
  type FrameworkEvidence,
  type RunnerLocation,
  type RunOutcome,
  type SelectedFile,
  type SelectionMode,
  type TestCaseResult,
  type TestDiscovery,
  type TestFailure,
  type TestFileResult,
  type TestFramework,
  type TestReport,
  type TestRun,
  type TestRunSummary,
  type TestSelection,
  type TestStatus,
} from './types.js';

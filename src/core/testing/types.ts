/**
 * Typed models describing test discovery and execution.
 *
 * The shapes here are the tool's own: Vitest and Jest report their results
 * differently, and everything downstream — reporters, exit codes, JSON output —
 * speaks this vocabulary instead of either runner's.
 */

/** Test runners the engine knows how to drive. */
export const TEST_FRAMEWORKS = ['vitest', 'jest'] as const;

/** Union of the supported test runners. */
export type TestFramework = (typeof TEST_FRAMEWORKS)[number];

/** How a runner was recognised. */
export const FRAMEWORK_EVIDENCE = ['dependency', 'config-file', 'manifest-field'] as const;

/** Union of the ways a runner can be recognised. */
export type FrameworkEvidence = (typeof FRAMEWORK_EVIDENCE)[number];

/** Which runner a project uses, and what said so. */
export interface FrameworkDetection {
  readonly framework: TestFramework;
  readonly evidence: FrameworkEvidence;
  /** What was read to reach the conclusion, relative to the project root. */
  readonly source: string;
}

/** Where a runner's executable lives. */
export interface RunnerLocation {
  readonly framework: TestFramework;
  /** Absolute path to the runner's JavaScript entry point. */
  readonly entry: string;
  /** Absolute path to the package directory the entry came from. */
  readonly packageDirectory: string;
  /** Version from the runner's own manifest, when it declares one. */
  readonly version: string | null;
}

/** A single test declaration found by reading the source. */
export interface DiscoveredTest {
  /** Title exactly as written. */
  readonly title: string;
  /** Whether the declaration groups other tests or is one itself. */
  readonly suite: boolean;
  readonly line: number;
}

/** A test file found by reading the source. */
export interface DiscoveredFile {
  /** Path relative to the project root, using forward slashes. */
  readonly path: string;
  readonly tests: readonly DiscoveredTest[];
}

/** What reading the source turned up. */
export interface TestDiscovery {
  /** Runner the project uses, `null` when none could be recognised. */
  readonly detection: FrameworkDetection | null;
  /** Where that runner is installed, `null` when it is not. */
  readonly runner: RunnerLocation | null;
  /** Test files, sorted by path. */
  readonly files: readonly DiscoveredFile[];
  /** Total number of test declarations across every file. */
  readonly tests: number;
}

/** How the tests to run were chosen. */
export const SELECTION_MODES = ['all', 'impacted'] as const;

/** Union of the recognised selection modes. */
export type SelectionMode = (typeof SELECTION_MODES)[number];

/** One selected test file and why it was selected. */
export interface SelectedFile {
  /** Path relative to the project root, using forward slashes. */
  readonly path: string;
  /** One sentence explaining the selection, `null` when everything was selected. */
  readonly reason: string | null;
}

/** Which tests the run was pointed at. */
export interface TestSelection {
  readonly mode: SelectionMode;
  readonly files: readonly SelectedFile[];
  /** Name filter passed to the runner, `null` when none was given. */
  readonly pattern: string | null;
  /** Test declarations the selected files hold, counted from the source. */
  readonly tests: number;
}

/** What a runner said about one test. */
export const TEST_STATUSES = ['passed', 'failed', 'skipped', 'todo'] as const;

/** Union of the recognised per-test statuses. */
export type TestStatus = (typeof TEST_STATUSES)[number];

/**
 * What a runner reported about a failing test.
 *
 * The text is passed through as the runner produced it. It says a test did not
 * pass; it does not say the product is wrong, and nothing here decides which.
 */
export interface TestFailure {
  /** First line of the runner's message, for a one-line summary. */
  readonly message: string;
  /** Full text the runner printed, stack trace included. */
  readonly detail: string;
}

/** One test, as the runner reported it. */
export interface TestCaseResult {
  /** Path relative to the project root, using forward slashes. */
  readonly file: string;
  /** Title of the test itself. */
  readonly title: string;
  /** Enclosing suite titles, outermost first. */
  readonly suites: readonly string[];
  /** Full name the runner used, suites and title together. */
  readonly name: string;
  readonly status: TestStatus;
  /** How long the test took, `null` when the runner did not say. */
  readonly durationMs: number | null;
  readonly failures: readonly TestFailure[];
}

/** One test file, as the runner reported it. */
export interface TestFileResult {
  /** Path relative to the project root, using forward slashes. */
  readonly path: string;
  readonly status: TestStatus;
  readonly durationMs: number | null;
  /** File-level message, such as an import that threw before any test ran. */
  readonly message: string | null;
  readonly tests: readonly TestCaseResult[];
}

/** How a whole run ended. */
export const RUN_OUTCOMES = ['pass', 'fail', 'error', 'timeout'] as const;

/**
 * Union of the recognised run outcomes.
 *
 * `pass` and `fail` mean the runner ran and reported; `error` means it could
 * not be run or its output could not be read; `timeout` means it was still
 * going when the time allowed ran out and was stopped.
 */
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

/** Counts across every test a run reported. */
export interface TestRunSummary {
  readonly files: number;
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly todo: number;
}

/** Everything one execution of a runner produced. */
export interface TestRun {
  readonly framework: TestFramework;
  /** Argument list the runner was invoked with, for the record. */
  readonly command: readonly string[];
  readonly outcome: RunOutcome;
  /** Process exit status, `null` when it was terminated by a signal. */
  readonly exitCode: number | null;
  /** Signal that ended the process, `null` when it exited on its own. */
  readonly signal: string | null;
  /** Wall-clock time the process took. */
  readonly durationMs: number;
  /** How long the run was allowed before being stopped. */
  readonly timeoutMs: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Files the runner reported, sorted by path. */
  readonly files: readonly TestFileResult[];
  readonly summary: TestRunSummary;
  /** Why the run could not be read, `null` when it could. */
  readonly error: string | null;
}

/** Everything Stage 5 can say about a project's tests. */
export interface TestReport {
  /** Absolute path to the project the tests belong to. */
  readonly root: string;
  readonly discovery: TestDiscovery;
  readonly selection: TestSelection;
  /**
   * True when running the tests was asked for.
   *
   * A discovery-only pass leaves this false, which is what separates "nothing
   * ran because nothing was meant to" from "nothing ran because it could not".
   */
  readonly attempted: boolean;
  /** The run, `null` when nothing was run. */
  readonly run: TestRun | null;
  /** Caveats that apply to this particular run, in words meant for a person. */
  readonly notes: readonly string[];
}

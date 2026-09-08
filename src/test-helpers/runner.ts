import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { createFixture, type Fixture } from './fixtures.js';

/** What a stand-in runner should do when it is executed. */
export interface RunnerBehaviour {
  /** Status the process exits with. */
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  /** Milliseconds to wait before exiting, for exercising the timeout. */
  readonly delayMs?: number;
  /** Payload written to the path given by `--outputFile`. */
  readonly results?: unknown;
  /** Write text that is not JSON instead of the payload. */
  readonly malformedOutput?: boolean;
}

/** A project set up with a stand-in test runner. */
export interface RunnerProject extends Fixture {
  /** Absolute path to the project root, which may differ from the fixture root. */
  readonly root: string;
  /** Arguments the stand-in runner was last invoked with. */
  invocation(): Promise<readonly string[] | null>;
}

/**
 * The stand-in runner.
 *
 * It reads what it should do from a file beside itself, records the arguments
 * it was given, and writes results in the shape Vitest and Jest both use. That
 * is enough to drive the whole engine — spawning, capturing, timing out,
 * terminating and parsing — without either runner being installed.
 */
const DOUBLE_SOURCE = `import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const behaviour = JSON.parse(readFileSync(join(here, 'behaviour.json'), 'utf8'));
const args = process.argv.slice(2);

writeFileSync(join(here, 'invocation.json'), JSON.stringify(args), 'utf8');

if (typeof behaviour.stdout === 'string') {
  process.stdout.write(behaviour.stdout);
}
if (typeof behaviour.stderr === 'string') {
  process.stderr.write(behaviour.stderr);
}

const outputFlag = args.find((arg) => arg.startsWith('--outputFile='));
const outputFile = outputFlag === undefined ? null : outputFlag.slice('--outputFile='.length);

function finish() {
  if (outputFile !== null && behaviour.results !== undefined) {
    const text = behaviour.malformedOutput === true ? '{ this is not json' : JSON.stringify(behaviour.results);
    writeFileSync(outputFile, text, 'utf8');
  }
  process.exit(typeof behaviour.exitCode === 'number' ? behaviour.exitCode : 0);
}

if (typeof behaviour.delayMs === 'number' && behaviour.delayMs > 0) {
  setTimeout(finish, behaviour.delayMs);
} else {
  finish();
}
`;

/**
 * The files that make up an installed stand-in runner.
 *
 * Exposed as plain files so any fixture — a Git repository included — can hold
 * one without this helper needing to know how that fixture is built.
 */
export function runnerDoubleFiles(
  framework: 'vitest' | 'jest',
  behaviour: RunnerBehaviour,
): Readonly<Record<string, string>> {
  const directory = `node_modules/${framework}`;

  return {
    [`${directory}/package.json`]: `${JSON.stringify(
      {
        name: framework,
        version: '0.0.0-fixture',
        type: 'module',
        bin: { [framework]: './double.mjs' },
      },
      null,
      2,
    )}\n`,
    [`${directory}/double.mjs`]: DOUBLE_SOURCE,
    [`${directory}/behaviour.json`]: `${JSON.stringify(behaviour, null, 2)}\n`,
  };
}

/** Options accepted by {@link createRunnerProject}. */
export interface RunnerProjectOptions {
  /** Runner the project declares as a dependency. */
  readonly framework: 'vitest' | 'jest';
  /** Files placed in the project, keyed by path relative to its root. */
  readonly files?: Readonly<Record<string, string>>;
  /** How the stand-in behaves; omit to leave the runner uninstalled. */
  readonly behaviour?: RunnerBehaviour | null;
  /** Directory the project sits in, relative to the fixture root. */
  readonly directory?: string;
  /** Extra manifest fields, merged over the generated ones. */
  readonly manifest?: Readonly<Record<string, unknown>>;
}

async function write(root: string, relativePath: string, contents: string): Promise<void> {
  const absolute = join(root, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, 'utf8');
}

/**
 * Creates a throwaway project that declares a test runner and, optionally,
 * has one installed.
 *
 * The installed runner is a stand-in: a small script the engine finds the same
 * way it finds the real thing, through the `bin` field of a package in
 * `node_modules`. That keeps the integration tests honest — a real process is
 * spawned and its real output is read — without either runner being a
 * dependency of this project.
 */
export async function createRunnerProject(options: RunnerProjectOptions): Promise<RunnerProject> {
  const fixture = await createFixture();
  const root =
    options.directory === undefined ? fixture.path : join(fixture.path, options.directory);
  const packageDirectory = join(root, 'node_modules', options.framework);

  await write(
    root,
    'package.json',
    `${JSON.stringify(
      {
        name: 'fixture-project',
        version: '1.0.0',
        private: true,
        devDependencies: { [options.framework]: '^1.0.0' },
        ...options.manifest,
      },
      null,
      2,
    )}\n`,
  );

  for (const [path, contents] of Object.entries(options.files ?? {})) {
    await write(root, path, contents);
  }

  if (options.behaviour !== null && options.behaviour !== undefined) {
    for (const [path, contents] of Object.entries(
      runnerDoubleFiles(options.framework, options.behaviour),
    )) {
      await write(root, path, contents);
    }
  }

  return {
    path: fixture.path,
    root,
    cleanup: fixture.cleanup.bind(fixture),
    invocation: async () => {
      try {
        const contents = await readFile(join(packageDirectory, 'invocation.json'), 'utf8');
        const parsed: unknown = JSON.parse(contents);
        return Array.isArray(parsed) ? parsed.filter((arg) => typeof arg === 'string') : null;
      } catch {
        return null;
      }
    },
  };
}

/** Builds a results payload in the shape Vitest and Jest both write. */
export function runnerResults(
  files: readonly {
    readonly name: string;
    readonly tests?: readonly {
      readonly title: string;
      readonly status: 'passed' | 'failed' | 'pending' | 'todo';
      readonly ancestorTitles?: readonly string[];
      readonly duration?: number;
      readonly failureMessages?: readonly string[];
    }[];
    readonly message?: string;
    readonly startTime?: number;
    readonly endTime?: number;
  }[],
): Record<string, unknown> {
  return {
    success: files.every((file) => (file.tests ?? []).every((test) => test.status !== 'failed')),
    startTime: 0,
    testResults: files.map((file) => ({
      name: file.name,
      status: (file.tests ?? []).some((test) => test.status === 'failed') ? 'failed' : 'passed',
      startTime: file.startTime ?? 0,
      endTime: file.endTime ?? 0,
      message: file.message ?? '',
      assertionResults: (file.tests ?? []).map((test) => ({
        ancestorTitles: test.ancestorTitles ?? [],
        title: test.title,
        fullName: [...(test.ancestorTitles ?? []), test.title].join(' > '),
        status: test.status,
        duration: test.duration ?? 0,
        failureMessages: test.failureMessages ?? [],
      })),
    })),
  };
}

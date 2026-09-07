import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { createFixture, type Fixture, type FixtureFiles } from './fixtures.js';

/** A throwaway Git repository the tests can drive. */
export interface GitFixture extends Fixture {
  /** Runs `git` inside the repository and returns its standard output. */
  git(...args: string[]): Promise<string>;
  /** Writes a text file, creating parent directories as needed. */
  write(relativePath: string, contents: string): Promise<void>;
  /** Writes raw bytes, for content git will treat as binary. */
  writeBytes(relativePath: string, contents: Uint8Array): Promise<void>;
  /** Deletes a file from the working tree. */
  remove(relativePath: string): Promise<void>;
  /** Stages everything and records a commit. */
  commit(message: string): Promise<void>;
}

/** Fixed identity and timestamps, so commits are reproducible run to run. */
const AUTHOR = {
  GIT_AUTHOR_NAME: 'Verify Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'Verify Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
} as const;

/**
 * Runs git with the developer's own configuration held at arm's length.
 *
 * System and global config are switched off and `HOME` is redirected into the
 * fixture, so a signing key or an unusual `core.autocrlf` on the machine
 * running the suite cannot change what the tests observe.
 */
function runGit(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...AUTHOR,
          HOME: cwd,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: join(cwd, '.absent-gitconfig'),
          GIT_TERMINAL_PROMPT: '0',
        },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
        } else {
          reject(new Error(`git ${args.join(' ')} failed: ${stderr || error.message}`));
        }
      },
    );
  });
}

async function writeInto(
  root: string,
  relativePath: string,
  contents: string | Uint8Array,
): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

/** Repository-local settings that pin behaviour the tests depend on. */
const LOCAL_CONFIG: readonly (readonly [string, string])[] = [
  ['user.name', AUTHOR.GIT_AUTHOR_NAME],
  ['user.email', AUTHOR.GIT_AUTHOR_EMAIL],
  ['commit.gpgsign', 'false'],
  ['core.autocrlf', 'false'],
  ['core.safecrlf', 'false'],
];

/**
 * Creates a temporary directory, initialises a repository in it, and writes the
 * given files into the working tree without committing them.
 *
 * The branch is named explicitly rather than left to `init.defaultBranch`, so
 * assertions about the current branch hold on every git version.
 */
export async function createGitFixture(files: FixtureFiles = {}): Promise<GitFixture> {
  const fixture = await createFixture(files);
  const { path: root } = fixture;

  await runGit(root, ['-c', 'init.defaultBranch=main', 'init', '--quiet']);
  await runGit(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  for (const [key, value] of LOCAL_CONFIG) {
    await runGit(root, ['config', key, value]);
  }

  return {
    path: root,
    git: async (...args: string[]) => runGit(root, args),
    write: async (relativePath: string, contents: string) => {
      await writeInto(root, relativePath, contents);
    },
    writeBytes: async (relativePath: string, contents: Uint8Array) => {
      await writeInto(root, relativePath, contents);
    },
    remove: async (relativePath: string) => {
      await rm(join(root, relativePath), { force: true });
    },
    commit: async (message: string) => {
      await runGit(root, ['add', '--all']);
      await runGit(root, ['commit', '--quiet', '--no-gpg-sign', '--message', message]);
    },
    cleanup: fixture.cleanup.bind(fixture),
  };
}

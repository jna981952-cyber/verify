# verify

> Checks code changes, finds what might break, and tests it before you ship.

[![CI](https://github.com/jna981952-cyber/verify/actions/workflows/ci.yml/badge.svg)](https://github.com/jna981952-cyber/verify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

`verify` is a command line tool for finding out whether a change is safe to ship.

## Project status

**Stage 2 — Git change detection.** On top of the Stage 1 foundation — argument
handling, project detection, reporting and the toolchain — `verify` now reads a
repository's working tree: which branch and commit it sits on, which files were
added, modified, deleted or renamed, whether each change is staged, and which
lines moved. It reports what changed. It does not yet judge what those changes
might break, or run any checks; that arrives in later stages.

Everything documented below works today.

## Requirements

- Node.js 22 or newer

## Installation

The package is not published to a registry yet. To try it, build from source:

```bash
git clone https://github.com/jna981952-cyber/verify.git
cd verify
npm install
npm run build
npm link
```

`npm link` puts a `verify` executable on your `PATH`. Remove it later with
`npm unlink -g verify-cli`.

## Usage

### `verify .` — project context

```bash
verify .
```

```text
verify 0.1.0

  Target           /home/you/projects/api
  Project          my-api@2.4.0
  Package manager  pnpm (pnpm-lock.yaml)
  Version control  git
  TypeScript       tsconfig.json

✔ Inspected my-api.
  This release reports project context only; no checks were run.
```

### `verify changes` — what changed in Git

```bash
verify changes
```

```text
On branch main at a7195e2

Changed files:

  M src/cart.ts
  M src/checkout.ts
  A tests/checkout.test.ts

Summary:
  2 modified
  1 added
  0 deleted
  0 renamed
```

Both staged and unstaged work is reported, measured against `HEAD` — or against
an empty tree in a repository with no commits yet, so the first staged files
still show up. The markers are the ones `git status` uses:

| Marker | Meaning                                       |
| ------ | --------------------------------------------- |
| `A`    | Added                                         |
| `M`    | Modified                                      |
| `D`    | Deleted                                       |
| `R`    | Renamed, shown as `R old/path -> new/path`    |
| `?`    | Untracked                                     |
| `U`    | Unmerged — a path with an unresolved conflict |

The summary always lists the four counters above; `untracked` and `unmerged`
join them only when there is something to count. A clean working tree reports
`No changes.` instead of two empty blocks. Pointing the command at a directory
that is not inside a repository is a usage error (exit code `2`).

### Commands

| Command   | Description                                    |
| --------- | ---------------------------------------------- |
| _(none)_  | Report project context for the path.           |
| `changes` | List the Git changes in the path's repository. |

### Arguments

| Argument | Description                       | Default |
| -------- | --------------------------------- | ------- |
| `path`   | Directory to inspect. Must exist. | `.`     |

A path that happens to be named after a command is still reachable by spelling
it out: `verify ./changes` inspects the directory, `verify changes` runs the
command.

### Options

| Option            | Description                       |
| ----------------- | --------------------------------- |
| `-h`, `--help`    | Show the help text and exit.      |
| `-v`, `--version` | Show the version number and exit. |
| `--json`          | Print the report as JSON.         |
| `--no-color`      | Disable coloured output.          |

Colour is enabled automatically when standard output is a terminal, and is
suppressed by `--no-color`, by [`NO_COLOR`](https://no-color.org), or by
`TERM=dumb`. `FORCE_COLOR` turns it back on when piping output somewhere else.

### Exit codes

| Code | Meaning                                                                                      |
| ---- | -------------------------------------------------------------------------------------------- |
| `0`  | Success.                                                                                     |
| `1`  | Verification reported problems. Reserved; unused today.                                      |
| `2`  | Invalid usage — unknown flag, an unusable path, or a directory that is not a Git repository. |
| `3`  | Unexpected internal error, including `git` not being installed.                              |

### JSON output

`--json` prints the same report as a stable, machine-readable document, which
is the intended integration point for scripts and CI:

```bash
verify . --json
```

```json
{
  "tool": { "name": "verify", "version": "0.1.0" },
  "target": "/home/you/projects/api",
  "project": {
    "root": "/home/you/projects/api",
    "name": "my-api",
    "manifest": { "name": "my-api", "version": "2.4.0", "description": null },
    "packageManager": "pnpm",
    "lockfile": "pnpm-lock.yaml",
    "versionControl": "git",
    "typescript": true
  }
}
```

`verify changes --json` prints the change set in the same envelope:

```json
{
  "tool": { "name": "verify", "version": "0.1.0" },
  "target": "/home/you/projects/api",
  "changes": {
    "root": "/home/you/projects/api",
    "head": {
      "branch": "main",
      "commit": "a7195e2edcdc4e66844ef0589fe30dc070158c8e",
      "shortCommit": "a7195e2",
      "detached": false,
      "unborn": false
    },
    "files": [
      {
        "path": "src/cart.ts",
        "previousPath": null,
        "kind": "modified",
        "scope": "unstaged",
        "binary": false,
        "similarity": null,
        "hunks": [
          {
            "oldStart": 3,
            "oldLines": 1,
            "newStart": 3,
            "newLines": 1,
            "heading": "export function total() {",
            "addedLines": [3],
            "removedLines": [3]
          }
        ],
        "stats": { "added": 1, "removed": 1 }
      }
    ],
    "summary": {
      "added": 0,
      "modified": 1,
      "deleted": 0,
      "renamed": 0,
      "untracked": 0,
      "unmerged": 0,
      "total": 1
    }
  }
}
```

`kind` is one of `added`, `modified`, `deleted`, `renamed`, `untracked` or
`unmerged`; `scope` is `staged`, `unstaged` or `both`. Hunks are read from a
zero-context diff, so each one covers changed lines only. Binary and untracked
files carry no hunks.

## Programmatic use

The package also exports its building blocks, so the same logic can be used
without spawning a process:

```ts
import { collectChanges, inspectProject, resolveTarget } from 'verify-cli';

const target = await resolveTarget('.', process.cwd());
const project = await inspectProject(target);

console.log(project.packageManager); // "npm" | "pnpm" | "yarn" | "bun" | null

// `null` when the directory is not inside a Git repository.
const changes = await collectChanges(target.path);

for (const file of changes?.files ?? []) {
  console.log(file.kind, file.path, file.stats);
}
```

`collectChanges` accepts a `runner` so `git` can be replaced in tests, and the
individual parsers (`parseStatus`, `parseNumstat`, `parseHunks`) are exported
too, for working with git output you already have.

## Architecture

Each layer depends only on the ones below it, so a new command, check or output
format lands in one place.

```text
src/
├── bin/verify.ts     Executable entry point; maps a run to an exit code
├── cli/              Command layer
│   ├── args.ts       Argument parsing, built on node:util parseArgs
│   ├── help.ts       Help and version text
│   └── run.ts        Orchestration: parse → inspect → report
├── core/             Domain logic, free of any CLI concerns
│   ├── git/          Git change detection
│   │   ├── changes.ts    Composes a ChangeSet from the pieces below
│   │   ├── diff.ts       Parses numstat records and unified diff hunks
│   │   ├── head.ts       Reads the current branch and commit
│   │   ├── repository.ts Finds the repository root
│   │   ├── runner.ts     Runs git; injectable, so failures are testable
│   │   ├── status.ts     Parses git status --porcelain=v2
│   │   └── types.ts      The typed models everything else speaks in
│   ├── manifest.ts   Reads package.json
│   ├── project.ts    Detects package manager, VCS and TypeScript
│   ├── report.ts     The report shapes shared by every reporter
│   └── target.ts     Resolves and validates the target directory
├── reporters/        Rendering
│   ├── changes.ts    Change summary, human-readable and JSON
│   ├── text.ts       Human-readable summary
│   └── json.ts       Machine-readable report
├── utils/            Small shared helpers
│   ├── color.ts      Dependency-free ANSI palette
│   ├── errors.ts     Error types and exit codes
│   ├── fs.ts         Filesystem predicates
│   └── logger.ts     Output abstraction used instead of console
└── version.ts        Tool name and version
```

Two rules keep the layers honest:

- **Nothing writes to `process.stdout` directly.** Commands take a `Logger`,
  which is what makes the CLI testable end to end.
- **`runCli` never throws.** Every failure becomes a message on standard error
  and an exit code from `ExitCode`.
- **`git` is called through an injectable runner.** Nothing in `core/git`
  reaches for `child_process` directly, so the tests cover a missing `git`
  without depending on the machine they run on.

## Dependencies

`verify` has **no runtime dependencies**. Argument parsing uses `node:util`,
Git is read by running the `git` you already have via `node:child_process`,
tests use `node:test`, and the ANSI palette is a few lines of local code. The
development toolchain is TypeScript, ESLint and Prettier.

`verify changes` needs `git` on your `PATH`; nothing else does.

## Development

```bash
npm install
npm run check     # lint, format, types, build and tests
```

| Script                  | Purpose                                |
| ----------------------- | -------------------------------------- |
| `npm run build`         | Compile `src/` to `dist/`.             |
| `npm test`              | Compile and run the test suite.        |
| `npm run test:coverage` | Run the tests with coverage reporting. |
| `npm run lint`          | Run ESLint.                            |
| `npm run format`        | Apply Prettier formatting.             |
| `npm run typecheck`     | Type-check without emitting.           |
| `npm run check`         | Everything CI runs.                    |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Roadmap

Stage 1 built the foundation, Stage 2 the Git change detection described above.
Later stages build analysis and checks on top of them. Scope for those is
decided when they start; nothing beyond this stage is implemented or promised
here.

## License

[MIT](LICENSE) © jna981952-cyber

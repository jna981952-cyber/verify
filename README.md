# verify

> Checks code changes, finds what might break, and tests it before you ship.

[![CI](https://github.com/jna981952-cyber/verify/actions/workflows/ci.yml/badge.svg)](https://github.com/jna981952-cyber/verify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

`verify` is a command line tool for finding out whether a change is safe to ship.

## Project status

**Stage 3 — codebase analysis.** On top of the Stage 1 foundation and the
Stage 2 Git change detection, `verify` now reads the source itself: it parses
every JavaScript and TypeScript file into a syntax tree and reports the
declarations, modules, tests and API routes it finds, along with a dependency
graph over the files and the symbols they share.

So `verify` can now say what changed and what is there. It cannot yet say which
of those changes might break what, or run any checks; that arrives in later
stages.

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

### `verify analyze` — what is in the source

```bash
verify analyze
```

```text
Analysed 5 files under /home/you/projects/shop
  44 lines of source

Symbols:
  1 function
  1 class
  2 methods
  2 variables
  1 interface
  1 type
  1 React component

Modules:
  6 imports (5 local, 1 external)
  6 exports
  6 dependency edges, 6 symbol edges

Tests:
  1 test file, 2 tests

API routes:
  GET   /cart        src/api/server.ts:7
  POST  /cart/items  src/api/server.ts:8
```

Every `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts` and `.cts` file is
parsed; `node_modules`, build output and hidden directories are not. Sections
appear only when they have something to report, and the full inventory — every
declaration, import, export, test and edge — is what `--json` is for.

What the analyser recognises:

| Detected                | How                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Imports and exports     | ESM `import`/`export` in every form, dynamic `import()`, `require()`, and the CommonJS `module.exports`    |
| Functions and variables | Module-level declarations, including functions written as `const f = () => {}`                             |
| Classes and methods     | Class declarations and expressions; methods, accessors, constructors and arrow-function properties         |
| Types                   | `interface`, `type` and `enum` declarations                                                                |
| React components        | A capitalised name that returns JSX, `memo`/`forwardRef` wrappers, and classes extending `React.Component` |
| Tests                   | `.test.`/`.spec.` files and `__tests__` directories; `describe`, `it` and `test` calls with their titles   |
| API routes              | Express-style `app.get('/path', …)`, Next.js App Router `route` files, and Next.js `pages/api` endpoints   |

Everything is read from syntax alone — no types are resolved, no code is
executed, and nothing is sent anywhere.

### Commands

| Command   | Description                                                 |
| --------- | ----------------------------------------------------------- |
| _(none)_  | Report project context for the path.                        |
| `changes` | List the Git changes in the path's repository.              |
| `analyze` | Inventory the JavaScript and TypeScript source in the path. |

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

`verify analyze --json` prints the whole inventory. Each file carries its
declarations, imports, exports, tests and routes:

```json
{
  "path": "src/money.ts",
  "language": "typescript",
  "bytes": 185,
  "lines": 5,
  "declaration": false,
  "testFile": false,
  "symbols": [
    {
      "name": "formatPrice",
      "kind": "function",
      "exported": true,
      "container": null,
      "location": { "line": 3, "column": 1 }
    }
  ],
  "imports": [],
  "exports": [
    {
      "name": "formatPrice",
      "local": "formatPrice",
      "source": null,
      "typeOnly": false,
      "location": { "line": 3, "column": 1 }
    }
  ],
  "tests": [],
  "routes": []
}
```

and `analysis.graph` relates them to one another:

```json
{
  "dependencies": { "src/cart.ts": ["src/money.ts"] },
  "symbolEdges": [
    {
      "from": "src/cart.ts",
      "to": "src/money.ts",
      "exported": "formatPrice",
      "local": "formatPrice",
      "typeOnly": false
    }
  ]
}
```

`edges` records every specifier a file refers to, resolved or not, each marked
`local`, `package`, `builtin` or `unresolved`. `symbolEdges` is narrower on
purpose: an edge appears only where the specifier resolved to an analysed file
**and** that file really exports the name, so every symbol edge is a
relationship that was checked rather than inferred.

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

The analyser is exported the same way, including `analyzeSource` for a single
file you already hold in memory:

```ts
import { analyzeCodebase, analyzeSource } from 'verify-cli';

const analysis = await analyzeCodebase('./src');

for (const file of analysis.files) {
  console.log(file.path, file.symbols.length);
}

const one = analyzeSource('cart.ts', 'export const total = 0;', 23);
console.log(one.symbols[0]?.kind); // "variable"
```

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
│   ├── analysis/     Static analysis of JavaScript and TypeScript
│   │   ├── analyze.ts    Reads a directory into a CodebaseAnalysis
│   │   ├── ast.ts        Small helpers over the syntax tree
│   │   ├── file.ts       Analyses one file's text
│   │   ├── graph.ts      Relates files and symbols to one another
│   │   ├── modules.ts    Reads imports and exports
│   │   ├── parser.ts     Turns a path and its text into a syntax tree
│   │   ├── react.ts      Recognises React components
│   │   ├── resolve.ts    Resolves specifiers against the analysed files
│   │   ├── routes.ts     Recognises API routes
│   │   ├── scan.ts       Finds source files on disk
│   │   ├── symbols.ts    Reads declarations
│   │   ├── tests.ts      Recognises tests
│   │   └── types.ts      The typed models everything else speaks in
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
│   ├── analysis.ts   Codebase inventory, human-readable and JSON
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
- **The analyser never executes what it reads.** Source is parsed, never run,
  and a file it cannot make sense of is reported as far as it got rather than
  failing the run.

## Dependencies

`verify` has **one runtime dependency**: `typescript`, used purely as a parser.
`ts.createSourceFile` turns a file into a syntax tree without creating a
program, checking types or executing anything, which is what makes the analysis
deterministic. It was already the project's compiler, so nothing new joined the
dependency tree.

Everything else is the standard library: argument parsing uses `node:util`, Git
is read by running the `git` you already have via `node:child_process`, tests
use `node:test`, and the ANSI palette is a few lines of local code. The rest of
the development toolchain is ESLint and Prettier.

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

Stage 1 built the foundation, Stage 2 the Git change detection, and Stage 3 the
codebase analysis described above. Later stages connect the two — what changed
and what is there — and add checks on top. Scope for those is decided when they
start; nothing beyond this stage is implemented or promised here.

## License

[MIT](LICENSE) © jna981952-cyber

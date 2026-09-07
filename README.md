# verify

> Checks code changes, finds what might break, and tests it before you ship.

[![CI](https://github.com/jna981952-cyber/verify/actions/workflows/ci.yml/badge.svg)](https://github.com/jna981952-cyber/verify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

`verify` is a command line tool for finding out whether a change is safe to ship.

## Project status

**Stage 1 — foundation.** This release is the CLI skeleton: argument handling,
project detection, reporting and the surrounding toolchain. It inspects a
directory and prints what it finds. It does not analyse code or run checks yet;
those arrive in later stages, built on the seams established here.

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

### Arguments

| Argument | Description                       | Default |
| -------- | --------------------------------- | ------- |
| `path`   | Directory to inspect. Must exist. | `.`     |

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

| Code | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| `0`  | Success.                                                |
| `1`  | Verification reported problems. Reserved; unused today. |
| `2`  | Invalid usage — unknown flag, or an unusable path.      |
| `3`  | Unexpected internal error.                              |

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

## Programmatic use

The package also exports its building blocks, so the same logic can be used
without spawning a process:

```ts
import { inspectProject, resolveTarget } from 'verify-cli';

const target = await resolveTarget('.', process.cwd());
const project = await inspectProject(target);

console.log(project.packageManager); // "npm" | "pnpm" | "yarn" | "bun" | null
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
│   ├── manifest.ts   Reads package.json
│   ├── project.ts    Detects package manager, VCS and TypeScript
│   ├── report.ts     The report shape shared by every reporter
│   └── target.ts     Resolves and validates the target directory
├── reporters/        Rendering
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

## Dependencies

`verify` has **no runtime dependencies**. Argument parsing uses `node:util`,
tests use `node:test`, and the ANSI palette is a few lines of local code. The
development toolchain is TypeScript, ESLint and Prettier.

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

Stage 1 is the foundation described above. Later stages build change analysis
and checks on top of it. Scope for those is decided when they start; nothing
beyond this stage is implemented or promised here.

## License

[MIT](LICENSE) © jna981952-cyber

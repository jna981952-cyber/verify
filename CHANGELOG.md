# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Stages 2, 3 and 4: Git change detection, codebase analysis and impact analysis.

### Added

- `verify impact [path]` command that combines the Git change set with the
  codebase analysis and walks the dependency graph backwards from what changed,
  with `--json` for the full result.
- Direct and indirect affected files, affected tests, React components and API
  routes, each carrying the relationship that selected it.
- Declaration-level change detection: diff hunks are matched against the line
  ranges of declarations, so a change reports the functions, classes and methods
  it actually touched.
- `--depth N` to configure how many hops the search follows, with the report
  saying when the limit stopped it short.
- Deleted and renamed files followed through the import specifiers that stopped
  resolving because of them.
- Typed models (`ImpactAnalysis`, `ChangedFile`, `AffectedFile`, `ImpactReason`)
  exported for programmatic use.
- `verify analyze [path]` command that parses every JavaScript and TypeScript
  file under a directory and reports what it finds, with `--json` for the full
  inventory.
- Detection of imports and exports in every ESM form plus dynamic `import()`,
  `require()` and the CommonJS `module.exports` assignments.
- Detection of functions, classes, methods, variables, interfaces, type
  aliases, enums and React components, each with its location and whether it
  leaves the module.
- Detection of test files, `describe`/`it`/`test` declarations, and API routes
  written as Express-style router calls, Next.js App Router handlers or Next.js
  `pages/api` endpoints.
- A dependency graph over the analysed files, with symbol-level edges recorded
  only where the target really exports the name.
- Typed models (`CodebaseAnalysis`, `FileAnalysis`, `CodeSymbol`,
  `DependencyGraph`) and their extractors exported for programmatic use.
- `verify changes [path]` command that reports the Git changes in the target's
  repository, with `--json` for machine-readable output.
- Detection of the repository root, the current branch and commit, a detached
  `HEAD`, and a repository with no commits yet.
- Classification of every changed path as added, modified, deleted, renamed,
  untracked or unmerged, and as staged, unstaged or both.
- Diff hunk parsing: changed line numbers, per-file line totals, rename
  similarity scores and binary-content detection.
- Typed models (`ChangeSet`, `FileChange`, `DiffHunk`, `GitHead`) and their
  parsers exported for programmatic use, with an injectable `git` runner.

### Changed

- `CodeSymbol` gained an `endLine`, which is what lets a changed line be matched
  to the declaration containing it.

### Dependencies

- `typescript` moved from a development dependency to a runtime one: the
  analyser uses its parser to build syntax trees. It resolves no types, creates
  no program and executes nothing it reads.

## [0.1.0] - 2026-09-07

Stage 1: the CLI foundation.

### Added

- `verify [path]` command that resolves and validates a target directory and
  reports what it finds there.
- Project detection: `package.json` metadata, package manager (npm, pnpm, yarn
  or bun) inferred from the lockfile, git, and a root `tsconfig.json`.
- `--help` and `--version` flags, plus short forms `-h` and `-v`.
- `--json` for machine-readable output, and `--no-color` alongside `NO_COLOR`,
  `FORCE_COLOR` and TTY detection for colour control.
- Documented exit codes: `0` success, `1` reserved for verification failures,
  `2` invalid usage, `3` unexpected internal error.
- Programmatic exports for the CLI, project inspection and reporters.
- Toolchain: TypeScript build, ESLint, Prettier, `node:test` suite and GitHub
  Actions CI across Node 22, 24 and 26 on Linux, macOS and Windows.

[unreleased]: https://github.com/jna981952-cyber/verify/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jna981952-cyber/verify/releases/tag/v0.1.0

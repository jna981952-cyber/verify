# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Stage 2: Git change detection.

### Added

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

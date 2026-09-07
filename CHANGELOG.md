# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

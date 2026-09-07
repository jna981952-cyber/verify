# Contributing to verify

Thanks for taking the time to help. This guide covers everything needed to make
a change with confidence.

## Code of conduct

Be respectful and assume good faith. Report unacceptable behaviour by opening an
issue.

## Getting started

**Prerequisites:** Node.js 22 or newer and npm 10 or newer.

```bash
git clone https://github.com/jna981952-cyber/verify.git
cd verify
npm install
npm run check
```

`npm run check` runs exactly what CI runs. If it passes locally, CI should pass
too.

To try your changes against a real directory:

```bash
npm run build
node dist/bin/verify.js .
```

## Scripts

| Script                  | What it does                                                |
| ----------------------- | ----------------------------------------------------------- |
| `npm run build`         | Compiles `src/` to `dist/` (test files excluded).           |
| `npm run build:tests`   | Compiles everything, tests included, to `test-build/`.      |
| `npm test`              | Compiles the tests and runs them with the Node test runner. |
| `npm run test:coverage` | Same, with coverage reporting.                              |
| `npm run typecheck`     | Type-checks the whole project without emitting.             |
| `npm run lint`          | Runs ESLint. `npm run lint:fix` applies safe fixes.         |
| `npm run format`        | Formats with Prettier. `format:check` verifies only.        |
| `npm run clean`         | Removes generated directories.                              |
| `npm run check`         | Lint, format, types, build and tests — the CI gate.         |

## Project layout

```text
src/bin/         Executable entry point
src/cli/         Argument parsing, help text, command orchestration
src/core/        Domain logic with no CLI concerns
src/reporters/   Output formats
src/utils/       Small shared helpers
src/test-helpers/Fixtures used by tests only; excluded from the build
scripts/         Repository maintenance scripts
```

Dependencies point one way: `bin` → `cli` → `core`/`reporters` → `utils`. If a
change needs `core` to import from `cli`, the boundary is in the wrong place.

## Conventions

- **TypeScript, strict.** No `any`, no non-null assertions, no `ts-ignore`. If
  the types are fighting you, the design usually needs adjusting.
- **No new runtime dependencies.** The package ships with zero of them, and it
  should stay that way unless there is a strong reason. Reach for the Node
  standard library first, and raise an issue before adding anything.
- **No direct console output.** Use the `Logger` passed through `CliContext`.
- **Explicit exit codes.** Add new failure modes to `ExitCode`; never write a
  bare number.
- **Comments explain why.** The code already says what it does.
- Formatting and lint rules are enforced, not debated — run `npm run format`.

## Tests

Tests live next to the code they cover as `*.test.ts` and use the built-in
[`node:test`](https://nodejs.org/api/test.html) runner with
`node:assert/strict`. No test framework is installed.

- Cover the behaviour, not the implementation: assert on what a caller sees.
- Use `createFixture` from `src/test-helpers/fixtures.ts` for anything that
  touches the filesystem; it makes a temp directory and cleans it up.
- New behaviour needs a test. Bug fixes need a test that fails without the fix.

Run a single file while iterating:

```bash
npm run build:tests
node --test test-build/core/project.test.js
```

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):

```text
feat(cli): add --json output
fix(core): treat a malformed manifest as absent
docs: document exit codes
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.

Before opening a pull request:

1. `npm run check` passes.
2. The change has tests.
3. Documentation is updated if behaviour changed.
4. `CHANGELOG.md` has an entry under **Unreleased** for anything user-facing.
5. The pull request explains _why_, not just _what_.

Keep pull requests focused — one concern each. Unrelated cleanups are welcome as
separate ones.

## Scope

The project is being built in stages. Stage 1 is the CLI foundation:
arguments, project detection, reporting and the toolchain around them. Please
open an issue to discuss anything that reaches beyond the current stage before
writing code, so the work lands in the right order.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).

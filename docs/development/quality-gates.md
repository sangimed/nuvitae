# Code quality gates

Nuvitae uses one repository-wide ESLint flat configuration for static analysis
and Prettier for deterministic formatting. TypeScript remains responsible for
type checking. Pull requests and pushes to `main` run the same root commands as
local development through the pinned Docker Compose workspace.

## Tooling decision

The repository already used ESLint, TypeScript ESLint, the Next.js ESLint
plugin, and Prettier. Keeping that stack preserves framework-specific semantic
rules for Next.js and React while also covering NestJS, Node, tests, and shared
TypeScript packages. ESLint and Prettier have separate responsibilities:
ESLint reports correctness and maintainability problems; Prettier owns layout.

Biome was not selected because replacing the established stack would lose or
duplicate framework-specific ESLint coverage without a demonstrated repository
benefit. Oxlint was not added because a second linter would duplicate the
canonical ESLint gate. Type-aware ESLint presets were also deferred: the strict
TypeScript gate already supplies that signal, while enabling them repository-wide
would add parser cost and migration noise. The existing architecture tests
remain the more useful place for dependency-direction and circular-boundary
checks.

No Git hooks, lint-staged, or commit-message enforcement were added. CI is the
source of truth, and the repository has no concrete need for another local
enforcement layer. Hooks can be reconsidered only if commit-time feedback
becomes a measured problem.

Knip was assessed separately in [the Knip evaluation](knip-evaluation.md). It
targets repository reachability and manifest hygiene, which ESLint, TypeScript,
and Prettier do not duplicate. It is intentionally not a quality gate until a
Docker-run baseline has verified its framework and dynamic entry points against
the current repository. This prevents CI from failing on an untriaged report or
from encouraging unsafe automatic deletion.

## Configuration and rule scope

- [`eslint.config.mjs`](../../eslint.config.mjs) is the canonical shared lint
  configuration. TypeScript recommendations apply repository-wide; Next.js,
  Core Web Vitals, browser globals, and React Hooks rules apply only to the web
  app; Node globals apply to backend apps, packages, scripts, and tests; Vitest
  globals apply only to tests.
- NestJS code uses the shared strict TypeScript and Node rules. No additional
  NestJS plugin was justified because the framework has no required official
  lint preset and the current rules cover the implemented code without
  decorator-specific churn.
- React Hooks rules are enabled, except `set-state-in-effect`: current async
  loading effects deliberately initialize state when their input changes, and
  enabling that advisory would require unrelated state-flow rewrites.
- Unused variables are errors, with underscore-prefixed parameters allowed for
  intentionally unused interface arguments. Explicit `any`, unreachable code,
  and other recommended TypeScript/JavaScript defects remain errors.
- Import ordering is left to contributors because enforcing a stylistic order
  would add churn without correctness value. Dependency direction is enforced
  by architecture tests. Console calls are not banned syntactically because
  application logging needs semantic privacy review rather than a blanket rule.
- `.prettierignore` and ESLint ignores exclude dependencies, generated output,
  build caches, coverage, local/private artifacts, historical spikes, and
  generated test results. Generated files should be excluded rather than edited
  to satisfy quality tools.

## Canonical commands

Run all commands in the repository-supported workspace container:

```bash
docker compose run --rm workspace pnpm lint
docker compose run --rm workspace pnpm lint:fix
docker compose run --rm workspace pnpm format
docker compose run --rm workspace pnpm format:check
docker compose run --rm workspace pnpm typecheck
docker compose run --rm workspace pnpm test
docker compose run --rm workspace pnpm build
```

`lint:fix` and `format` modify supported files and are local-only. CI only runs
validation commands. Before opening a pull request, run `format:check`, `lint`,
`typecheck`, `test`, and `build`.

For focused package checks, use pnpm filtering while retaining the same package
scripts, for example:

```bash
docker compose run --rm workspace pnpm --filter @nuvitae/web typecheck
docker compose run --rm workspace pnpm --filter @nuvitae/api build
```

Lint and formatting are centralized root tasks, so narrow them by path when
fast feedback is useful:

```bash
docker compose run --rm workspace pnpm exec eslint apps/web
docker compose run --rm workspace pnpm exec prettier --check apps/web
```

Editors may enable ESLint diagnostics and format-on-save with Prettier, but the
repository commands are authoritative.

## CI behavior

The `Quality gates` workflow runs lint, formatting validation, type checking,
tests, and builds as separately reported matrix jobs. Jobs run in parallel, use
the same Docker Compose workspace and root scripts as local development, restore
a lockfile-keyed pnpm content-addressable store, and cancel superseded runs for
the same branch. Full-repository checks are intentional: shared packages and
configuration can affect every workspace, and the repository does not yet have
reliable changed-package metadata that would make affected-only execution safe.

To reproduce a failing job, run the matching canonical command above. CI never
runs `lint:fix` or `format` and therefore never changes committed source.

## Extending the policy

New packages inherit the root lint and formatting gates automatically. Give a
new package `typecheck` and `build` scripts when applicable so the recursive root
commands include it. Add a package-specific lint exception only when the shared
rule is incorrect for that runtime, keep the override narrow, and document the
reason next to the override. Rule changes should be proposed with examples of
the defect they catch, checked for current violations, and introduced without
unrelated repository-wide rewrites.

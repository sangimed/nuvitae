# Knip evaluation

Issue [#49](https://github.com/sangimed/nuvitae/issues/49) evaluates Knip as a
repository-graph hygiene tool. It is not a replacement for the existing quality
tools:

| Tool       | Responsibility                                              |
| ---------- | ----------------------------------------------------------- |
| ESLint     | Source-level correctness and maintainability rules          |
| TypeScript | Type correctness                                            |
| Prettier   | Formatting                                                  |
| Knip       | Unused files, exports, dependencies, and manifest ownership |

## Repository model audited

`pnpm-workspace.yaml` declares `apps/*` and `packages/*`. Any future Knip
configuration must preserve that discovery and explicitly model these entry
points before interpreting a report:

| Area            | Reachability evidence                                                                         | Required Knip handling                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Web             | Next.js App Router under `apps/web/src/app`, `next.config.ts`, and the `next` package scripts | Use Next.js plugin/config discovery; do not infer routes only from imports.                                                                |
| API             | Nest CLI `sourceRoot`, `apps/api/src/main.ts`, and `AppModule` metadata                       | Include the Nest bootstrap and source tree; verify providers/controllers referenced through decorators.                                    |
| Worker          | Nest CLI `sourceRoot`, `apps/worker/src/main.ts`, and runtime module composition              | Include the worker bootstrap independently from the HTTP API.                                                                              |
| Shared packages | Package `main`, `types`, and explicit `exports` fields                                        | Treat package entry points and public subpaths as entry points, not unused exports.                                                        |
| Persistence     | TypeORM CLI data source, package migration scripts, and `src/migrations/**`                   | Include the CLI data source and migrations; never remove migrations from a static report without a separately approved retention decision. |
| Vitest          | `vitest.config.ts` and `vitest.persistence.config.ts` include patterns and aliases            | Enable/configure Vitest discovery and keep test support modules reachable through tests.                                                   |
| Playwright      | Root Playwright configs and browser/accessibility/e2e test matches                            | Enable/configure Playwright discovery, including local-play configuration.                                                                 |
| Root tooling    | Root package scripts plus checked-in shell and fixture-generation scripts                     | Model invoked scripts as entries; review command/config-only dependencies before changing manifests.                                       |

`spikes/`, generated artifacts, and historical research are not pnpm workspaces.
They must not be silently swept into an application dead-code gate. If they are
ever analyzed, that should be a separately scoped archival/retention decision.

## Decision: defer adoption until an executable baseline exists

This evaluation did **not** install Knip into the repository, add a `knip.json`,
change package dependencies, or add CI. The required Docker Compose workflow
was unavailable in the evaluation environment: the installed Docker CLI had no
`docker compose` subcommand and the daemon socket was inaccessible. A temporary,
non-Docker fallback invoked Knip 6.34.0 under the orb's Node 26.5.1 only to test
whether a report could be collected. Both default discovery and an explicit
workspace/entry-point model aborted in `oxc-parser` with `RangeError: Array
buffer allocation failed`, including a web-workspace-only attempt. They produced
no report to triage. This result is not a basis for a repository configuration,
because it was outside the supported Docker workflow and uses a Node version
different from the pinned Node 24.15.0 image.

Consequently, Knip version compatibility, configuration schema, workspace
discovery, plugin behavior, and report accuracy remain unverified against this
checkout. Adding an unexecuted configuration or a CI gate would create an
untrustworthy signal and violate the repository's Docker-only development
policy.

No code, exports, files, or dependencies were removed: none were confirmed dead
by a completed Knip baseline.

## Adoption procedure

Perform the following only in an environment where the README's Docker Compose
commands work:

1. Add a pinned root development dependency and a single root `knip` script.
2. Run Knip's default workspace discovery first and save its report outside the
   repository or as a reviewed issue/PR artifact; do not delete from it.
3. Add only the explicit entries in the table above that default/plugin discovery
   demonstrably misses. Prefer `entry` and `project` patterns over ignore rules.
4. Enable Next.js, NestJS, Vitest, and Playwright integration only after checking
   their discovered entry files. Keep TypeORM migrations and CLI data source
   reachable through narrow persistence-package configuration.
5. Triage each remaining category: unused files first, then dependencies, then
   exports/types. Validate every deletion with affected tests and builds.
6. Evaluate `knip --production` as a supplementary shipped-code signal only; it
   must not become a permanent way to hide test or tooling residue.
7. Add CI only after the selected category has a zero, reviewed baseline. CI must
   run the same root command through Docker and must never auto-fix or delete.

For focused investigation, use Knip's workspace-scoped execution after the root
configuration is proven. A suppression must name the concrete framework or
dynamic contract it preserves and remain narrower than an entire workspace or
test tree. Re-run the full root analysis when workspace manifests, entry points,
or build/test configuration changes.

## Re-evaluation checklist

Before proposing adoption, attach the actual command output and answer all of
the following:

- Does default discovery find every workspace in `pnpm-workspace.yaml`?
- Are Next.js routes, Nest metadata, API and worker bootstraps, TypeORM
  migrations, Vitest, Playwright, and root scripts represented as reachable?
- Are package `exports` and TypeORM migration history protected from false
  positives by modeled entries rather than broad ignores?
- Which issue categories have zero reviewed findings and can safely block CI?
- Does production mode provide a useful additional signal without masking test
  and tooling debt?

Until those answers are supported by a Docker-run report, Knip remains deferred
rather than a required local or CI command.

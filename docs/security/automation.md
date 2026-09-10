# Security and supply-chain automation

This baseline extends the canonical Docker Compose quality workflow from issue
#44. It does not install dependencies, build the application, or run ordinary
tests in a competing workflow.

## Repository capability audit

The GitHub API was queried on 5 September 2026 without changing settings:

- the repository is private and owned by a personal account;
- `security_and_analysis` was not exposed, the dependency graph reported no
  manifests, and Dependabot vulnerability alerts reported disabled;
- CodeQL default setup reported that code scanning was not enabled;
- Actions defaults, branch protection, secret-scanning alerts, and vulnerability
  alert settings required administration/security permissions unavailable to
  the integration;
- private vulnerability reporting was not observable as an enabled endpoint;
- no image publication, package release, or deployment workflow exists.

These observations determine the repository fallbacks below. They do not prove
that an unreadable owner setting is off.

## Automated controls

| Control                   | Trigger and blocking policy                                                                                                                                                                                                                                               | Ownership and signal handling                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gitleaks fallback         | Every pull request and push to `main`, plus Wednesday history scan; any default-rule or Nuvitae test-marker finding fails                                                                                                                                                 | The affected capability maintainer triages; revoke a real credential immediately. Disable this fallback only after native secret scanning and push protection are confirmed effective, to avoid duplicate scanning.                                                 |
| Dependency audit fallback | The existing `Quality gates` matrix runs `pnpm audit --prod --audit-level high`; high/critical production advisories fail                                                                                                                                                 | Dependency/package owner traces reachability and follows the vulnerability SLA. This is a whole-lockfile fallback because GitHub Dependency Review is not currently available; replace it rather than overlap it when native differential review becomes available. |
| Dependabot                | Weekly Monday pnpm and Actions updates; compatible minor/patch updates are grouped and major updates remain separate                                                                                                                                                      | `@sangimed` is requested for review. There is no auto-merge. Review release notes, lockfile changes, lifecycle scripts, `pnpm-workspace.yaml` `allowBuilds`, and all CI action changes.                                                                             |
| CodeQL                    | Pull request, push to `main`, Wednesday full scan, and manual dispatch; JavaScript/TypeScript default queries                                                                                                                                                             | High-confidence critical/high findings must block through a GitHub code-scanning ruleset. Lower-severity/confidence findings are triaged under the normal SLA; the workflow never gives provider or deployment secrets to pull-request code.                        |
| Trivy and Compose         | Saturday and manual Trivy scans of the web, API, and worker Compose images plus all `docker/` Dockerfiles; high/critical findings exit 1. The same workflow runs `docker compose config --quiet` for default, development, Local Play, and quality topology combinations. | Container/config owner verifies reachability and remediation. Table output remains visible when Code Scanning/SARIF storage is unavailable.                                                                                                                         |

All third-party actions in the new workflows are immutable-SHA pinned and are
covered by weekly Actions updates. Workflow permissions default to
`contents: read`; only CodeQL receives job-scoped `security-events: write`.
There is no `pull_request_target` execution and no repository secret reference.

Scanner severity is an input, not a final risk decision. A suppression must be
narrow and record the tool and finding ID, exact path/version, evidence,
compensating control, owner, expiry, and review trigger as required by
[the vulnerability-management policy](vulnerability-management.md). Do not add
global ignore files, ignore all unfixed vulnerabilities, or lower thresholds to
make a run green.

The initial full-history Gitleaks run identified 12 `generic-api-key` false
positives: immutable SHA-256 fixture/Dockerfile checksums, version-pinned Valkey
image references, a synthetic unit-test signing value, and synthetic opaque
authentication subjects. `.gitleaksignore` records only their exact
commit/path/rule/line fingerprints, with `@sangimed` as owner and a review
trigger on rule or file-purpose changes. Future findings in those paths remain
visible.

Trivy 0.74 does not recognize Docker Compose YAML as a configuration scan input;
it reports zero detected files. The workflow therefore does not claim a false
Compose scanner pass: Trivy scans every Dockerfile and built application image,
while Docker Compose itself renders and validates every active file
combination. A future Trivy release or narrow Compose policy may replace that
validation only after demonstrating additional high-signal coverage.

## Deterministic fail-closed evidence

`tests/architecture/security-automation.test.ts` is safe repository evidence:
it verifies the precise high/critical exit thresholds, actual image/config
targets, read-only pull-request boundary, weekly reviewed update policy, CodeQL
language/build mode, and absence of auto-merge and secret contexts. It also
executes the harmless custom Gitleaks marker expression against the marker name
joined at runtime to a 16-character uppercase test value; this value is
deliberately not a credential. The test fails if a blocking exit code/threshold
is removed or a privileged pull-request trigger/secret reference is introduced.

After these workflows are merged, an owner should open one disposable draft PR
containing that harmless marker in a temporary text file, confirm `Secret scan`
fails with `nuvitae-harmless-test-marker`, remove the file in the same PR, and
confirm the rerun passes. Do not use real or credential-shaped secrets. CodeQL,
dependency, and Trivy remote enforcement should be dry-run by temporarily
changing their checked workflow policy in a draft PR (for example, removing
`exit-code: "1"`) and confirming the architecture test fails; do not commit a
vulnerable package, exploit, or malware fixture merely to exercise a scanner.

## Docker Compose reproduction

The dependency gate uses the same pinned workspace build and frozen install as
ordinary quality CI:

```bash
docker compose -f compose.yml -f .github/compose.quality.yml build workspace
docker compose -f compose.yml -f .github/compose.quality.yml run --rm --no-deps workspace pnpm install --frozen-lockfile
docker compose -f compose.yml -f .github/compose.quality.yml run --rm --no-deps workspace pnpm audit --prod --audit-level high
```

Build the exact images scanned by the scheduled workflow with safe synthetic
CI values for Compose's required variables:

```bash
NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET=ci-container-storage-signing-secret \
NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET=ci-container-provider-session-encryption-secret \
NUVITAE_COMMUNITY_ACCESS_SECRET=ci-container-community-access-secret \
NUVITAE_COMMUNITY_COOKIE_SECURE=false \
docker compose build web api worker
```

Gitleaks, CodeQL, and Trivy versions are pinned by their Actions workflow. Use
manual workflow dispatch for an exact hosted reproduction rather than adding
unversioned host tooling or a second application build path.

## Owner-managed settings and deferred controls

The repository owner must inspect and, where the plan supports them:

1. set default workflow permissions to read-only and disallow Actions from
   approving pull requests;
2. enable the dependency graph and Dependabot alerts, then enable GitHub
   Dependency Review if it becomes available and remove the `pnpm audit` PR
   fallback in the same change;
3. enable Code Security/CodeQL custom setup and configure a ruleset that blocks
   high/critical CodeQL findings;
4. enable native secret scanning and push protection, dry-run the push block,
   then remove Gitleaks if native coverage makes it redundant;
5. require the quality/security checks and code-owner approval for protected
   `main`, including package manifests, the lockfile, native-build policy,
   Docker/Compose, Dependabot, and workflows;
6. configure and monitor GitHub private vulnerability reporting (or another
   approved private channel), perform a reporter-to-maintainer dry run, and only
   then add a root `SECURITY.md` with the verified route.

There is no real release image publication workflow, so release SBOM and
keyless provenance remain intentionally absent. The first such workflow must
generate CycloneDX or SPDX for the published images, retain and verify it with
the release, and use GitHub OIDC/keyless attestation rather than a long-lived
signing key.

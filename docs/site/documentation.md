# Documentation workflow

## Build and preview with Docker Compose

From the repository root:

```bash
docker compose -f compose.docs.yml config --quiet
docker compose -f compose.docs.yml build docs
docker compose -f compose.docs.yml run --no-deps docs build --strict --site-dir /tmp/site
docker compose -f compose.docs.yml run --service-ports --no-deps docs serve --strict --dev-addr 0.0.0.0:8000
```

The preview is published only on host loopback port 8000; use the address printed
by the service on your own machine. In an Amp Orb, the agent must register port
8000 and share its current clickable portal URL, not a sandbox-local address.
Agents run the foreground Compose preview through `amp orb service start` so it
survives orb process updates. Stop the foreground preview with Ctrl+C (or the
supervisor's stop command). No application services or data volumes are started.

Build output is disposable container `/tmp/site`; it is never committed or
written over source. Containers are deliberately not auto-removed by these
commands; follow the repository's human-approved cleanup policy. Preview edits
are watched from the read-only source mount. A port conflict can be resolved by
stopping the existing preview, not by exposing it on all host interfaces.

## What CI guarantees

The Documentation workflow uses the same Compose build command on relevant
pull requests and pushes to `main`. It has read-only repository permission,
no deployment credentials, and does not publish a site. MkDocs strict mode turns
warnings into failures: missing nav pages, omitted site pages, broken local page
links and missing anchors are errors. A separate network-disabled check maps this
repository's GitHub `blob/main` and `tree/main` links from `README.md` and
`docs/site/` to the checkout and fails if their file or directory target is
missing. Do not downgrade warnings or link checks to make CI green.

This gate covers `docs/site/`, plus repository targets referenced from the
README and site pages. Existing specialist docs remain linked on GitHub, not
copied into the build/search index. The target check deliberately makes no
network requests and does not validate remote URLs or anchors. Review external
references separately; full legacy-doc ingestion and external-link checking are
explicit follow-ups.

Run the existing containerized Prettier on changed Markdown/YAML:

```bash
docker compose run --rm --no-deps workspace pnpm exec prettier --check docs/site docs/adr/index.md docs/adr/template.md mkdocs.yml compose.docs.yml .github/workflows/docs.yml README.md
```

The workspace command needs the normal application Compose environment; the
standalone docs build does not. Python/application tests are not substitutes
for inspecting the rendered navigation, a diagram/table page and search results.

## Dependency choice and updates

MkDocs 1.6.1 is the only direct runtime documentation dependency. Its bundled
theme, search and syntax highlighting avoid a Material theme/plugin chain or
diagram renderer. Plain-text diagrams stay reviewable in Git and work without
a rendering service. MkDocs is BSD-licensed and its source is maintained at
[mkdocs/mkdocs](https://github.com/mkdocs/mkdocs); review current maintenance and
advisories before upgrades rather than assuming any static generator is risk-free.
Its transitive renderer, YAML, watcher and search dependencies are isolated from
application images. `ghp-import` is an upstream dependency, not authorization to
deploy; no workflow invokes it.

`docker/docs/requirements.txt` pins transitive versions and artifact hashes.
The Python base is pinned by version and digest. Installing the docs image needs
registry/PyPI access; rendering installed docs needs neither provider nor
application network access. The stock theme may load syntax-highlighting assets
from a CDN in the viewer's browser; offline vendoring and a public-site CSP are
not claimed by this foundation.

To deliberately regenerate the lockfile, use a Python 3.12 container and pinned
pip-tools (not a host Python installation):

```bash
docker run --name nuvitae-docs-lock-update \
  -v "$PWD/docker/docs:/requirements" -w /requirements \
  python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c \
  sh -c 'pip install pip-tools==7.5.2 && pip-compile --generate-hashes --strip-extras --index-url https://pypi.org/simple --output-file requirements.txt requirements.in'
```

Change `requirements.in` intentionally, review all version/hash changes and
dependency licences/advisories, then rebuild and inspect the site. The lockfile
update tool is not installed in the runtime docs image. Reuse a new container
name for another update; do not silently delete an existing container.

## Keep source, decisions, and status aligned

- Add a page to `mkdocs.yml` when adding it to `docs/site/`.
- Link site pages relatively with `.md` paths; link source/specialist guides
  explicitly to their repository location. Do not duplicate schema definitions.
- Label current behavior, planned behavior, and unresolved decisions. Name the
  inspected baseline for snapshot claims. Never invent historical rationale.
- Architecture-changing PRs update the affected guide and, when warranted, an
  [ADR](reference.md). New environment variables, services, jobs and endpoints
  update their owning reference; lifecycle/failure changes update troubleshooting.
- Review docs alongside code. Stale documentation is a defect. Before opening
  a PR, confirm no sensitive data is included and update the [coverage ledger](coverage.md)
  when completing a deferred section.

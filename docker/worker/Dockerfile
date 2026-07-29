# syntax=docker/dockerfile:1.7
FROM node:24.15.0-bookworm-slim AS base

ARG PNPM_VERSION=11.15.1
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm config set store-dir /pnpm/store

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/extraction/package.json packages/extraction/package.json
COPY packages/persistence/package.json packages/persistence/package.json
RUN --mount=type=cache,id=nuvitae-worker-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM deps AS builder
COPY apps/worker apps/worker
COPY packages/contracts packages/contracts
COPY packages/domain packages/domain
COPY packages/extraction packages/extraction
COPY packages/persistence packages/persistence
RUN pnpm --filter @nuvitae/contracts build
RUN pnpm --filter @nuvitae/domain build
RUN pnpm --filter @nuvitae/extraction build
RUN pnpm --filter @nuvitae/persistence build
RUN pnpm --filter @nuvitae/worker build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/extraction/package.json packages/extraction/package.json
COPY packages/persistence/package.json packages/persistence/package.json
RUN --mount=type=cache,id=nuvitae-worker-prod-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV WORKER_READY_FILE=/tmp/nuvitae-worker-ready
ENV PARSER_TMP_ROOT=/tmp/nuvitae-parser
WORKDIR /workspace

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    fonts-liberation \
    libreoffice-core \
    libreoffice-writer \
    util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 app \
  && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin app \
  && mkdir -p /tmp/nuvitae-parser \
  && chown app:app /tmp/nuvitae-parser \
  && chmod 0700 /tmp/nuvitae-parser

COPY --from=prod-deps --chown=app:app /workspace/node_modules node_modules
COPY --from=prod-deps --chown=app:app /workspace/apps/worker/node_modules apps/worker/node_modules
COPY --from=prod-deps --chown=app:app /workspace/packages/contracts/node_modules packages/contracts/node_modules
COPY --from=prod-deps --chown=app:app /workspace/packages/extraction/node_modules packages/extraction/node_modules
COPY --from=prod-deps --chown=app:app /workspace/packages/persistence/node_modules packages/persistence/node_modules
COPY --from=builder --chown=app:app /workspace/apps/worker/dist apps/worker/dist
COPY --from=builder --chown=app:app /workspace/apps/worker/package.json apps/worker/package.json
COPY --from=builder --chown=app:app /workspace/packages/contracts/dist packages/contracts/dist
COPY --from=builder --chown=app:app /workspace/packages/contracts/package.json packages/contracts/package.json
COPY --from=builder --chown=app:app /workspace/packages/domain/dist packages/domain/dist
COPY --from=builder --chown=app:app /workspace/packages/domain/package.json packages/domain/package.json
COPY --from=builder --chown=app:app /workspace/packages/extraction/dist packages/extraction/dist
COPY --from=builder --chown=app:app /workspace/packages/extraction/package.json packages/extraction/package.json
COPY --from=builder --chown=app:app /workspace/packages/persistence/dist packages/persistence/dist
COPY --from=builder --chown=app:app /workspace/packages/persistence/package.json packages/persistence/package.json
COPY --chown=app:app docker/entrypoints/worker.sh docker/entrypoints/worker.sh

USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 CMD test -s /tmp/nuvitae-worker-ready
ENTRYPOINT ["docker/entrypoints/worker.sh"]

FROM deps AS parser-test
USER root
RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    fonts-liberation \
    libreoffice-core \
    libreoffice-writer \
    util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /tmp/nuvitae-parser \
  && chown node:node /tmp/nuvitae-parser \
  && chmod 0700 /tmp/nuvitae-parser
COPY --chown=node:node packages/extraction packages/extraction
COPY --chown=node:node vitest.config.ts vitest.config.ts
USER node
ENV PARSER_TMP_ROOT=/tmp/nuvitae-parser
CMD ["node", "node_modules/vitest/vitest.mjs", "run", "packages/extraction/src/docx/libreoffice-rendered-page-count.integration.test.ts"]

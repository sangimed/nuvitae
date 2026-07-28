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
RUN --mount=type=cache,id=nuvitae-worker-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM deps AS builder
COPY apps/worker apps/worker
COPY packages/contracts packages/contracts
RUN pnpm --filter @nuvitae/contracts build
RUN pnpm --filter @nuvitae/worker build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=nuvitae-worker-prod-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV WORKER_READY_FILE=/tmp/nuvitae-worker-ready
WORKDIR /workspace

RUN groupadd --gid 10001 app \
  && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin app

COPY --from=prod-deps --chown=app:app /workspace/node_modules node_modules
COPY --from=prod-deps --chown=app:app /workspace/apps/worker/node_modules apps/worker/node_modules
COPY --from=prod-deps --chown=app:app /workspace/packages/contracts/node_modules packages/contracts/node_modules
COPY --from=builder --chown=app:app /workspace/apps/worker/dist apps/worker/dist
COPY --from=builder --chown=app:app /workspace/apps/worker/package.json apps/worker/package.json
COPY --from=builder --chown=app:app /workspace/packages/contracts/dist packages/contracts/dist
COPY --from=builder --chown=app:app /workspace/packages/contracts/package.json packages/contracts/package.json
COPY --chown=app:app docker/entrypoints/worker.sh docker/entrypoints/worker.sh

USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 CMD test -s /tmp/nuvitae-worker-ready
ENTRYPOINT ["docker/entrypoints/worker.sh"]

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
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/persistence/package.json packages/persistence/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN --mount=type=cache,id=nuvitae-api-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM deps AS builder
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/domain packages/domain
COPY packages/persistence packages/persistence
COPY packages/storage packages/storage
RUN pnpm --filter @nuvitae/contracts build
RUN pnpm --filter @nuvitae/domain build
RUN pnpm --filter @nuvitae/persistence build
RUN pnpm --filter @nuvitae/storage build
RUN pnpm --filter @nuvitae/api build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/persistence/package.json packages/persistence/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN --mount=type=cache,id=nuvitae-api-prod-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace

RUN groupadd --gid 10001 app \
  && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin app

COPY --from=prod-deps --chown=app:app /workspace/node_modules node_modules
COPY --from=prod-deps --chown=app:app /workspace/apps/api/node_modules apps/api/node_modules
COPY --from=prod-deps --chown=app:app /workspace/packages/contracts/node_modules packages/contracts/node_modules
COPY --from=prod-deps --chown=app:app /workspace/packages/persistence/node_modules packages/persistence/node_modules
COPY --from=builder --chown=app:app /workspace/apps/api/dist apps/api/dist
COPY --from=builder --chown=app:app /workspace/apps/api/package.json apps/api/package.json
COPY --from=builder --chown=app:app /workspace/packages/contracts/dist packages/contracts/dist
COPY --from=builder --chown=app:app /workspace/packages/contracts/package.json packages/contracts/package.json
COPY --from=builder --chown=app:app /workspace/packages/domain/dist packages/domain/dist
COPY --from=builder --chown=app:app /workspace/packages/domain/package.json packages/domain/package.json
COPY --from=builder --chown=app:app /workspace/packages/persistence/dist packages/persistence/dist
COPY --from=builder --chown=app:app /workspace/packages/persistence/package.json packages/persistence/package.json
COPY --from=builder --chown=app:app /workspace/packages/storage/dist packages/storage/dist
COPY --from=builder --chown=app:app /workspace/packages/storage/package.json packages/storage/package.json
COPY --chown=app:app docker/entrypoints/api.sh docker/entrypoints/api.sh

USER app
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 CMD node -e "fetch('http://127.0.0.1:3001/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker/entrypoints/api.sh"]

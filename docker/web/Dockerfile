# syntax=docker/dockerfile:1.7
FROM node:24.15.0-bookworm-slim AS base

ARG PNPM_VERSION=11.15.1
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm config set store-dir /pnpm/store

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=nuvitae-web-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM deps AS builder
ARG NUVITAE_INTERNAL_API_BASE_URL=http://api:3001
ENV NUVITAE_INTERNAL_API_BASE_URL=${NUVITAE_INTERNAL_API_BASE_URL}
COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN pnpm --filter @nuvitae/contracts build
RUN pnpm --filter @nuvitae/web build

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace

RUN groupadd --gid 10001 app \
  && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin app

COPY --from=builder --chown=app:app /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /workspace/apps/web/.next/static apps/web/.next/static
COPY --from=builder --chown=app:app /workspace/apps/web/public apps/web/public
COPY --chown=app:app docker/entrypoints/web.sh docker/entrypoints/web.sh

USER app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker/entrypoints/web.sh"]

FROM node:24.15.0-bookworm-slim

ARG USER_ID=1000
ARG GROUP_ID=1000
ARG PNPM_VERSION=11.15.1

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate \
  && mkdir -p /workspace/node_modules \
    /workspace/apps/web/node_modules \
    /workspace/apps/api/node_modules \
    /workspace/apps/worker/node_modules \
    /workspace/packages/contracts/node_modules \
    /workspace/packages/domain/node_modules \
    /workspace/packages/extraction/node_modules \
    /workspace/packages/persistence/node_modules \
    /workspace/packages/storage/node_modules \
    /workspace/packages/test-fixtures/node_modules \
    /pnpm/store \
  && chown -R ${USER_ID}:${GROUP_ID} /workspace /pnpm

WORKDIR /workspace
USER ${USER_ID}:${GROUP_ID}

RUN pnpm config set store-dir /pnpm/store

ENTRYPOINT ["docker/entrypoints/workspace.sh"]
CMD ["pnpm", "dev"]

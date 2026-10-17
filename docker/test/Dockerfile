FROM mcr.microsoft.com/playwright:v1.63.0-noble

ARG USER_ID=1000
ARG GROUP_ID=1000
ARG PNPM_VERSION=11.15.1

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate \
  && mkdir -p /workspace/node_modules /pnpm/store \
  && chown -R ${USER_ID}:${GROUP_ID} /workspace /pnpm

WORKDIR /workspace
USER ${USER_ID}:${GROUP_ID}

RUN pnpm config set store-dir /pnpm/store

ENTRYPOINT ["docker/entrypoints/test.sh"]
CMD ["pnpm", "test"]

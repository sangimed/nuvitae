FROM node:24.15.0-bookworm-slim

ARG CODEX_VERSION=0.146.0

COPY entrypoint.sh /usr/local/bin/codex-runtime-entrypoint

RUN npm install --global "@openai/codex@${CODEX_VERSION}" \
  && chmod 0755 /usr/local/bin/codex-runtime-entrypoint \
  && groupadd --gid 10001 codexruntime \
  && useradd --uid 10001 --gid 10001 --home-dir /workspace --create-home --shell /usr/sbin/nologin codexruntime \
  && groupadd --gid 10002 nuvitaeprobe \
  && useradd --uid 10002 --gid 10002 --home-dir /runtime-tmp --shell /usr/sbin/nologin nuvitaeprobe \
  && mkdir -p /codex-state /workspace /runtime-tmp /socket /evidence \
  && chown -R codexruntime:codexruntime /codex-state /workspace /runtime-tmp /socket /evidence

ENV HOME=/codex-state \
  CODEX_HOME=/codex-state \
  XDG_CONFIG_HOME=/codex-state/.config \
  XDG_CACHE_HOME=/runtime-tmp/.cache \
  XDG_DATA_HOME=/codex-state/.local/share \
  TMPDIR=/runtime-tmp \
  NUVITAE_SPIKE=codex-app-server-runtime \
  NO_COLOR=1

USER 10001:10001
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/codex-runtime-entrypoint"]

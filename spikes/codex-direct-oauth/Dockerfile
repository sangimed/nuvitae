FROM node:24.15.0-alpine

# The stock node image pre-creates `node` at UID/GID 1000. Replace that
# account with the spike identity pinned to UID/GID 1000 to match the T201
# Compose contract (`user: "1000:1000"` on t201-semantic and the
# identity-unmodified t201-result-reader). Fresh disposable result volumes are
# seeded from /spike/result, so the broker's runtime identity must own that
# directory.
RUN deluser node \
  && addgroup -S -g 1000 spike \
  && adduser -S -u 1000 -G spike spike

WORKDIR /spike
COPY --chown=spike:spike . /spike

# Source modes in the build context are not a runtime security boundary.
# Normalize executable search paths and every JavaScript module before changing
# to the non-root runtime user, while keeping the result channel private.
RUN find /spike -type d -exec chmod 0755 {} + \
  && find /spike -type f -name '*.mjs' -exec chmod 0644 {} + \
  && install -d -o spike -g spike -m 0700 /spike/result
USER spike

CMD ["node", "lifecycle-runner.mjs"]

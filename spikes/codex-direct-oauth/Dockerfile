FROM node:24.15.0-alpine

RUN addgroup -S spike && adduser -S -G spike spike

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

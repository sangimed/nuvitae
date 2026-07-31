FROM node:24.15.0-alpine

WORKDIR /spike
COPY . /spike

RUN addgroup -S spike && adduser -S -G spike spike
USER spike

CMD ["node", "lifecycle-runner.mjs"]

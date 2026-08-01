FROM node:24.15.0-alpine

WORKDIR /spike
COPY . /spike

RUN addgroup -S spike && adduser -S -G spike spike
RUN install -d -o spike -g spike -m 0700 /spike/result
USER spike

CMD ["node", "lifecycle-runner.mjs"]

# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS unpack
ARG TARGETARCH
RUN test "$TARGETARCH" = amd64
ADD --checksum=sha256:582b1f3c2fdc5afd443b2d57a225ef654de75adea609fdb66731fd582a9cbc96 https://github.com/openbao/openbao/releases/download/v2.7.2/openbao_2.7.2_linux_amd64.tar.gz /tmp/bao.tar.gz
RUN mkdir /unpacked && tar -xzf /tmp/bao.tar.gz -C /unpacked

FROM node:24-bookworm-slim
COPY --from=unpack /unpacked/bao /usr/local/bin/bao
COPY scripts/staging-bao-health.mjs /opt/cleanops/staging-bao-health.mjs
RUN mkdir -p /var/lib/openbao/raft /var/log/openbao && chown -R node:node /var/lib/openbao /var/log/openbao
USER node
ENTRYPOINT ["/usr/local/bin/bao"]
CMD ["server", "-config=/etc/openbao/server.json"]

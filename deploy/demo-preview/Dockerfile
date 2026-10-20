FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca     if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi;     npm ci --ignore-scripts --strict-ssl=true
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY next.config.ts proxy.ts tsconfig.json ./
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
USER node
CMD ["node","node_modules/next/dist/bin/next","start","-H","0.0.0.0","-p","3000"]

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS gateway
WORKDIR /preview
COPY --chown=node:node deploy/demo-preview/gateway.mjs ./
USER node
CMD ["node","gateway.mjs"]

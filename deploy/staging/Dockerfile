FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Agent sink is owned by the already-verified staging identity (UID/GID 999).
# Numeric runtime identity is inspectable without starting the image.
ARG CLEANOPS_WEB_UID=999
ARG CLEANOPS_WEB_GID=999
RUN groupadd --gid "${CLEANOPS_WEB_GID}" cleanops && useradd --uid "${CLEANOPS_WEB_UID}" --gid "${CLEANOPS_WEB_GID}" --no-create-home --home-dir /app cleanops
COPY --from=build --chown=cleanops:cleanops /app /app
USER ${CLEANOPS_WEB_UID}:${CLEANOPS_WEB_GID}
EXPOSE 3000
CMD ["npm","run","start","--","-H","0.0.0.0"]

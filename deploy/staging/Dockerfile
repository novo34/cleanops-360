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
RUN groupadd -r cleanops && useradd -r -g cleanops -d /app cleanops
COPY --from=build --chown=cleanops:cleanops /app /app
USER cleanops
EXPOSE 3000
CMD ["npm","run","start","--","-H","0.0.0.0"]

# syntax=docker/dockerfile:1
# Built from the repository root:  docker build -f server/Dockerfile .

FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 may need to compile if no prebuilt binary matches the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --workspace=@bolalar-ai/server --include-workspace-root
COPY server ./server
RUN npm run build --workspace=@bolalar-ai/server

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=4000 DATABASE_PATH=/data/bolalar.db

RUN useradd --system --uid 1001 --create-home api && mkdir -p /data && chown api:api /data

COPY --from=build --chown=api:api /app/node_modules ./node_modules
COPY --from=build --chown=api:api /app/server/dist ./server/dist
COPY --from=build --chown=api:api /app/server/package.json ./server/

USER api
EXPOSE 4000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/src/index.js"]

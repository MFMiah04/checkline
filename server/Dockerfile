# Build from the repository root: docker build -f server/Dockerfile .
# The server depends on the engine workspace, so both are needed in the build context.

# ── Stage 1: compile the engine's TypeScript ──────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY engine/package.json engine/
COPY server/package.json server/
RUN npm ci --workspace engine --include-workspace-root

COPY engine engine
RUN npm run build --workspace engine

# ── Stage 2: production image with only what the server needs to run ─────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Install dependencies first so this layer is cached until package files change
COPY package.json package-lock.json ./
COPY engine/package.json engine/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --include-workspace-root

COPY --from=build /app/engine/dist engine/dist
COPY server/src server/src

# Run as the unprivileged user that ships with the node image
USER node
WORKDIR /app/server

EXPOSE 3001

# The server already exposes /health; use it for container health checks
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["node", "src/index.js"]

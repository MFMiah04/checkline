FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Install dependencies first so this layer is cached until package files change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Run as the unprivileged user that ships with the node image
USER node

EXPOSE 3001

# The server already exposes /health; use it for container health checks
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["node", "src/index.js"]

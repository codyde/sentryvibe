# Railway-optimized Dockerfile for SentryVibe Runner
FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm@9.15.0

# Install cloudflared for tunnel support
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    && wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
    && dpkg -i cloudflared-linux-amd64.deb \
    && rm cloudflared-linux-amd64.deb \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/runner/package.json ./apps/runner/
COPY packages/agent-core/package.json ./packages/agent-core/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/runner ./apps/runner
COPY packages/agent-core ./packages/agent-core

# Build agent-core and runner
RUN pnpm --filter @sentryvibe/agent-core build
RUN pnpm --filter @sentryvibe/runner-cli build

# Create workspace directory (will be mounted as volume in Railway)
RUN mkdir -p /data/workspace

# Expose health check port
EXPOSE 8080

# Set environment defaults
ENV NODE_ENV=production
ENV WORKSPACE_ROOT=/data/workspace
ENV HEALTH_PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start runner in service mode
CMD ["node", "apps/runner/dist/index.js", "runner"]

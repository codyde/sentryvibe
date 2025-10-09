FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./

# Copy all workspace packages
COPY packages ./packages
COPY apps/sentryvibe ./apps/sentryvibe

# Install dependencies for entire workspace
RUN pnpm install --frozen-lockfile

# Build sentryvibe
WORKDIR /app/apps/sentryvibe
RUN pnpm run build

# Production stage
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY --from=base /app/pnpm-workspace.yaml ./
COPY --from=base /app/pnpm-lock.yaml ./
COPY --from=base /app/package.json ./

# Copy packages (needed for workspace dependencies)
COPY --from=base /app/packages ./packages

# Copy built sentryvibe app
COPY --from=base /app/apps/sentryvibe ./apps/sentryvibe

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/sentryvibe

EXPOSE 3000

CMD ["pnpm", "start"]

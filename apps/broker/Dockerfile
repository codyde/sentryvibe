FROM node:20-alpine

WORKDIR /app

# Copy package files for broker
COPY apps/broker/package.json apps/broker/package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy TypeScript config
COPY apps/broker/tsconfig.json ./

# Copy source code
COPY apps/broker/src ./src

# Install typescript as dev dependency for build
RUN npm install --save-dev typescript

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Expose port (Railway will override this with PORT env var)
EXPOSE 4000

# Start the broker
CMD ["node", "dist/index.js"]

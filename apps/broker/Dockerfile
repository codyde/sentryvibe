FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm install

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 4000

# Start the broker
CMD ["node", "dist/index.js"]

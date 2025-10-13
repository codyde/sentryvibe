#!/bin/bash
set -e

echo "🔨 Building SentryVibe CLI..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps/runner" ]; then
  echo "❌ Error: Must run from sentryvibe repository root"
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
  echo ""
fi

# Build the CLI
echo "🔧 Building CLI package..."
pnpm run build:cli
echo ""

# Link globally
echo "🔗 Linking CLI globally..."
cd apps/runner
npm link
echo ""

echo "✅ CLI built and linked successfully!"
echo ""
echo "You can now use these commands:"
echo "  sentryvibe run        # Start full stack"
echo "  sentryvibe --runner   # Start runner only"
echo "  sentryvibe --help     # Show help"
echo ""
echo "To unlink later:"
echo "  npm unlink -g @sentryvibe/runner-cli"
echo ""

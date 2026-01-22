#!/bin/bash
set -e

echo "🔨 Building OpenBuilder CLI..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps/runner" ]; then
  echo "❌ Error: Must run from openbuilder repository root"
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
  echo ""
fi

# Rebuild agent-core to ensure latest changes
echo "🔄 Building @openbuilder/agent-core..."
pnpm --filter @openbuilder/agent-core build
echo ""

# Build the CLI
echo "🔧 Building CLI package..."
pnpm run build:cli
echo ""

# Link globally
echo "🔗 Linking CLI globally..."
cd apps/runner

# Detect if pnpm is available, use it for linking (preferred)
if command -v pnpm &> /dev/null; then
  echo "   Using pnpm for global link..."
  pnpm link --global
else
  echo "   Using npm for global link..."
  npm link
fi

echo ""

echo "✅ CLI built and linked successfully!"
echo ""
echo "You can now use these commands:"
echo "  openbuilder run        # Start full stack"
echo "  openbuilder --runner   # Start runner only"
echo "  openbuilder --help     # Show help"
echo ""
echo "To unlink later:"
if command -v pnpm &> /dev/null; then
  echo "  pnpm remove -g @openbuilder/cli"
else
  echo "  npm unlink -g @openbuilder/cli"
fi
echo ""

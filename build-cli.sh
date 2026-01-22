#!/bin/bash
set -e

echo "🔨 Building ShipBuilder CLI..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps/runner" ]; then
  echo "❌ Error: Must run from shipbuilder repository root"
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
  echo ""
fi

# Rebuild agent-core to ensure latest changes
echo "🔄 Building @shipbuilder/agent-core..."
pnpm --filter @shipbuilder/agent-core build
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
echo "  shipbuilder run        # Start full stack"
echo "  shipbuilder --runner   # Start runner only"
echo "  shipbuilder --help     # Show help"
echo ""
echo "To unlink later:"
if command -v pnpm &> /dev/null; then
  echo "  pnpm remove -g @shipbuilder/cli"
else
  echo "  npm unlink -g @shipbuilder/cli"
fi
echo ""

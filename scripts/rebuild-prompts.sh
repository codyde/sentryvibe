#!/bin/bash

# Quick rebuild of agent-core prompts for development
# Use this after editing packages/agent-core/src/lib/prompts.ts

set -e

echo "🔧 Rebuilding agent-core prompts..."
pnpm --filter @sentryvibe/agent-core build

echo ""
echo "✅ Prompts rebuilt!"
echo ""
echo "🔄 Now restart your runner:"
echo "   pnpm run runner"
echo ""

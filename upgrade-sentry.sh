#!/bin/bash
# Clean reinstall script to force upgrade to Sentry 10.25.0

set -e

echo "🧹 Cleaning all node_modules..."

# Delete all node_modules directories
rm -rf node_modules
rm -rf apps/sentryvibe/node_modules
rm -rf apps/runner/node_modules
rm -rf apps/broker/node_modules
rm -rf packages/agent-core/node_modules
rm -rf package/node_modules

echo "✅ All node_modules deleted"

echo ""
echo "🗑️  Pruning pnpm store..."
pnpm store prune

echo "✅ pnpm store pruned"

echo ""
echo "📦 Reinstalling dependencies (this will extract fresh 10.25.0 from vendor tgz files)..."
pnpm install

echo ""
echo "✅ Dependencies reinstalled!"

echo ""
echo "🔍 Verifying Sentry SDK versions..."
echo ""

echo "Backend (@sentry/nextjs):"
cat apps/sentryvibe/node_modules/@sentry/nextjs/package.json | grep '"version"'

echo ""
echo "Runner (@sentry/node):"
cat apps/runner/node_modules/@sentry/node/package.json | grep '"version"'

echo ""
echo "✅ Upgrade complete!"
echo ""
echo "Next steps:"
echo "1. Run: pnpm build:all"
echo "2. Run: pnpm start:all"
echo "3. Check Sentry logs for: sdk.version: 10.25.0"
echo "4. Test metrics (should work without _experiments flag)"


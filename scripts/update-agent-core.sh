#!/bin/bash

# ============================================================================
# update-agent-core.sh
#
# Rebuilds the @sentryvibe/agent-core package and updates all dependencies
# across the monorepo.
#
# What this script does:
# 1. Builds agent-core TypeScript source
# 2. Packs it into a .tgz tarball
# 3. Moves to vendor/ directory
# 4. Updates all package.json files to reference new version
# 5. Reinstalls dependencies across all apps
#
# When to run this:
# - After making changes to packages/agent-core/src/**
# - Before committing changes that affect shared code
# - When onboarding new developers (ensures fresh build)
#
# Usage:
#   ./scripts/update-agent-core.sh
#
# ============================================================================

set -e

echo "🔧 Updating @sentryvibe/agent-core package..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get to root directory
cd "$(dirname "$0")/.."
ROOT_DIR=$(pwd)

echo -e "${BLUE}📦 Step 1: Building agent-core...${NC}"
cd packages/agent-core
pnpm build

echo ""
echo -e "${BLUE}📦 Step 2: Packing agent-core...${NC}"
PACKED_FILE=$(pnpm pack --pack-destination "$ROOT_DIR/vendor" 2>&1 | grep -o "sentryvibe-agent-core-.*\.tgz" | head -1)

if [ -z "$PACKED_FILE" ]; then
  echo -e "${YELLOW}⚠️  Could not detect packed filename, trying alternative method...${NC}"
  pnpm pack
  PACKED_FILE=$(ls -t sentryvibe-agent-core-*.tgz 2>/dev/null | head -1)

  if [ -z "$PACKED_FILE" ]; then
    echo "❌ Failed to pack agent-core"
    exit 1
  fi

  # Move to vendor
  mv "$PACKED_FILE" "$ROOT_DIR/vendor/"
fi

cd "$ROOT_DIR"

echo -e "${GREEN}✅ Packed: $PACKED_FILE${NC}"
echo ""

# Extract version from filename (e.g., sentryvibe-agent-core-0.1.0.tgz -> 0.1.0)
VERSION=$(echo "$PACKED_FILE" | sed 's/sentryvibe-agent-core-\(.*\)\.tgz/\1/')

echo -e "${BLUE}📝 Step 3: Updating package.json files to version $VERSION...${NC}"

# Update apps/sentryvibe/package.json
if grep -q "@sentryvibe/agent-core" apps/sentryvibe/package.json; then
  sed -i.bak "s|\"@sentryvibe/agent-core\": \"file:.*\"|\"@sentryvibe/agent-core\": \"file:../../vendor/$PACKED_FILE\"|" apps/sentryvibe/package.json
  rm apps/sentryvibe/package.json.bak
  echo -e "${GREEN}  ✅ Updated apps/sentryvibe/package.json${NC}"
fi

# Update apps/runner/package.json
if grep -q "@sentryvibe/agent-core" apps/runner/package.json; then
  sed -i.bak "s|\"@sentryvibe/agent-core\": \"file:.*\"|\"@sentryvibe/agent-core\": \"file:../../vendor/$PACKED_FILE\"|" apps/runner/package.json
  rm apps/runner/package.json.bak
  echo -e "${GREEN}  ✅ Updated apps/runner/package.json${NC}"
fi

# Update apps/broker/package.json
if grep -q "@sentryvibe/agent-core" apps/broker/package.json; then
  sed -i.bak "s|\"@sentryvibe/agent-core\": \"file:.*\"|\"@sentryvibe/agent-core\": \"file:../../vendor/$PACKED_FILE\"|" apps/broker/package.json
  rm apps/broker/package.json.bak
  echo -e "${GREEN}  ✅ Updated apps/broker/package.json${NC}"
fi

echo ""
echo -e "${BLUE}🔄 Step 4: Reinstalling dependencies...${NC}"
pnpm install

echo ""
echo -e "${GREEN}✅ agent-core updated successfully!${NC}"
echo ""
echo -e "${YELLOW}📋 Summary:${NC}"
echo "  Version: $VERSION"
echo "  Package: vendor/$PACKED_FILE"
echo "  Updated: sentryvibe, runner, broker"
echo ""
echo -e "${BLUE}💡 Next steps:${NC}"
echo "  • Test your changes: pnpm dev:all"
echo "  • Build for production: pnpm build:all"
echo ""

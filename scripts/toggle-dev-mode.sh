#!/bin/bash

# ============================================================================
# toggle-dev-mode.sh
#
# Toggles between development mode (workspace:*) and production mode (vendored tarballs)
#
# Development Mode:
#   - Uses workspace:* for @sentryvibe/agent-core
#   - Fast iteration, changes picked up on restart
#   - No tarball rebuilds needed
#
# Production Mode:
#   - Uses file:../../vendor/*.tgz for @sentryvibe/agent-core
#   - Self-contained, ready for CLI distribution
#   - No workspace dependencies
#
# Usage:
#   ./scripts/toggle-dev-mode.sh dev      # Switch to development mode
#   ./scripts/toggle-dev-mode.sh prod     # Switch to production mode
#
# ============================================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get to root directory
cd "$(dirname "$0")/.."
ROOT_DIR=$(pwd)

# Check argument
MODE=$1

if [ -z "$MODE" ]; then
  echo -e "${RED}❌ Error: Mode required${NC}"
  echo ""
  echo "Usage:"
  echo "  ./scripts/toggle-dev-mode.sh dev   # Development mode (workspace:*)"
  echo "  ./scripts/toggle-dev-mode.sh prod  # Production mode (vendored tarballs)"
  echo ""
  exit 1
fi

if [ "$MODE" = "dev" ]; then
  echo -e "${BLUE}🔧 Switching to DEVELOPMENT mode...${NC}"
  echo ""

  # Update apps/sentryvibe/package.json
  sed -i.bak 's|"@sentryvibe/agent-core": "file:.*"|"@sentryvibe/agent-core": "workspace:*"|' apps/sentryvibe/package.json
  rm -f apps/sentryvibe/package.json.bak
  echo -e "${GREEN}  ✅ Updated apps/sentryvibe/package.json${NC}"

  # Update apps/runner/package.json
  sed -i.bak 's|"@sentryvibe/agent-core": "file:.*"|"@sentryvibe/agent-core": "workspace:*"|' apps/runner/package.json
  rm -f apps/runner/package.json.bak
  echo -e "${GREEN}  ✅ Updated apps/runner/package.json${NC}"

  # Update apps/broker/package.json if exists
  if [ -f apps/broker/package.json ]; then
    sed -i.bak 's|"@sentryvibe/agent-core": "file:.*"|"@sentryvibe/agent-core": "workspace:*"|' apps/broker/package.json
    rm -f apps/broker/package.json.bak
    echo -e "${GREEN}  ✅ Updated apps/broker/package.json${NC}"
  fi

  echo ""
  echo -e "${BLUE}📦 Reinstalling dependencies...${NC}"
  pnpm install

  echo ""
  echo -e "${GREEN}✅ DEVELOPMENT MODE ACTIVE${NC}"
  echo ""
  echo "Changes to packages/agent-core will be picked up on restart."
  echo "No tarball rebuilds needed!"
  echo ""

elif [ "$MODE" = "prod" ]; then
  echo -e "${BLUE}📦 Switching to PRODUCTION mode...${NC}"
  echo ""

  # First, ensure we have a fresh tarball
  echo -e "${YELLOW}Building fresh agent-core tarball...${NC}"
  cd packages/agent-core
  pnpm build
  PACKED_FILE=$(pnpm pack --pack-destination "$ROOT_DIR/vendor" 2>&1 | grep -o "sentryvibe-agent-core-.*\.tgz" | head -1)

  if [ -z "$PACKED_FILE" ]; then
    echo -e "${RED}❌ Failed to pack agent-core${NC}"
    exit 1
  fi

  cd "$ROOT_DIR"
  echo -e "${GREEN}  ✅ Packed: $PACKED_FILE${NC}"
  echo ""

  # Update apps/sentryvibe/package.json
  sed -i.bak "s|\"@sentryvibe/agent-core\": \".*\"|\"@sentryvibe/agent-core\": \"file:../../vendor/$PACKED_FILE\"|" apps/sentryvibe/package.json
  rm -f apps/sentryvibe/package.json.bak
  echo -e "${GREEN}  ✅ Updated apps/sentryvibe/package.json${NC}"

  # Update apps/runner/package.json
  sed -i.bak "s|\"@sentryvibe/agent-core\": \".*\"|\"@sentryvibe/agent-core\": \"file:../../vendor/$PACKED_FILE\"|" apps/runner/package.json
  rm -f apps/runner/package.json.bak
  echo -e "${GREEN}  ✅ Updated apps/runner/package.json${NC}"

  # Update apps/broker/package.json if exists
  if [ -f apps/broker/package.json ]; then
    sed -i.bak "s|\"@sentryvibe/agent-core\": \".*\"|\"@sentryvibe/agent-core\": \"file:../../vendor/$PACKED_FILE\"|" apps/broker/package.json
    rm -f apps/broker/package.json.bak
    echo -e "${GREEN}  ✅ Updated apps/broker/package.json${NC}"
  fi

  echo ""
  echo -e "${BLUE}📦 Reinstalling dependencies...${NC}"
  pnpm install

  echo ""
  echo -e "${GREEN}✅ PRODUCTION MODE ACTIVE${NC}"
  echo ""
  echo "Ready to package CLI:"
  echo "  cd apps/runner"
  echo "  pnpm build"
  echo "  pnpm pack"
  echo ""

else
  echo -e "${RED}❌ Error: Invalid mode '$MODE'${NC}"
  echo ""
  echo "Valid modes:"
  echo "  dev   - Development mode (workspace:*)"
  echo "  prod  - Production mode (vendored tarballs)"
  echo ""
  exit 1
fi

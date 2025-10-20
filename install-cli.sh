#!/bin/bash
set -e

# SentryVibe CLI Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/codyde/sentryvibe/main/install-cli.sh | bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🚀 SentryVibe CLI Installer${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✖ Node.js not found${NC}"
    echo ""
    echo "Please install Node.js 20+ first:"
    echo "  https://nodejs.org/"
    echo ""
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}✖ Node.js 20+ required (you have $(node --version))${NC}"
    echo ""
    echo "Please upgrade Node.js:"
    echo "  https://nodejs.org/"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node --version) detected"

# Check for pnpm (preferred) or npm
if command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
    echo -e "${GREEN}✓${NC} pnpm $(pnpm --version) detected"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    echo -e "${GREEN}✓${NC} npm $(npm --version) detected"
else
    echo -e "${RED}✖ Neither pnpm nor npm found${NC}"
    echo ""
    echo "Please install pnpm (recommended):"
    echo "  npm install -g pnpm"
    echo ""
    exit 1
fi

echo ""

# Get latest release tag by following GitHub's redirect
echo -e "${BLUE}📥 Fetching latest CLI release...${NC}"

LATEST_RELEASE_URL="https://github.com/codyde/sentryvibe/releases/latest"
LOCATION_HEADER=$(curl -fsI "$LATEST_RELEASE_URL" 2>/dev/null | tr -d '\r' | awk '/^location:/ {print $2}' | tail -n1)

TAG_NAME=""
if [ -n "$LOCATION_HEADER" ]; then
    TAG_NAME="${LOCATION_HEADER##*/}"
fi

# Validate tag looks like a release (v* or cli-v* format)
if [ -z "$TAG_NAME" ] || [[ "$TAG_NAME" != v* && "$TAG_NAME" != cli-v* ]]; then
    echo -e "${YELLOW}!${NC} Could not auto-detect release, trying npm registry..."

    # Try to get version from npm
    if NPM_VERSION=$(npm view @sentryvibe/runner-cli version 2>/dev/null); then
        echo -e "${GREEN}✓${NC} Found version ${NPM_VERSION} on npm"
        TAG_NAME="v${NPM_VERSION}"
    else
        echo -e "${YELLOW}!${NC} Using fallback version: v0.4.3"
        TAG_NAME="v0.4.3"
    fi
fi

echo -e "${GREEN}✓${NC} Target version: ${TAG_NAME}"
echo ""

# Download and install
DOWNLOAD_URL="https://github.com/codyde/sentryvibe/releases/download/${TAG_NAME}/sentryvibe-cli.tgz"

echo -e "${BLUE}📦 Installing SentryVibe CLI globally...${NC}"
echo "   Source: ${DOWNLOAD_URL}"
echo "   Package Manager: ${PKG_MANAGER}"
echo ""

# Install with chosen package manager
if [ "$PKG_MANAGER" = "pnpm" ]; then
    pnpm add -g "$DOWNLOAD_URL"
else
    npm install -g "$DOWNLOAD_URL"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ Installation complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Verify installation:"
    echo -e "  ${CYAN}sentryvibe --version${NC}"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Quick Start${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${BLUE}1.${NC} Initialize configuration (creates .env and workspace):"
    echo -e "     ${YELLOW}sentryvibe init -y${NC}"
    echo ""
    echo -e "  ${BLUE}2.${NC} Start full stack (local development):"
    echo -e "     ${YELLOW}sentryvibe run${NC}"
    echo ""
    echo -e "     This starts:"
    echo "     • Next.js web app (http://localhost:3000)"
    echo "     • WebSocket broker (ws://localhost:4000)"
    echo "     • Runner service (connected to broker)"
    echo ""
    echo -e "  ${BLUE}3.${NC} Or connect runner to remote broker (Railway/production):"
    echo -e "     ${YELLOW}sentryvibe runner --broker wss://broker.your-domain.app/socket --secret YOUR_SECRET${NC}"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Configuration${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Required environment variables (set via 'sentryvibe init'):"
    echo "  • ANTHROPIC_API_KEY - For Claude Code builds"
    echo "  • OPENAI_API_KEY - For Codex builds (optional)"
    echo "  • DATABASE_URL - PostgreSQL connection string"
    echo "  • RUNNER_SHARED_SECRET - Authentication token"
    echo ""
    echo "Commands:"
    echo -e "  ${CYAN}sentryvibe status${NC}      - Show configuration and status"
    echo -e "  ${CYAN}sentryvibe config list${NC} - List all config values"
    echo -e "  ${CYAN}sentryvibe database${NC}    - Set up new database"
    echo -e "  ${CYAN}sentryvibe cleanup --all${NC} - Clean workspace"
    echo ""
    echo "Documentation:"
    echo "  https://github.com/codyde/sentryvibe#readme"
    echo ""
else
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  ✖ Installation failed${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Try manual installation:"
    echo "  ${PKG_MANAGER} install -g ${DOWNLOAD_URL}"
    echo ""
    echo "Or install from npm registry:"
    echo "  ${PKG_MANAGER} install -g @sentryvibe/runner-cli"
    echo ""
    echo "Common issues:"
    echo "  • Network connectivity problems"
    echo "  • Insufficient permissions (try with sudo)"
    echo "  • npm/pnpm cache issues (try: npm cache clean --force)"
    echo ""
    exit 1
fi

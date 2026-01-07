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
PURPLE='\033[0;35m'
BRIGHT_PURPLE='\033[0;95m'
NC='\033[0m' # No Color

# Display SentryVibe ASCII banner
echo ""
echo -e "${CYAN}███████╗███████╗███╗   ██╗████████╗██████╗ ██╗   ██╗${BRIGHT_PURPLE}██╗   ██╗██╗██████╗ ███████╗${NC}"
echo -e "${CYAN}██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔══██╗╚██╗ ██╔╝${BRIGHT_PURPLE}██║   ██║██║██╔══██╗██╔════╝${NC}"
echo -e "${CYAN}███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ╚████╔╝ ${BRIGHT_PURPLE}██║   ██║██║██████╔╝█████╗${NC}"
echo -e "${CYAN}╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗  ╚██╔╝  ${BRIGHT_PURPLE}╚██╗ ██╔╝██║██╔══██╗██╔══╝${NC}"
echo -e "${CYAN}███████║███████╗██║ ╚████║   ██║   ██║  ██║   ██║   ${BRIGHT_PURPLE} ╚████╔╝ ██║██████╔╝███████╗${NC}"
echo -e "${CYAN}╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ${BRIGHT_PURPLE}  ╚═══╝  ╚═╝╚═════╝ ╚══════╝${NC}"
echo ""
echo -e "${BLUE}                        CLI Installer${NC}"
echo ""

# Function to load nvm
load_nvm() {
    export NVM_DIR="${HOME}/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
        return 0
    elif [ -s "/usr/local/opt/nvm/nvm.sh" ]; then
        . "/usr/local/opt/nvm/nvm.sh"
        return 0
    elif [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
        . "/opt/homebrew/opt/nvm/nvm.sh"
        return 0
    fi
    return 1
}

# Check for Node.js
NEED_NODE_INSTALL=false
NEED_NODE_UPGRADE=false

if ! command -v node &> /dev/null; then
    NEED_NODE_INSTALL=true
    echo -e "${YELLOW}!${NC} Node.js not found"
else
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        NEED_NODE_UPGRADE=true
        echo -e "${YELLOW}!${NC} Node.js 20+ required (you have $(node --version))"
    fi
fi

# If Node.js needs to be installed or upgraded, try using nvm
if [ "$NEED_NODE_INSTALL" = true ] || [ "$NEED_NODE_UPGRADE" = true ]; then
    echo -e "${BLUE}📦 Attempting to install Node.js 20 via nvm...${NC}"
    
    # Try to load nvm
    if load_nvm && command -v nvm &> /dev/null; then
        echo -e "${GREEN}✓${NC} nvm detected"
        
        # Install Node.js 20
        echo -e "${BLUE}  Installing Node.js 20...${NC}"
        if nvm install 20 && nvm use 20; then
            echo -e "${GREEN}✓${NC} Node.js 20 installed via nvm"
        else
            echo -e "${RED}✖ Failed to install Node.js 20 via nvm${NC}"
            echo ""
            echo "Please install Node.js 20+ manually:"
            echo "  nvm install 20"
            echo "  nvm use 20"
            echo ""
            exit 1
        fi
    else
        echo -e "${RED}✖ nvm not found${NC}"
        echo ""
        echo "Please install nvm first, then run this script again:"
        echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
        echo ""
        echo "Or install Node.js 20+ directly:"
        echo "  https://nodejs.org/"
        echo ""
        exit 1
    fi
fi

echo -e "${GREEN}✓${NC} Node.js $(node --version) detected"

# Check for pnpm (preferred) - install if missing
if command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
    echo -e "${GREEN}✓${NC} pnpm $(pnpm --version) detected"
else
    echo -e "${YELLOW}!${NC} pnpm not found, installing..."
    
    if command -v npm &> /dev/null; then
        echo -e "${BLUE}📦 Installing pnpm globally via npm...${NC}"
        if npm install -g pnpm; then
            PKG_MANAGER="pnpm"
            echo -e "${GREEN}✓${NC} pnpm $(pnpm --version) installed"
        else
            echo -e "${YELLOW}!${NC} Failed to install pnpm, falling back to npm"
            PKG_MANAGER="npm"
            echo -e "${GREEN}✓${NC} npm $(npm --version) detected"
        fi
    else
        echo -e "${RED}✖ npm not found, cannot install pnpm${NC}"
        echo ""
        echo "Please install Node.js which includes npm:"
        echo "  https://nodejs.org/"
        echo ""
        exit 1
    fi
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
        echo -e "${YELLOW}!${NC} Using fallback version: v0.19.5"
        TAG_NAME="v0.19.5"
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

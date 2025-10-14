#!/bin/bash
set -e

# SentryVibe CLI Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/codyde/sentryvibe/main/install-cli.sh | bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
    echo "Please install Node.js 18+ first:"
    echo "  https://nodejs.org/"
    echo ""
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✖ Node.js 18+ required (you have $(node --version))${NC}"
    echo ""
    echo "Please upgrade Node.js:"
    echo "  https://nodejs.org/"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node --version) detected"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✖ npm not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} npm $(npm --version) detected"
echo ""

# Get latest release
echo -e "${BLUE}📥 Fetching latest release...${NC}"

GITHUB_API_URL="https://api.github.com/repos/codyde/sentryvibe/releases"
API_RESPONSE=$(curl -sfL \
    -H "Accept: application/vnd.github+json" \
    -H "User-Agent: sentryvibe-cli-installer" \
    "$GITHUB_API_URL" || true)

# Get the latest release that ships the CLI tarball asset
# Use Node (we already verified it's installed) to parse JSON safely.
TAG_NAME=""
if [ -n "$API_RESPONSE" ]; then
    TAG_NAME=$(node <<'NODE'
const data = require('fs').readFileSync(0, 'utf-8');
if (!data.trim()) {
  process.exit(0);
}

let releases;
try {
  releases = JSON.parse(data);
} catch {
  process.exit(0);
}

const match = releases.find(
  release => (release.assets || []).some(asset => asset.name === 'sentryvibe-cli.tgz'),
);

if (match?.tag_name) {
  console.log(match.tag_name);
}
NODE
    <<<"$API_RESPONSE")
fi

if [ -z "$TAG_NAME" ]; then
    if [ -n "$API_RESPONSE" ] && echo "$API_RESPONSE" | grep -q '"message"'; then
        echo -e "${YELLOW}!${NC} GitHub API responded with:"
        echo "$API_RESPONSE"
        echo ""
    fi
    # Fallback: hardcode latest known version
    TAG_NAME="runner-cli-v0.1.11"
fi

if [ -z "$TAG_NAME" ]; then
    echo -e "${RED}✖ Could not determine CLI release${NC}"
    echo ""
    echo "Please check https://github.com/codyde/sentryvibe/releases for available versions"
    exit 1
fi

echo -e "${GREEN}✓${NC} Latest version: ${TAG_NAME}"
echo ""

# Download and install
DOWNLOAD_URL="https://github.com/codyde/sentryvibe/releases/download/${TAG_NAME}/sentryvibe-cli.tgz"

echo -e "${BLUE}📦 Installing SentryVibe CLI...${NC}"
echo "   Source: ${DOWNLOAD_URL}"
echo ""

npm install -g "$DOWNLOAD_URL"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ Installation complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Next steps:"
    echo ""
    echo -e "  ${BLUE}1.${NC} Initialize configuration:"
    echo -e "     ${YELLOW}sentryvibe init -y${NC}"
    echo ""
    echo -e "  ${BLUE}2.${NC} Start full stack (local development):"
    echo -e "     ${YELLOW}sentryvibe run${NC}"
    echo ""
    echo -e "  ${BLUE}3.${NC} Or connect to remote (Railway):"
    echo -e "     ${YELLOW}sentryvibe runner --broker wss://broker.up.railway.app/socket --secret YOUR_SECRET${NC}"
    echo ""
    echo "Documentation:"
    echo "  https://github.com/codyde/sentryvibe#readme"
    echo ""
else
    echo ""
    echo -e "${RED}✖ Installation failed${NC}"
    echo ""
    echo "Try manual installation:"
    echo "  npm install -g ${DOWNLOAD_URL}"
    echo ""
    exit 1
fi

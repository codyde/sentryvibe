#!/bin/bash
# SentryVibe Environment Setup Script
# Creates .env.local files for all services with default values

set -e

echo "🔧 SentryVibe Environment Setup"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to create .env.local file
create_env_file() {
    local file_path="$1"
    local content="$2"
    
    if [ -f "$file_path" ]; then
        echo -e "${YELLOW}⚠️  $file_path already exists${NC}"
        read -p "   Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}   Skipped${NC}"
            return
        fi
    fi
    
    echo "$content" > "$file_path"
    echo -e "${GREEN}✅ Created $file_path${NC}"
}

# 1. Create sentryvibe/.env.local
echo "📝 Creating apps/sentryvibe/.env.local..."
create_env_file "apps/sentryvibe/.env.local" "# SentryVibe Web Application Environment Configuration
# =======================================================

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/sentryvibe

# AI Service API Keys
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-openai-key-here

# Runner Communication
RUNNER_SHARED_SECRET=dev-secret
RUNNER_BROKER_URL=ws://localhost:4000/socket
RUNNER_BROKER_HTTP_URL=http://localhost:4000
RUNNER_DEFAULT_ID=default
NEXT_PUBLIC_RUNNER_DEFAULT_ID=default

# Server Configuration
PORT=3000
HOSTNAME=localhost
NODE_ENV=development"

echo ""

# 2. Create broker/.env.local
echo "📝 Creating apps/broker/.env.local..."
create_env_file "apps/broker/.env.local" "# SentryVibe Broker Service Environment Configuration
# =====================================================

# Server Configuration
PORT=4000
BROKER_PORT=4000

# Runner Authentication
RUNNER_SHARED_SECRET=dev-secret

# Event Target Configuration
RUNNER_EVENT_TARGET_URL=http://localhost:3000

# Node Configuration
NODE_ENV=development"

echo ""

# 3. Create runner/.env.local
echo "📝 Creating apps/runner/.env.local..."
create_env_file "apps/runner/.env.local" "# SentryVibe Runner CLI Environment Configuration
# =================================================

# Runner Identity
RUNNER_ID=local

# Broker Connection
RUNNER_BROKER_URL=ws://localhost:4000/socket
RUNNER_SHARED_SECRET=dev-secret

# Workspace Configuration
WORKSPACE_ROOT=~/sentryvibe-workspace

# AI Service API Keys
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-openai-key-here

# Node Configuration
NODE_ENV=development"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✨ Environment files created successfully!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Update these values before starting:${NC}"
echo ""
echo "1. 🔑 API Keys (Required):"
echo "   - ANTHROPIC_API_KEY (get from https://console.anthropic.com/)"
echo "   - OPENAI_API_KEY (get from https://platform.openai.com/api-keys)"
echo ""
echo "2. 🗄️  Database (Required):"
echo "   - DATABASE_URL (PostgreSQL connection string)"
echo ""
echo "3. 🔐 Shared Secret (Optional for dev):"
echo "   - RUNNER_SHARED_SECRET is set to 'dev-secret'"
echo "   - Change this for production!"
echo ""
echo "To edit the files:"
echo "  vim apps/sentryvibe/.env.local"
echo "  vim apps/broker/.env.local"
echo "  vim apps/runner/.env.local"
echo ""
echo "Or use your preferred editor:"
echo "  code apps/sentryvibe/.env.local"
echo ""
echo "📖 See ENV_SETUP_GUIDE.md for detailed configuration info"
echo ""


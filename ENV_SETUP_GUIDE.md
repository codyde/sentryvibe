# Environment Configuration Guide

This guide will help you rebuild your `.env.local` files for the SentryVibe project.

## Quick Setup

Run this script to create all `.env.local` files with default values:

```bash
./create-env-files.sh
```

Then edit each file with your actual API keys and configuration.

## Manual Setup

If you prefer to create the files manually, follow the sections below.

---

## 1. Web Application (`apps/sentryvibe/.env.local`)

```bash
cd /Users/codydearkland/sentryvibe/apps/sentryvibe
cat > .env.local << 'EOF'
# SentryVibe Web Application Environment Configuration
# =======================================================

# Database Configuration
# -----------------------
# PostgreSQL connection string
# Format: postgresql://username:password@host:port/database
DATABASE_URL=postgresql://user:password@localhost:5432/sentryvibe

# AI Service API Keys
# -------------------
# Anthropic API Key (Required for Claude Code builds)
# Get your key from: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-your-key-here

# OpenAI API Key (Optional, for Codex builds)
# Get your key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-key-here

# Runner Communication
# --------------------
# Shared secret for authenticating runner/broker communication
# Use a strong random string in production
RUNNER_SHARED_SECRET=dev-secret

# WebSocket URL for broker connection
# Local: ws://localhost:4000/socket
# Production: wss://broker.your-domain.app/socket
RUNNER_BROKER_URL=ws://localhost:4000/socket

# HTTP URL for broker API calls
# Local: http://localhost:4000
# Production: https://broker.your-domain.app
RUNNER_BROKER_HTTP_URL=http://localhost:4000

# Default runner ID to use when no runner is selected
# This should match the runner-id of your local runner
RUNNER_DEFAULT_ID=default
NEXT_PUBLIC_RUNNER_DEFAULT_ID=default

# Server Configuration
# ---------------------
# Port for Next.js server (default: 3000)
PORT=3000

# Hostname for Next.js server (default: localhost)
HOSTNAME=localhost

# Node environment (development, production)
NODE_ENV=development

# Sentry Configuration (Optional)
# --------------------------------
# Sentry DSN for error tracking
# Already configured in sentry.server.config.ts, but can be overridden
# SENTRY_DSN=https://your-dsn@o123456.ingest.sentry.io/123456

# Sentry release tracking (optional)
# SENTRY_RELEASE=v1.0.0

# Sentry environment (optional)
# SENTRY_ENVIRONMENT=development
EOF
```

---

## 2. Broker Service (`apps/broker/.env.local`)

```bash
cd /Users/codydearkland/sentryvibe/apps/broker
cat > .env.local << 'EOF'
# SentryVibe Broker Service Environment Configuration
# =====================================================

# Server Configuration
# --------------------
# Port for the broker service (default: 4000)
PORT=4000
BROKER_PORT=4000

# Runner Authentication
# ----------------------
# Shared secret for authenticating runner connections
# This MUST match the RUNNER_SHARED_SECRET in sentryvibe and runner apps
RUNNER_SHARED_SECRET=dev-secret

# Event Target Configuration
# ---------------------------
# URL of the Next.js app where events should be forwarded
# The broker forwards runner events to this endpoint
# Local: http://localhost:3000
# Production: https://your-app-domain.app
RUNNER_EVENT_TARGET_URL=http://localhost:3000

# Sentry Configuration (Optional)
# --------------------------------
# Sentry DSN for error tracking and performance monitoring
# Already has a default in instrument.ts, but can be overridden
# SENTRY_DSN=https://your-dsn@o123456.ingest.sentry.io/123456

# Sentry release tracking (optional)
# SENTRY_RELEASE=v1.0.0

# Node environment
NODE_ENV=development

# Event Target Override (Optional)
# ---------------------------------
# If you need to forward events to a different target in dev
# EVENT_TARGET=http://localhost:3000
EOF
```

---

## 3. Runner CLI (`apps/runner/.env.local`)

```bash
cd /Users/codydearkland/sentryvibe/apps/runner
cat > .env.local << 'EOF'
# SentryVibe Runner CLI Environment Configuration
# =================================================
# Note: The CLI typically uses configuration from:
# ~/Library/Application Support/sentryvibe-runner-cli/config.json (macOS)
# These environment variables can override those settings

# Runner Identity
# ---------------
# Unique identifier for this runner instance
RUNNER_ID=local

# Broker Connection
# -----------------
# WebSocket URL for connecting to the broker
# Local: ws://localhost:4000/socket
# Production: wss://broker.your-domain.app/socket
RUNNER_BROKER_URL=ws://localhost:4000/socket

# Shared secret for authenticating with the broker
# This MUST match the RUNNER_SHARED_SECRET in the broker and sentryvibe apps
RUNNER_SHARED_SECRET=dev-secret

# Workspace Configuration
# -----------------------
# Root directory where project workspaces will be created
# Default: ~/sentryvibe-workspace
WORKSPACE_ROOT=~/sentryvibe-workspace

# AI Service API Keys
# -------------------
# Anthropic API Key (Required for Claude Code builds)
# Get your key from: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-your-key-here

# OpenAI API Key (Optional, for Codex builds)
# Get your key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-key-here

# Database Configuration (Optional)
# ----------------------------------
# Only needed if running database operations from runner
# DATABASE_URL=postgresql://user:password@localhost:5432/sentryvibe

# Node Configuration
# ------------------
NODE_ENV=development
EOF
```

---

## Required Configuration Values

### 🔑 API Keys (Required)

1. **ANTHROPIC_API_KEY** - Get from [Anthropic Console](https://console.anthropic.com/)
   - Required for Claude-based builds
   - Format: `sk-ant-...`

2. **OPENAI_API_KEY** - Get from [OpenAI Platform](https://platform.openai.com/api-keys)
   - Optional, only needed for Codex builds
   - Format: `sk-...`

### 🗄️ Database (Required)

**DATABASE_URL** - PostgreSQL connection string
- Local development: `postgresql://user:password@localhost:5432/sentryvibe`
- Production: Use your hosted PostgreSQL URL (Railway, Supabase, etc.)

### 🔐 Shared Secret (Required)

**RUNNER_SHARED_SECRET** - Authentication token
- **CRITICAL**: This must be identical in all three `.env.local` files
- Development: Can use `dev-secret`
- Production: Use a strong random string (e.g., `openssl rand -base64 32`)

### 🌐 URLs (Development defaults shown)

These are pre-configured for local development. Only change if you're connecting to remote services:

- **RUNNER_BROKER_URL**: `ws://localhost:4000/socket`
- **RUNNER_BROKER_HTTP_URL**: `http://localhost:4000`
- **RUNNER_EVENT_TARGET_URL**: `http://localhost:3000`

---

## Environment Configuration Summary

| Variable | sentryvibe | broker | runner | Notes |
|----------|-----------|--------|--------|-------|
| `DATABASE_URL` | ✅ Required | ❌ | ⚠️ Optional | PostgreSQL connection |
| `ANTHROPIC_API_KEY` | ✅ Required | ❌ | ✅ Required | Claude AI API |
| `OPENAI_API_KEY` | ⚠️ Optional | ❌ | ⚠️ Optional | Codex AI API |
| `RUNNER_SHARED_SECRET` | ✅ Required | ✅ Required | ✅ Required | Must match all |
| `RUNNER_BROKER_URL` | ✅ Required | ❌ | ✅ Required | WebSocket URL |
| `RUNNER_BROKER_HTTP_URL` | ✅ Required | ❌ | ❌ | HTTP URL |
| `RUNNER_EVENT_TARGET_URL` | ❌ | ✅ Required | ❌ | Next.js URL |
| `PORT` | ⚠️ Optional | ⚠️ Optional | ❌ | Default: 3000 / 4000 |
| `RUNNER_ID` | ❌ | ❌ | ⚠️ Optional | Default: local |
| `WORKSPACE_ROOT` | ❌ | ❌ | ⚠️ Optional | Project workspace |

---

## Verification

After creating your `.env.local` files, verify the setup:

```bash
# Check that files exist
ls -la apps/sentryvibe/.env.local
ls -la apps/broker/.env.local
ls -la apps/runner/.env.local

# Verify DATABASE_URL is set
grep DATABASE_URL apps/sentryvibe/.env.local

# Verify RUNNER_SHARED_SECRET matches in all files
grep RUNNER_SHARED_SECRET apps/sentryvibe/.env.local
grep RUNNER_SHARED_SECRET apps/broker/.env.local
grep RUNNER_SHARED_SECRET apps/runner/.env.local

# Verify API keys are set
grep ANTHROPIC_API_KEY apps/sentryvibe/.env.local
```

---

## Common Issues

### 🚨 "RUNNER_SHARED_SECRET is not configured"
- Ensure `RUNNER_SHARED_SECRET` is set and identical in all three `.env.local` files

### 🚨 "Failed to connect to broker"
- Check that `RUNNER_BROKER_URL` in sentryvibe/runner matches broker's running port
- Verify broker is running: `cd apps/broker && pnpm dev`

### 🚨 "Database connection failed"
- Verify PostgreSQL is running
- Check `DATABASE_URL` format and credentials
- Test connection: `psql $DATABASE_URL`

### 🚨 "Anthropic API key invalid"
- Verify key starts with `sk-ant-`
- Check key is active in [Anthropic Console](https://console.anthropic.com/)
- Ensure no extra spaces or quotes

---

## Next Steps

After creating your `.env.local` files:

1. **Start the database** (if not already running)
   ```bash
   # Using Docker
   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres
   
   # Or use your existing PostgreSQL instance
   ```

2. **Run database migrations**
   ```bash
   cd apps/sentryvibe
   pnpm drizzle-kit push
   ```

3. **Start all services**
   ```bash
   # From project root
   pnpm dev:all
   
   # Or start individually
   pnpm --filter sentryvibe dev
   pnpm --filter sentryvibe-broker dev
   pnpm --filter @sentryvibe/runner-cli dev
   ```

4. **Verify everything is running**
   - Web app: http://localhost:3000
   - Broker health: http://localhost:4000/health
   - Check logs for any errors

---

## Production Configuration

For production deployments, update these values:

### Web Application
```env
DATABASE_URL=postgresql://user:pass@prod-db.example.com:5432/sentryvibe
RUNNER_SHARED_SECRET=<strong-random-secret>
RUNNER_BROKER_URL=wss://broker.your-domain.app/socket
RUNNER_BROKER_HTTP_URL=https://broker.your-domain.app
NODE_ENV=production
```

### Broker
```env
PORT=4000
RUNNER_SHARED_SECRET=<same-strong-secret>
RUNNER_EVENT_TARGET_URL=https://your-app-domain.app
NODE_ENV=production
```

### Runner (on your local machine)
```env
RUNNER_ID=<unique-id-for-this-machine>
RUNNER_BROKER_URL=wss://broker.your-domain.app/socket
RUNNER_SHARED_SECRET=<same-strong-secret>
```


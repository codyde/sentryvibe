# SentryVibe

AI-powered project generation and management platform with remote runner architecture.

## Quick Reference

**Build & use CLI from source:**
```bash
# From repository root
./build-cli.sh        # Build and link CLI

# Start full stack
sentryvibe run

# Start runner only
sentryvibe --runner
```

**From npm (when published):**
```bash
npm install -g @sentryvibe/runner-cli
sentryvibe init
sentryvibe --runner
```

## Overview

SentryVibe is a full-stack application that uses Claude AI to generate, build, and manage web projects. It consists of three main components:

- **Sentryvibe Web App** - Next.js frontend hosted on Railway
- **Broker Service** - WebSocket broker for runner communication
- **Runner CLI** - Local command-line tool for executing builds

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  User Browser (Railway Frontend)                    │
│  https://sentryvibe.up.railway.app                  │
└──────────────┬──────────────────────────────────────┘
               │
        HTTP API Calls
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  Sentryvibe (Railway - Next.js)                     │
│  - User interface                                   │
│  - Project persistence (Postgres)                   │
│  - Command dispatcher                               │
└──────────────┬──────────────────────────────────────┘
               │
        POST /commands
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  Broker (Railway - Express + WebSocket)             │
│  - Multiplexes commands/events                      │
│  - Maintains runner connections                     │
│  - Routes: HTTP ↔ WebSocket                        │
└──────────────┬──────────────────────────────────────┘
               │
        WebSocket (WSS)
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  Runner CLI (Your Local Machine)                    │
│  - Executes Claude builds                           │
│  - Manages dev servers                              │
│  - Creates Cloudflare tunnels                       │
│  - Workspace: ~/sentryvibe-workspace/              │
└─────────────────────────────────────────────────────┘
```

## Operating Modes

SentryVibe supports two deployment modes:

### 🏠 Local Mode (Default)
- All services run on your machine
- Broker: `ws://localhost:4000/socket`
- Secret: `dev-secret`
- Best for: Development, testing, full control
- Command: `sentryvibe run`

### ☁️ Remote Mode
- Web app + broker on Railway (or other hosting)
- Runner only on your machine
- Broker: `wss://broker.up.railway.app/socket`
- Secret: Production secret from deployment
- Best for: Production use, resource efficiency
- Command: `sentryvibe --runner`

**The CLI defaults to local mode** - just run `sentryvibe init` and accept the defaults!

For remote mode, override the broker URL and secret during init.

## Quick Start (From Zero)

### Prerequisites

- **Node.js 18+** installed
- **npm** or **pnpm** package manager
- **Git** installed

### Option 1: Start Full Stack Locally (Default)

If you want to run the entire SentryVibe application locally:

```bash
# Clone and setup
git clone <repo-url>
cd sentryvibe
pnpm install

# Start everything (web app + broker + runner)
sentryvibe run
```

That's it! Access the web app at http://localhost:3000

### Option 2: Runner Only (Connect to Remote)

If the web app and broker are already deployed (Railway), just run the runner locally:

**Step 1: Install the CLI**

```bash
npm install -g @sentryvibe/runner-cli
```

> **Note:** For local development, see [Local Development](#local-development) below.

**Step 2: Initialize for Remote Mode**

```bash
sentryvibe init \
  --broker wss://broker.up.railway.app/socket \
  --secret YOUR_PRODUCTION_SECRET
```

Or run interactively and change the defaults:

```bash
sentryvibe init
```

You'll be prompted for:
- **Workspace directory** (default: `~/sentryvibe-workspace`)
- **Broker WebSocket URL** (default: `ws://localhost:4000/socket` - change to remote)
- **Shared secret** (default: `dev-secret` - change to production secret)
- **Runner ID** (default: `local`)

**Step 3: Start the Runner**

```bash
sentryvibe --runner
```

Or use the explicit command:

```bash
sentryvibe runner
```

That's it! Your runner is now connected and ready to execute builds.

### Step 4: Create a Project

1. Open the SentryVibe web app in your browser
2. Enter a prompt like "Create a React app with Tailwind"
3. Watch as the runner executes the build locally
4. Preview your project via Cloudflare tunnel

## CLI Commands

### Default Behavior

```bash
# Start full stack (web + broker + runner)
sentryvibe

# Start runner only
sentryvibe --runner
```

### `init` - Initialize Configuration

Set up the runner for the first time:

```bash
sentryvibe init

# Non-interactive mode
sentryvibe init \
  --workspace ~/my-workspace \
  --broker wss://broker.up.railway.app/socket \
  --secret YOUR_SECRET \
  --non-interactive
```

### `run` - Start Full Stack

Start the entire application locally (web app + broker + runner):

```bash
sentryvibe run

# With custom ports
sentryvibe run --port 3001 --broker-port 4001
```

**Options:**
- `-p, --port <port>` - Web app port (default: 3000)
- `-b, --broker-port <port>` - Broker port (default: 4000)

### `runner` - Start Runner Only

Start just the runner (connect to existing broker):

```bash
sentryvibe runner

# Override config with flags
sentryvibe runner \
  --broker wss://localhost:4000/socket \
  --workspace ~/custom-workspace \
  --runner-id my-laptop \
  --verbose
```

**Options:**
- `-b, --broker <url>` - Broker WebSocket URL
- `-w, --workspace <path>` - Workspace directory
- `-i, --runner-id <id>` - Runner identifier
- `-s, --secret <secret>` - Shared secret
- `-v, --verbose` - Enable verbose logging

### `status` - Show Runner Status

Display current configuration and workspace status:

```bash
sentryvibe status
```

Shows:
- Initialization status
- Config file location
- Workspace path and project count
- Broker URL and connection info
- Configuration validation

### `config` - Manage Configuration

```bash
# List all configuration
sentryvibe config list

# Get specific value
sentryvibe config get workspace

# Set configuration
sentryvibe config set workspace ~/new-workspace

# Show config file path
sentryvibe config path

# Validate configuration
sentryvibe config validate

# Reset to defaults
sentryvibe config reset
```

### `cleanup` - Clean Up Resources

```bash
# Delete specific project
sentryvibe cleanup --project my-project

# Delete all projects
sentryvibe cleanup --all

# Show cleanup help
sentryvibe cleanup
```

## Building the CLI from Source

### Method 1: Use the Build Script (Easiest)

```bash
# From the repository root
./build-cli.sh
```

This script will:
1. Install dependencies (if needed)
2. Build the CLI package
3. Link it globally
4. Show you what commands are available

### Method 2: Manual Build

```bash
# From the repository root
pnpm install          # Install dependencies
pnpm run build:cli    # Build the CLI
cd apps/runner        # Navigate to runner
npm link              # Link globally

# Now you can use it anywhere
sentryvibe --help
sentryvibe status
sentryvibe run        # Start full stack
sentryvibe --runner   # Start runner only
```

### Method 3: One-Line Build

```bash
# From root directory
pnpm install && pnpm run build:cli && cd apps/runner && npm link
```

### Unlink When Done

```bash
npm unlink -g @sentryvibe/runner-cli
```

## Local Development

### Setup

Clone and install dependencies:

```bash
git clone <repo-url>
cd sentryvibe
pnpm install
```

### Running Services Locally

**Option 1: Run all services**
```bash
pnpm run dev:all
```

**Option 2: Run services individually**

Terminal 1 - Web App:
```bash
pnpm --filter sentryvibe dev
```

Terminal 2 - Broker:
```bash
pnpm --filter sentryvibe-broker dev
```

Terminal 3 - Runner:
```bash
cd apps/runner
pnpm run dev
```

### Testing the CLI Locally

Build and link the CLI:

```bash
cd apps/runner
pnpm run build
npm link
```

Now you can use `sentryvibe-cli` globally on your machine.

To unlink later:
```bash
npm unlink -g @sentryvibe/runner-cli
```

### Environment Variables (Optional)

When using `sentryvibe run`, the CLI automatically provides all required environment variables from your config. However, you can create `.env.local` files to override settings.

Each app directory has an `.env.example` file showing all available variables:

**Create .env.local files (optional):**
```bash
cp apps/sentryvibe/.env.example apps/sentryvibe/.env.local
cp apps/broker/.env.example apps/broker/.env.local
cp apps/runner/.env.example apps/runner/.env.local
```

**apps/sentryvibe/.env.local:**
```env
DATABASE_URL=postgresql://...
RUNNER_SHARED_SECRET=dev-secret
RUNNER_BROKER_URL=ws://localhost:4000/socket
RUNNER_BROKER_HTTP_URL=http://localhost:4000
WORKSPACE_ROOT=/Users/yourname/sentryvibe-workspace
RUNNER_ID=local
```

**apps/broker/.env.local:**
```env
PORT=4000
RUNNER_SHARED_SECRET=dev-secret
RUNNER_EVENT_TARGET_URL=http://localhost:3000
```

**apps/runner/.env.local:**
```env
RUNNER_ID=local
RUNNER_BROKER_URL=ws://localhost:4000/socket
RUNNER_SHARED_SECRET=dev-secret
WORKSPACE_ROOT=/Users/yourname/sentryvibe-workspace
```

> **Note:** When using `sentryvibe run`, environment variables are automatically set from your config, so `.env.local` files are optional.

## Project Structure

```
sentryvibe/
├── apps/
│   ├── sentryvibe/          # Next.js web application
│   ├── broker/              # WebSocket broker service
│   ├── runner/              # Runner CLI (see apps/runner/README.md)
│   └── projects/            # Generated project templates
├── packages/
│   └── agent-core/          # Shared agent utilities
└── README.md                # This file
```

## How It Works

1. **User submits a prompt** in the web UI
2. **Sentryvibe backend** creates a build command
3. **Broker** forwards the command to connected runners
4. **Runner** executes Claude AI build locally
5. **Runner** manages dev server and creates tunnel
6. **User** previews the project via tunnel URL

## Configuration

The runner stores configuration in a platform-specific location:

- **macOS:** `~/Library/Application Support/sentryvibe/config.json`
- **Linux:** `~/.config/sentryvibe/config.json`

### Default Configuration (Local Mode)

When you run `sentryvibe init` and accept all defaults, you get:

```json
{
  "workspace": "~/sentryvibe-workspace",
  "broker": {
    "url": "ws://localhost:4000/socket",
    "secret": "dev-secret"
  },
  "runner": {
    "id": "local"
  }
}
```

Perfect for running the full stack locally with `sentryvibe run`!

### Remote Mode Configuration

To connect to a remote broker (Railway), override during init:

```bash
sentryvibe init \
  --broker wss://broker.up.railway.app/socket \
  --secret YOUR_PRODUCTION_SECRET
```

Or change existing config:

```bash
sentryvibe config set broker.url wss://broker.up.railway.app/socket
sentryvibe config set broker.secret YOUR_PRODUCTION_SECRET
```

### Configuration Includes
- Workspace directory path
- Monorepo path (auto-detected or cloned)
- Broker WebSocket URL
- Shared secret
- Runner ID
- Tunnel settings

## Troubleshooting

### Runner Won't Connect

1. Check broker URL is correct
2. Verify shared secret matches
3. Ensure firewall allows WebSocket connections
4. Check runner logs for errors

### Builds Failing

1. Verify workspace directory exists and is writable
2. Check Node.js version (18+ required)
3. Ensure git is installed
4. Check Claude API quota/limits

### Tunnel Not Working

1. Verify Cloudflare tunnel is created (check logs)
2. Ensure port is actually listening
3. Check for firewall blocking local ports
4. Try stopping and restarting dev server

### Config Issues

```bash
# Check current status
sentryvibe-cli status

# Validate configuration
sentryvibe-cli config validate

# Reset and reconfigure
sentryvibe-cli config reset
sentryvibe-cli init
```

## Contributing

See [apps/runner/README.md](apps/runner/README.md) for detailed runner development docs.

## License

[License info here]

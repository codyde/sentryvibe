# OpenBuilder CLI

The OpenBuilder CLI is a command-line tool for building AI-powered applications locally on your machine. It connects to the OpenBuilder server and uses Claude AI to generate and build projects in an isolated workspace.

## Table of Contents

- [Installation](#installation)
- [Getting Started from Zero](#getting-started-from-zero)
- [CLI Reference](#cli-reference)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Installation

### Quick Install (Recommended)

```bash
# Install via curl
curl -fsSL https://openbuilder.app/install | bash

# Verify installation
openbuilder --version
```

This installs the OpenBuilder CLI globally on your machine.

### From Source (Development)

```bash
# Clone the repository
git clone <repo-url>
cd openbuilder/apps/runner

# Install dependencies
pnpm install

# Build the CLI
pnpm run build

# Link globally for testing
npm link

# Verify
openbuilder-cli --version
```

## Getting Started from Zero

### Prerequisites

Before you begin, ensure you have:

1. **Node.js 18 or higher** installed
   ```bash
   node --version  # Should be 18.0.0 or higher
   ```

2. **npm or pnpm** package manager
   ```bash
   npm --version
   # or
   pnpm --version
   ```

3. **Git** installed (for template downloads)
   ```bash
   git --version
   ```

4. **A shared secret** from your OpenBuilder deployment
   - Get this from your Railway deployment environment variables
   - Or from your local `.env.local` if running locally

### Two Ways to Use OpenBuilder

**Option A: Full Stack (Local Development)**
- Runs web app, broker, and runner all locally
- Perfect for development and testing
- Command: `openbuilder run`

**Option B: Runner Only (Production Use)**
- Connects to remote broker (e.g., Railway)
- Just executes builds on your machine
- Command: `openbuilder --runner` or `openbuilder runner`

### Step-by-Step Setup (Runner Only Mode)

#### 1. Install the CLI

```bash
curl -fsSL https://openbuilder.app/install | bash
```

#### 2. Initialize Your Runner

Run the interactive setup:

```bash
openbuilder init
```

You'll be asked:

**Workspace Location:**
```
? Where should projects be stored?
  Default: ~/openbuilder-workspace

  This is where all generated projects will be saved.
```

**Broker URL:**
```
? Broker WebSocket URL:
  Default: ws://localhost:4000/socket

  For local development: Use default (localhost)
  For remote (Railway): wss://broker.up.railway.app/socket
```

**Shared Secret:**
```
? Shared secret:
  Default: dev-secret

  For local development: Use default (dev-secret)
  For remote: Get from your Railway deployment environment variables
```

**Runner ID:**
```
? Runner ID (identifier for this machine):
  Default: local

  For local development: Use default (local)
  For multiple runners: Use descriptive names like "macbook-pro"
```

#### 3. Verify Configuration

Check that everything is set up correctly:

```bash
openbuilder-cli status
```

You should see:
```
OpenBuilder Runner Status

ℹ Status: Initialized

Config File:
  ~/Library/Application Support/openbuilder/config.json

Workspace:
  Path: ~/openbuilder-workspace
  Exists: Yes
  Projects: 0

Broker:
  URL: wss://broker.up.railway.app/socket
  Secret: Set

Runner:
  ID: macbook-pro
  Reconnect Attempts: 5
  Heartbeat Interval: 15000ms

Validation:
  ✓ Configuration is valid

Ready to run! Use:
  openbuilder-cli run
  or just openbuilder-cli
```

#### 4. Start the Runner

**Runner only mode (connect to remote broker):**

```bash
openbuilder --runner
```

Or use the explicit command:
```bash
openbuilder runner
```

**Full stack mode (local development):**

```bash
openbuilder run
```

Or simply:
```bash
openbuilder
```

You should see (runner-only mode):
```
Starting OpenBuilder Runner

ℹ Broker: wss://broker.up.railway.app/socket
ℹ Runner ID: macbook-pro
ℹ Workspace: ~/openbuilder-workspace

[runner] workspace root: /Users/yourname/openbuilder-workspace
[runner] connected to broker wss://broker.up.railway.app/socket...
```

Or (full stack mode):
```
Starting OpenBuilder Full Stack

ℹ Monorepo root: /Users/yourname/openbuilder
ℹ Web app port: 3000
ℹ Broker port: 4000

ℹ Starting services...

ℹ 1/3 Starting web app...
ℹ 2/3 Starting broker...
ℹ 3/3 Starting runner...

✔ All services started!

Services running:
  Web App: http://localhost:3000
  Broker: http://localhost:4000
  Runner: Connected to broker

Press Ctrl+C to stop all services
```

#### 5. Create Your First Project

1. Open the OpenBuilder web app in your browser
2. Click "New Project"
3. Enter a prompt like:
   ```
   Create a React app with TypeScript and Tailwind CSS
   ```
4. Watch the runner execute the build in your terminal
5. Once complete, click "Start Dev Server" in the UI
6. Preview your project via the tunnel URL

### What Happens Behind the Scenes

1. **Template Download**: Runner clones the appropriate starter template
2. **AI Build**: Claude AI modifies the template based on your prompt
3. **Workspace Storage**: Project is saved to `~/openbuilder-workspace/project-name/`
4. **Dev Server**: Runner starts the dev server (e.g., `npm run dev`)
5. **Tunnel Creation**: Cloudflare tunnel exposes your local dev server
6. **Preview**: Web UI displays your project in an iframe

## CLI Reference

### Default Commands

**Start full stack:**
```bash
openbuilder
# or
openbuilder run
```

**Start runner only:**
```bash
openbuilder --runner
# or
openbuilder runner
```

### `openbuilder init`

Initialize workspace and configuration.

```bash
openbuilder init [options]
```

**Options:**
- `--workspace <path>` - Set workspace directory without prompts
- `--broker <url>` - Set broker URL without prompts
- `--secret <secret>` - Set shared secret without prompts
- `--non-interactive` - Use all defaults (requires --secret)

**Examples:**

```bash
# Interactive mode (recommended)
openbuilder init

# Non-interactive with all options
openbuilder init \
  --workspace ~/my-projects \
  --broker wss://broker.up.railway.app/socket \
  --secret my-secret-key \
  --non-interactive

# Reset existing config
openbuilder config reset
openbuilder init
```

---

### `openbuilder run`

Start the full stack (web app + broker + runner) locally.

```bash
openbuilder run [options]
openbuilder [options]  # 'run' is the default command
```

**Options:**
- `-p, --port <port>` - Web app port (default: 3000)
- `-b, --broker-port <port>` - Broker port (default: 4000)

**Examples:**

```bash
# Start full stack with defaults
openbuilder run

# Just use default (same as run)
openbuilder

# Custom ports
openbuilder run --port 3001 --broker-port 4001
```

**What starts:**
1. **Web App** - Next.js app on port 3000
2. **Broker** - WebSocket server on port 4000
3. **Runner** - Connects to local broker

---

### `openbuilder runner`

Start runner only (connect to existing broker).

```bash
openbuilder runner [options]
openbuilder --runner  # Alternative: use --runner flag
```

**Options:**
- `-b, --broker <url>` - Override broker WebSocket URL
- `-w, --workspace <path>` - Override workspace directory
- `-i, --runner-id <id>` - Override runner identifier
- `-s, --secret <secret>` - Override shared secret
- `-v, --verbose` - Enable verbose logging

**Examples:**

```bash
# Use saved configuration
openbuilder runner

# Alternative syntax
openbuilder --runner

# Connect to local broker
openbuilder runner --broker ws://localhost:4000/socket

# Use custom workspace
openbuilder runner --workspace ~/custom-projects

# Override all settings
openbuilder runner \
  --broker wss://broker.up.railway.app/socket \
  --workspace ~/dev-projects \
  --runner-id my-laptop \
  --secret production-secret \
  --verbose
```

**Stopping the Runner:**

Press `Ctrl+C` to gracefully shutdown. The runner will:
1. Close all active tunnels
2. Stop dev servers
3. Flush telemetry data
4. Close broker connection

---

### `openbuilder status`

Show runner status and configuration.

```bash
openbuilder status
```

**Output includes:**
- Initialization status
- Config file location
- Workspace path and project count
- Broker connection details
- Runner settings
- Configuration validation

---

### `openbuilder config`

Manage runner configuration.

```bash
openbuilder config <action> [key] [value]
```

**Actions:**

**`list`** - Show all configuration:
```bash
openbuilder config list
```

**`get <key>`** - Get specific value:
```bash
openbuilder config get workspace
openbuilder config get broker.url
```

**`set <key> <value>`** - Update configuration:
```bash
openbuilder config set workspace ~/new-workspace
openbuilder config set runner.id my-laptop
```

**`path`** - Show config file location:
```bash
openbuilder config path
```

**`validate`** - Validate configuration:
```bash
openbuilder config validate
```

**`reset`** - Reset to defaults (requires confirmation):
```bash
openbuilder config reset
```

---

### `openbuilder cleanup`

Clean up projects and resources.

```bash
openbuilder cleanup [options]
```

**Options:**
- `--project <slug>` - Delete specific project
- `--all` - Delete all projects (requires confirmation)
- `--tunnels` - Close all tunnels (runner must be running)
- `--processes` - Kill all dev servers (runner must be running)

**Examples:**

```bash
# Delete specific project
openbuilder cleanup --project my-react-app

# Delete all projects (with confirmation)
openbuilder cleanup --all

# Show cleanup help
openbuilder cleanup
```

---

### `openbuilder --help`

Show help for any command.

```bash
openbuilder --help
openbuilder init --help
openbuilder run --help
openbuilder runner --help
```

---

### `openbuilder --version`

Show CLI version.

```bash
openbuilder --version
```

## Configuration

### Config File Location

Configuration is stored in a platform-specific location:

**macOS:**
```
~/Library/Application Support/openbuilder/config.json
```

**Linux:**
```
~/.config/openbuilder/config.json
```

### Config File Structure

```json
{
  "version": "0.1.0",
  "workspace": "/Users/yourname/openbuilder-workspace",
  "broker": {
    "url": "wss://broker.up.railway.app/socket",
    "secret": "your-shared-secret"
  },
  "runner": {
    "id": "macbook-pro",
    "reconnectAttempts": 5,
    "heartbeatInterval": 15000
  },
  "tunnel": {
    "provider": "cloudflare",
    "autoCreate": true
  }
}
```

### Configuration Priority

Settings are resolved in this order (highest to lowest):

1. **Command-line flags** (`--broker`, `--workspace`, etc.)
2. **Config file** (`config.json`)
3. **Environment variables** (when running from source)
4. **Defaults**

### Workspace Directory

The workspace directory stores all generated projects:

```
~/openbuilder-workspace/
├── react-todo-app/
│   ├── package.json
│   ├── src/
│   └── ...
├── nextjs-blog/
│   ├── package.json
│   ├── app/
│   └── ...
└── vite-portfolio/
    ├── package.json
    ├── src/
    └── ...
```

Each project is completely isolated with its own:
- Dependencies (`node_modules/`)
- Configuration files
- Git history (initialized)
- Dev server process

## Architecture

### Component Overview

```
┌─────────────────────────────────────┐
│         CLI Entry Point             │
│      (src/cli/index.ts)             │
└────────────┬────────────────────────┘
             │
      ┌──────┴───────┐
      │   Commands   │
      └──────┬───────┘
             │
   ┌─────────┼─────────┐
   │         │         │
   ▼         ▼         ▼
┌──────┐ ┌──────┐ ┌──────┐
│ init │ │ run  │ │ ...  │
└───┬──┘ └───┬──┘ └──────┘
    │        │
    ▼        ▼
┌────────────────────┐
│   Utilities        │
│ - Config Manager   │
│ - Logger           │
│ - Prompts          │
│ - Spinner          │
└────────────────────┘
         │
         ▼
┌────────────────────┐
│  Runner Core       │
│  (src/index.ts)    │
│  - WebSocket       │
│  - Build Engine    │
│  - Process Manager │
│  - Tunnel Manager  │
└────────────────────┘
```

### Key Components

**CLI Layer** (`src/cli/`):
- Commander.js-based command parser
- Interactive prompts with Inquirer
- Colored output with Chalk
- Progress indicators with Ora
- Configuration management with Conf

**Runner Core** (`src/`):
- WebSocket client for broker communication
- Claude AI integration for builds
- Dev server process management
- Cloudflare tunnel creation
- Project scoped file permissions

**Libraries** (`src/lib/`):
- `build/` - Build orchestration and streaming
- `templates/` - Template download and selection
- `tunnel/` - Tunnel management and auto-install
- `permissions/` - Project-scoped permission handlers
- `process-manager.ts` - Dev server lifecycle

### Message Flow

```
Web UI → OpenBuilder API → Broker → Runner CLI

1. User submits prompt
2. API creates build command
3. Broker forwards via WebSocket
4. Runner executes build
5. Runner streams progress back
6. UI shows real-time updates
```

### Security Model

The runner implements strict security controls:

1. **Project Isolation**: Each project confined to its directory
2. **Path Validation**: All file operations validated
3. **Permission Scoping**: Claude restricted to project directory only
4. **Secret Management**: Shared secret for authentication
5. **WebSocket TLS**: Encrypted communication (wss://)

## Development

### Setup Development Environment

```bash
# Clone repository
git clone <repo-url>
cd openbuilder/apps/runner

# Install dependencies
pnpm install

# Create environment file
cp .env.example .env.local
```

### Development Workflow

**Running in Development Mode:**

```bash
# Start runner directly (no CLI)
pnpm run dev

# Test CLI in development
pnpm run dev:cli init
pnpm run dev:cli status

# Test full stack mode
pnpm run dev:cli run

# Test runner-only mode
pnpm run dev:cli runner
```

**Building:**

```bash
# Build TypeScript to JavaScript
pnpm run build

# Output goes to dist/
```

**Testing CLI Locally:**

```bash
# Build and link globally
pnpm run build
npm link

# Now use anywhere
openbuilder status
openbuilder --help
openbuilder --runner  # Test runner mode
openbuilder run       # Test full stack mode

# Unlink when done
npm unlink -g @openbuilder/cli
```

### Project Structure

```
apps/runner/
├── src/
│   ├── cli/                    # CLI implementation
│   │   ├── index.ts           # CLI entry point
│   │   ├── commands/          # Command implementations
│   │   │   ├── init.ts
│   │   │   ├── run.ts
│   │   │   ├── config.ts
│   │   │   ├── status.ts
│   │   │   └── cleanup.ts
│   │   └── utils/             # CLI utilities
│   │       ├── logger.ts
│   │       ├── spinner.ts
│   │       ├── prompts.ts
│   │       └── config-manager.ts
│   ├── lib/                   # Runner core libraries
│   │   ├── build/
│   │   ├── templates/
│   │   ├── tunnel/
│   │   └── permissions/
│   ├── shared/                # Shared types
│   │   └── runner/
│   │       └── messages.ts
│   └── index.ts               # Runner core
├── templates/                 # Config templates
│   └── config.template.json
├── dist/                      # Build output
├── package.json
├── tsconfig.json
└── README.md                  # This file
```

### Environment Variables (Development)

Create `.env.local`:

```env
# Runner Configuration
RUNNER_ID=default
RUNNER_WS_URL=ws://localhost:3000/ws/runner
RUNNER_SHARED_SECRET=your-secret-here
WORKSPACE_ROOT=/Users/yourname/openbuilder-workspace
API_BASE_URL=http://localhost:3000

# Sentry Configuration
SENTRY_DSN=your-sentry-dsn
SENTRY_AUTH_TOKEN=your-sentry-token
```

### Adding New Commands

1. Create command file in `src/cli/commands/`:

```typescript
// src/cli/commands/mycommand.ts
import { logger } from '../utils/logger.js';

export async function myCommand(options: any) {
  logger.info('Executing my command...');
  // Implementation here
}
```

2. Register in `src/cli/index.ts`:

```typescript
program
  .command('mycommand')
  .description('My new command')
  .action(async (options) => {
    const { myCommand } = await import('./commands/mycommand.js');
    await myCommand(options);
  });
```

3. Build and test:

```bash
pnpm run build
node dist/cli/index.js mycommand
```

### Testing

```bash
# Run type checking
pnpm run build

# Test specific command
node dist/cli/index.js status
node dist/cli/index.js config list

# Test with debugger
node --inspect dist/cli/index.js run
```

### Publishing

```bash
# Update version
npm version patch  # or minor, major

# Build
pnpm run build

# Publish to npm
npm publish --access public

# Create git tag
git tag v0.1.1
git push origin v0.1.1
```

## Troubleshooting

### Common Issues

#### "Runner not initialized"

**Problem:** Running `openbuilder runner` before `init`.

**Solution:**
```bash
openbuilder init
```

#### "Cannot connect to broker"

**Problem:** Broker URL is incorrect or broker is down.

**Solutions:**
1. Check broker URL:
   ```bash
   openbuilder config get broker.url
   ```
2. Test broker connectivity:
   ```bash
   curl https://broker.up.railway.app/status
   ```
3. Try local broker:
   ```bash
   openbuilder runner --broker ws://localhost:4000/socket
   ```

#### "Shared secret is required"

**Problem:** Secret not set in config.

**Solution:**
```bash
openbuilder config set broker.secret your-secret-here
# or
openbuilder init  # Re-run setup
```

#### "Workspace directory does not exist"

**Problem:** Workspace path is invalid or was deleted.

**Solution:**
```bash
mkdir -p ~/openbuilder-workspace
# or
openbuilder config set workspace ~/new-workspace
```

#### Build fails with template errors

**Problem:** Template download failed or git not installed.

**Solutions:**
1. Verify git is installed:
   ```bash
   git --version
   ```
2. Check network connectivity
3. Clear and retry:
   ```bash
   openbuilder cleanup --project failed-project
   # Try build again in UI
   ```

#### Tunnel creation fails

**Problem:** Cloudflared binary not installed or port not ready.

**Solutions:**
1. Runner auto-installs cloudflared, check logs
2. Verify port is listening:
   ```bash
   lsof -i :3000
   ```
3. Try manual tunnel:
   ```bash
   cloudflared tunnel --url localhost:3000
   ```

#### Config corruption

**Problem:** Config file is invalid JSON.

**Solution:**
```bash
# Show config location
openbuilder-cli config path

# Reset and reconfigure
openbuilder-cli config reset
openbuilder-cli init
```

### Debug Mode

Enable verbose logging:

```bash
openbuilder-cli run --verbose
```

Or set environment variable:

```bash
DEBUG=* openbuilder-cli run
```

### Getting Help

1. Check status:
   ```bash
   openbuilder-cli status
   ```

2. Validate config:
   ```bash
   openbuilder-cli config validate
   ```

3. View logs:
   - Runner logs appear in terminal
   - Check Sentry dashboard for errors

4. Reset everything:
   ```bash
   openbuilder-cli config reset
   openbuilder-cli cleanup --all
   openbuilder-cli init
   ```

## FAQ

**Q: Can I run multiple runners?**
A: Yes! Each runner needs a unique `runner-id`. Set it during init or with:
```bash
openbuilder runner --runner-id my-second-runner
```

**Q: Where are my projects stored?**
A: In your workspace directory. Check with:
```bash
openbuilder config get workspace
```

**Q: Can I change the workspace location?**
A: Yes:
```bash
openbuilder config set workspace ~/new-location
```

**Q: How do I update the CLI?**
A: Reinstall from npm:
```bash
npm update -g @openbuilder/cli
```

**Q: Does the runner need to stay running?**
A: Yes, while you're using the web UI. It executes builds and manages dev servers.

**Q: Can I run the runner in the background?**
A: Use a process manager like PM2:
```bash
pm2 start openbuilder --name runner -- runner
pm2 logs runner
```

**Q: How do I start just the runner vs full stack?**
A:
```bash
# Full stack (web + broker + runner)
openbuilder run

# Runner only (connect to remote broker)
openbuilder --runner
# or
openbuilder runner
```

**Q: How do I uninstall?**
A:
```bash
# Clean up projects
openbuilder cleanup --all

# Uninstall CLI
npm uninstall -g @openbuilder/cli

# Remove config (optional)
rm -rf ~/Library/Application\ Support/openbuilder
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[License info here]

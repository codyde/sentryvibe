# SentryVibe


AI-powered project generation platform that uses Claude AI and OpenAI Codex to build web projects with real-time streaming, live previews, and tunnel support.

![SentryVibe Running](media/sentryviberunning.png)

## Quick Start

**Install CLI:**
```bash
curl -fsSL https://raw.githubusercontent.com/codyde/sentryvibe/main/install-cli.sh | bash
sentryvibe init -y    # Setup + auto-build all services (~40s first time)
sentryvibe run        # Starts instantly in production mode (~3s)
```

![SentryVibe CLI Install](media/SentryVibeCLI-Install.gif)

Open http://localhost:3000 and start building!

> **Performance**: Init builds all services once with Turborepo caching. Subsequent builds complete in ~1 second!
> **TUI Dashboard**: Beautiful Terminal UI for real-time service monitoring, log viewing, and tunnel management.
> **Tip**: Use `sentryvibe init` (without `-y`) for interactive setup with custom configuration.

## What is SentryVibe?

SentryVibe lets you describe what you want to build ("Create a React todo app with TypeScript and Tailwind") and AI generates a complete, runnable project on your local machine. Watch Claude AI work in real-time, preview your app instantly either locally or remotely via Cloudflare Tunnels, and iterate with follow-up prompts.

SentryVibe also features a runner model that lets you run a remote runner anywhere and connect it back to your frontend - letting you provision headless on remote systems if you wish.

**Key Features:**
- **Production-first performance** - 5x faster startup and page loads with Turborepo
- **TUI Dashboard** - Real-time monitoring with keyboard controls
- AI project generation with Claude AI and OpenAI Codex
- Real-time build streaming with full transparency
- Automatic dev server management and port detection
- Cloudflare tunnel creation for instant previews (with TUI toggle)
- Code editor with Monaco for file viewing/editing
- Multi-agent support (Claude Code, OpenAI Codex)
- MCP (Model Context Protocol) integration
- Project management dashboard
- Enhanced error handling and graceful shutdown

## Performance

SentryVibe uses **Turborepo** for intelligent build caching and production-first defaults:

| Metric | Development Mode | Production Mode | Improvement |
|--------|-----------------|-----------------|-------------|
| **Build caching** | N/A | 40s → 1s | **97% faster** |
| **Startup time** | 15s | 3s | **5x faster** |
| **Page loads** | 800ms | 150ms | **5x faster** |

**How it works:**
- `sentryvibe init` builds everything once (~40s one-time cost)
- `sentryvibe run` starts instantly using cached builds (~3s)
- `sentryvibe build` rebuilds in background (~1s with cache)
- Subsequent runs benefit from Turborepo's smart caching

## Architecture

SentryVibe uses a distributed architecture with three components:

```
┌─────────────────────┐
│   Web Application   │  Next.js app with AI chat interface
│   (localhost:3000)  │  Project management & code preview
└──────────┬──────────┘
           │ HTTP/WebSocket
┌──────────▼──────────┐
│   Broker Service    │  WebSocket multiplexer
│   (localhost:4000)  │  Routes commands to runners
└──────────┬──────────┘
           │ WebSocket
┌──────────▼──────────┐
│    Runner CLI       │  Executes AI builds locally
│  (Your Machine)     │  Manages dev servers & tunnels
└─────────────────────┘
```

## Two Operating Modes

### Local Mode (Default)
Run the entire stack on your machine - perfect for development:
```bash
sentryvibe init -y           # Setup + build once (~40s)
sentryvibe run               # Start in production mode (~3s)
sentryvibe run --dev         # Or use development mode (hot reload)
```

**What runs:**
- Web app at http://localhost:3000 (production-optimized by default)
- Broker at ws://localhost:4000
- Runner in your workspace directory

### Remote Mode
Connect to hosted web app and broker (e.g., Railway):
```bash
sentryvibe init --broker wss://broker.up.railway.app/socket --secret YOUR_SECRET
sentryvibe --runner
```

**What runs:**
- Runner only (connects to remote broker)
- Projects build locally in your workspace
- All compute happens on your machine

## Installation

### Option 1: Automated Install Script (Recommended)

```bash
# Download and run install script
curl -fsSL https://raw.githubusercontent.com/codyde/sentryvibe/main/install-cli.sh | bash

# Initialize with defaults (recommended for first-time setup)
sentryvibe init -y

# Or interactive setup
sentryvibe init

# Start full stack locally
sentryvibe run
```

The install script automatically:
- Detects the latest release version
- Installs from GitHub releases (not npm registry)
- Supports both pnpm and npm
- Validates Node.js version (20+ required)

**Alternative: Direct install from latest release**
```bash
npm install -g https://github.com/codyde/sentryvibe/releases/latest/download/sentryvibe-cli.tgz
```

### Option 2: Build from Source

```bash
git clone https://github.com/codyde/sentryvibe.git
cd sentryvibe
pnpm install

# Use the build script
./build-cli.sh

# Or build manually
pnpm run build:cli
cd apps/runner
npm link

# Start full stack
sentryvibe run
```

## CLI Commands

### `sentryvibe` or `sentryvibe run`
Start the full stack locally with TUI Dashboard (web app + broker + runner):
```bash
# Production mode (default - fast startup and performance)
sentryvibe run

# Development mode (hot reload, slower performance)
sentryvibe run --dev

# Rebuild services before starting
sentryvibe run --rebuild

# With custom ports
sentryvibe run --port 3001 --broker-port 4001

# Disable TUI (use traditional logs)
sentryvibe run --no-tui

# Enable debug mode
sentryvibe run --debug
```

**Mode Comparison:**
- **Production mode** (default): Uses pre-built files, 3s startup, 150ms page loads
- **Development mode** (`--dev`): Hot reload enabled, 15s startup, 800ms page loads

**TUI Dashboard Features:**
- Real-time service status monitoring (web app, broker, runner)
- Live log streaming with service filtering
- Keyboard shortcuts for navigation and control
- Tunnel management (create/close Cloudflare tunnels)
- Plain text log export for easy copy/paste

**Keyboard Shortcuts:**
- `q` or `Ctrl+C` - Quit and stop all services
- `r` - Restart all services
- `t` - Toggle Cloudflare tunnel (create/close)
- `c` - Clear logs
- `l` - Toggle plain text log view (for copy/paste)
- `?` - Show help
- `Esc` - Return to dashboard
- `↑/↓` - Scroll logs line by line
- `g/G` - Jump to top/bottom of logs

> The TUI automatically disables in CI environments or when stdout is not a TTY.

### `sentryvibe --runner` or `sentryvibe runner`
Start runner only (connects to existing broker):
```bash
sentryvibe --runner

# With options
sentryvibe runner --broker wss://localhost:4000/socket --verbose
```

**Options:**
- `-b, --broker <url>` - Broker WebSocket URL
- `-w, --workspace <path>` - Workspace directory
- `-i, --runner-id <id>` - Runner identifier
- `-s, --secret <secret>` - Shared secret
- `-v, --verbose` - Enable verbose logging

### `sentryvibe init`
Initialize configuration and build all services:
```bash
sentryvibe init

# Non-interactive with defaults (-y flag)
sentryvibe init -y

# Enable debug mode for troubleshooting
sentryvibe init --debug
```

**What init does:**
1. **Setup configuration** (workspace, broker URL, secret)
2. **Clone repository** (if not already present)
3. **Install dependencies** (pnpm install)
4. **Build all services** (~40s first time, uses Turborepo caching)
5. **Setup database** (prompts for Neon PostgreSQL)

**Interactive mode:** Asks "Pre-build all services for production performance?" (defaults to Yes)
**Non-interactive (`-y`):** Automatically builds everything for optimal performance

**Default configuration when using `-y`:**
- **Workspace**: `~/sentryvibe-workspace`
- **Broker URL**: `ws://localhost:4000/socket` (local mode)
- **API URL**: `http://localhost:3000`
- **Secret**: Auto-generated secure random 64-character hex string
- **Runner ID**: `local`
- **Database**: Auto-setup with Neon PostgreSQL

**Custom settings:**
```bash
# Override specific defaults
sentryvibe init -y --secret my-custom-secret

# Full custom configuration
sentryvibe init \
  --workspace ~/my-workspace \
  --broker wss://broker.example.com/socket \
  --secret my-secret \
  --runner-id my-laptop \
  --non-interactive
```

### `sentryvibe build`
Rebuild all services without stopping the running app:
```bash
# Rebuild once (uses Turborepo caching ~1s)
sentryvibe build

# Watch mode - rebuild on file changes
sentryvibe build --watch
```

**Use case:** Make code changes while app is running, rebuild in background, then restart:
```bash
# Terminal 1: App is running
sentryvibe run

# Terminal 2: Make changes, then rebuild
sentryvibe build
# ✓ Build complete (1.1s)

# Terminal 1: Restart to use new build
Ctrl+C
sentryvibe run
```

### `sentryvibe status`
Show current configuration and workspace status:
```bash
sentryvibe status
```

Shows:
- Configuration file location
- Workspace path and project count
- Broker URL
- Runner ID
- Initialization status

### `sentryvibe config`
Manage configuration settings:
```bash
# List all settings
sentryvibe config list

# Get specific value
sentryvibe config get workspace

# Update setting
sentryvibe config set workspace ~/new-workspace
sentryvibe config set broker.url wss://broker.example.com/socket
sentryvibe config set broker.secret new-secret

# Show config file path
sentryvibe config path

# Validate configuration
sentryvibe config validate

# Reset to defaults
sentryvibe config reset
```

### `sentryvibe cleanup`
Delete projects from workspace:
```bash
# Delete specific project
sentryvibe cleanup --project my-project

# Delete all projects
sentryvibe cleanup --all

# Close all active tunnels
sentryvibe cleanup --tunnels

# Kill all dev server processes
sentryvibe cleanup --processes
```

### `sentryvibe database` or `sentryvibe db`
Set up a new PostgreSQL database and initialize schema:
```bash
sentryvibe database

# Alias
sentryvibe db
```

Guides you through setting up a Neon PostgreSQL database for the web app.

## Project Structure

```
sentryvibe/
├── apps/
│   ├── sentryvibe/              # Next.js web application
│   │   ├── src/app/             # App router pages & API routes
│   │   │   ├── api/chat/        # Claude Code provider (MCP)
│   │   │   ├── api/generate/    # Anthropic API with tools
│   │   │   └── api/projects/    # Project management API
│   │   └── components/          # React components
│   ├── broker/                  # WebSocket broker service
│   │   └── src/index.ts         # Express + WebSocket server
│   ├── runner/                  # Runner CLI
│   │   ├── cli/
│   │   │   ├── commands/        # CLI commands (init, run, config, etc.)
│   │   │   ├── ui/              # TUI Dashboard components (Ink)
│   │   │   │   ├── components/  # Banner, ServicePanel, LogViewer, StatusBar
│   │   │   │   ├── Dashboard.tsx # Main TUI component
│   │   │   │   ├── service-manager.ts # Service lifecycle & events
│   │   │   │   └── console-interceptor.ts # Console output capture
│   │   │   └── utils/           # Config, prompts, error handling
│   │   ├── lib/                 # Build engine, templates, tunnels
│   │   └── src/index.ts         # Runner WebSocket client
│   └── projects/                # Project templates
└── packages/
    └── agent-core/              # Shared agent utilities & types
```

## How It Works

1. **User submits a prompt** in the web UI at http://localhost:3000
2. **Web app creates a build command** and sends it to the broker
3. **Broker forwards command** to connected runner via WebSocket
4. **Runner executes AI build** using Claude AI or OpenAI Codex
5. **Real-time streaming** shows Claude's thinking, tool calls, and todos
6. **Dev server starts** automatically on an available port
7. **Tunnel created** via Cloudflare for instant preview access
8. **User sees preview** in embedded iframe with live URL
9. **Iterate with follow-ups** - modify the project with new prompts

## Key Technologies

| Component | Stack |
|-----------|-------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| **UI Components** | Radix UI, Framer Motion, Monaco Editor |
| **AI/ML** | Claude AI (Anthropic SDK), OpenAI Codex, MCP |
| **Database** | PostgreSQL with Drizzle ORM |
| **Real-time** | WebSocket (ws library) |
| **CLI** | Commander.js, Ink (TUI), Clack Prompts, Inquirer |
| **TUI** | Ink, React 19, Picocolors |
| **Tunneling** | Cloudflare tunnel (with silent operation) |
| **Observability** | Sentry (experimental PR #17844) |
| **Build System** | Turborepo, pnpm monorepo, TypeScript |

## Development Setup

### Prerequisites
- Node.js 18+
- pnpm 9.15.0+
- PostgreSQL (for web app)
- Git

### Local Development

```bash
# Clone and install
git clone https://github.com/codyde/sentryvibe.git
cd sentryvibe
pnpm install

# Build all services (uses Turborepo)
pnpm build:all

# Setup database
cd apps/sentryvibe
pnpm run db:push
cd ../..

# Start all services in production mode (fast!)
pnpm run dev:all
```

This starts:
- Web app at http://localhost:3000 (production build)
- Broker at http://localhost:4000 (production build)
- Runner connected to local broker

**Development workflows:**

```bash
# Production mode (fast, recommended for most development)
pnpm build:all        # Build once (~40s first time, ~1s cached)
pnpm run dev:all      # Start all services

# Development mode (hot reload, slower)
pnpm --filter sentryvibe dev           # Web app with hot reload
pnpm --filter sentryvibe-broker dev     # Broker in dev mode
pnpm --filter @sentryvibe/runner-cli dev # Runner in dev mode

# Rebuild after changes (uses Turborepo cache)
pnpm build:all        # Fast rebuild (~1s if minimal changes)

# Build specific services
pnpm build:cli              # Just the CLI
pnpm build:agent-core       # Just shared package
```

### Turborepo Commands

```bash
# Build everything with caching
turbo build

# Build specific service
turbo build --filter=sentryvibe

# Clear cache
turbo prune

# Check what would be cached
turbo run build --dry
```

### Environment Variables

When using `sentryvibe run`, environment variables are automatically configured from your settings. For manual service startup, create `.env.local` files:

**apps/sentryvibe/.env.local:**
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/sentryvibe
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
RUNNER_SHARED_SECRET=dev-secret
RUNNER_BROKER_URL=ws://localhost:4000/socket
RUNNER_BROKER_HTTP_URL=http://localhost:4000
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
WORKSPACE_ROOT=~/sentryvibe-workspace
ANTHROPIC_API_KEY=sk-ant-...
```

See `.env.example` files in each app directory for all available options.

## Features in Detail

### TUI Dashboard
The CLI features a modern Terminal User Interface built with Ink for real-time monitoring:

- **Service Status** - Live status of web app, broker, and runner services
- **Log Viewer** - Real-time log streaming with service filtering
- **Tunnel Management** - Create/close Cloudflare tunnels with a keypress
- **Keyboard Controls** - Intuitive shortcuts for all operations
- **Plain Text Export** - Toggle plain text mode for easy log copy/paste
- **Auto-scroll** - Automatically follows new logs, pause by scrolling
- **Console Interception** - All console output is captured and routed through TUI
- **Graceful Shutdown** - Clean exit with proper service cleanup

The TUI automatically falls back to traditional log output in CI environments or non-TTY terminals.

### AI Project Generation
- **Claude Code** - Default agent with MCP support and Sentry docs access
- **OpenAI Codex** - Alternative agent for different generation styles
- **Template system** - Start from popular frameworks (React, Next.js, Vue, etc.)
- **Streaming output** - Watch AI thinking, tool calls, and file edits in real-time

### Build Progress Tracking
- Real-time streaming of AI thinking and reasoning
- Tool call visualization (bash commands, file operations)
- Todo list tracking from TodoWrite events
- Terminal output with ANSI color support
- File change detection and preview

### Project Management
- Create projects from AI prompts
- List and browse all projects
- Delete projects and clean workspace
- Rename projects
- Export project files

### Code Editor
- Monaco editor integration
- Syntax highlighting for all languages
- File browser with tree view
- Read-only and edit modes
- Direct file viewing from project directory

### Dev Server & Tunnels
- Automatic port detection and allocation
- Process lifecycle management (start/stop/restart)
- Health checking on dev server ports
- Cloudflare tunnel creation with TUI toggle (`t` key)
- Tunnel URLs displayed in TUI status bar
- Silent tunnel operation (no console spam)
- Automatic tunnel cleanup on shutdown
- Environment variable injection

### Security & Isolation
- Project-scoped file operations
- Path validation prevents directory escaping
- Workspace isolation
- Bearer token authentication for broker
- TLS support for production (WSS)

### MCP Integration
The web app includes MCP support with:
- **Sentry Docs MCP Server** - Access to Sentry documentation
- **Custom system prompts** - Tailored for JS/TS project generation
- **Tool support** - Bash, text editor, web search
- **Bypass permissions** - Development mode for faster iteration

## Configuration

Runner configuration is stored in a platform-specific location:

- **macOS**: `~/Library/Application Support/sentryvibe-runner-cli/config.json`
- **Linux**: `~/.config/sentryvibe-runner-cli/config.json`
- **Windows**: `%APPDATA%\sentryvibe-runner-cli\config.json`

**Default configuration (local mode):**
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

**Remote configuration:**
```json
{
  "workspace": "~/sentryvibe-workspace",
  "broker": {
    "url": "wss://broker.up.railway.app/socket",
    "secret": "your-production-secret"
  },
  "runner": {
    "id": "my-laptop"
  }
}
```

## Deployment

### Deploy to Railway

The web app and broker can be deployed to Railway (or any Node.js host):

**Web App:**
- Build command: `pnpm install && pnpm run build`
- Start command: `pnpm start`
- Environment variables: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `RUNNER_SHARED_SECRET`, `RUNNER_BROKER_URL`, `RUNNER_BROKER_HTTP_URL`

**Broker:**
- Build command: `cd apps/broker && pnpm install && pnpm run build`
- Start command: `cd apps/broker && pnpm start`
- Environment variables: `PORT`, `RUNNER_SHARED_SECRET`, `RUNNER_EVENT_TARGET_URL`

**Runner (Local):**
- Stays on your machine
- Connect via: `sentryvibe init --broker wss://YOUR_BROKER_URL/socket --secret YOUR_SECRET`
- Run: `sentryvibe --runner`

### Multiple Runners

You can run multiple runners connecting to the same broker:

```bash
# Machine 1
sentryvibe init --runner-id laptop
sentryvibe --runner

# Machine 2
sentryvibe init --runner-id desktop
sentryvibe --runner
```

Each runner receives build commands and executes them in isolation.

## Troubleshooting

### Runner won't connect
- Verify broker URL is correct (`sentryvibe config get broker.url`)
- Check shared secret matches broker
- Ensure firewall allows WebSocket connections
- Check broker is running (`curl http://localhost:4000/status`)
- Use `--debug` flag for detailed error output

### Builds failing
- Verify workspace directory exists and is writable
- Check Node.js version (18+ required): `node --version`
- Ensure git is installed: `git --version`
- Check AI API keys are valid
- Review runner logs with `--verbose` flag
- Enable debug mode: `sentryvibe run --debug`

### TUI not displaying correctly
- Ensure terminal supports ANSI colors and Unicode
- Try traditional mode: `sentryvibe run --no-tui`
- Resize terminal to at least 80x25 characters
- Check that terminal is a TTY (not piped or redirected)

### Tunnel not working
- Verify Cloudflare tunnel is installed
- Check dev server is actually running on the port
- Ensure port is not blocked by firewall
- Try stopping and restarting: `sentryvibe cleanup --project NAME` then rebuild

### Configuration issues
```bash
# Check current configuration
sentryvibe status

# Validate configuration
sentryvibe config validate

# Reset and reconfigure
sentryvibe config reset
sentryvibe init
```

### Clean install
```bash
# Remove runner link
npm unlink -g @sentryvibe/runner-cli

# Clean workspace
rm -rf ~/sentryvibe-workspace

# Remove config
rm -rf ~/Library/Application\ Support/sentryvibe-runner-cli  # macOS
rm -rf ~/.config/sentryvibe-runner-cli  # Linux

# Reinstall
curl -fsSL https://raw.githubusercontent.com/codyde/sentryvibe/main/install-cli.sh | bash
sentryvibe init
```

## Testing Sentry SDK PR

This project is currently testing [Sentry JavaScript SDK PR #17844](https://github.com/getsentry/sentry-javascript/pull/17844) which adds Claude Code Agent SDK instrumentation.

### Using Local Sentry SDK Tarballs

The monorepo uses pnpm overrides to force all packages to use local Sentry SDK builds:

```json
{
  "pnpm": {
    "overrides": {
      "@sentry/core": "file:./apps/sentryvibe/vendor/sentry-core-LOCAL.tgz",
      "@sentry/node": "file:./apps/sentryvibe/vendor/sentry-node-LOCAL.tgz",
      "@sentry/node-core": "file:./apps/sentryvibe/vendor/sentry-node-core-LOCAL.tgz",
      "@sentry/nextjs": "file:./apps/sentryvibe/vendor/sentry-nextjs-LOCAL.tgz"
    }
  }
}
```

Place built tarballs in `apps/sentryvibe/vendor/` and `apps/runner/vendor/` directories.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `sentryvibe run`
5. Submit a pull request

## License

MIT

## Links

- **Repository**: https://github.com/codyde/sentryvibe
- **Issues**: https://github.com/codyde/sentryvibe/issues
- **Author**: Cody De Arkland

---

Built with Claude AI, Next.js, and TypeScript.

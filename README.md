# SentryVibe

AI-powered project generation platform that uses Claude AI and OpenAI Codex to build web projects with real-time streaming, live previews, and tunnel support.

## Quick Start

**Install CLI:**
```bash
npm install -g @sentryvibe/runner-cli
sentryvibe init -y    # Accept all defaults (generates secure secret)
sentryvibe run
```

Open http://localhost:3000 and start building!

> **Tip**: Use `sentryvibe init` (without `-y`) for interactive setup with custom configuration.

## What is SentryVibe?

SentryVibe lets you describe what you want to build ("Create a React todo app with TypeScript and Tailwind") and AI generates a complete, runnable project on your local machine. Watch Claude AI work in real-time, preview your app instantly via tunnels, and iterate with follow-up prompts.

**Key Features:**
- AI project generation with Claude AI and OpenAI Codex
- Real-time build streaming with full transparency
- Automatic dev server management and port detection
- Cloudflare tunnel creation for instant previews
- Code editor with Monaco for file viewing/editing
- Multi-agent support (Claude Code, OpenAI Codex)
- MCP (Model Context Protocol) integration
- Project management dashboard

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
sentryvibe run
```

**What runs:**
- Web app at http://localhost:3000
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

### Option 1: Install from npm (Recommended)

```bash
npm install -g @sentryvibe/runner-cli

# Initialize with defaults (recommended for first-time setup)
sentryvibe init -y

# Or interactive setup
sentryvibe init

# Start full stack locally
sentryvibe run
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
Start the full stack locally (web app + broker + runner):
```bash
sentryvibe run

# With custom ports
sentryvibe run --port 3001 --broker-port 4001
```

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
Initialize configuration (workspace, broker URL, secret):
```bash
sentryvibe init

# Non-interactive with defaults (-y flag)
sentryvibe init -y
```

**Default configuration when using `-y`:**
- **Workspace**: `~/sentryvibe-workspace`
- **Broker URL**: `ws://localhost:4000/socket` (local mode)
- **API URL**: `http://localhost:3000`
- **Secret**: Auto-generated secure random 64-character hex string
- **Runner ID**: `local`
- **Database**: Prompts to set up Neon PostgreSQL (required for full stack)

The `-y` flag automatically generates a secure secret for you. You'll see output like:
```
Using default configuration...
  Workspace: ~/sentryvibe-workspace
  Broker URL: ws://localhost:4000/socket
  API URL: http://localhost:3000
  Secret: a1b2c3d4e5f6... (generated)
  Runner ID: local

⚠ A random secret was generated for local development.
ℹ For production use, share this secret with your broker configuration.
```

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

# Show help
sentryvibe cleanup
```

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
│   │   ├── cli/                 # CLI commands (init, run, config, etc.)
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
| **CLI** | Commander.js, Inquirer, Chalk, Ora |
| **Tunneling** | Cloudflare tunnel |
| **Observability** | Sentry (experimental PR #17844) |
| **Build System** | pnpm monorepo, TypeScript |

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

# Setup database
cd apps/sentryvibe
pnpm run db:push
cd ../..

# Start all services
pnpm run dev:all
```

This starts:
- Web app at http://localhost:3000
- Broker at http://localhost:4000
- Runner connected to local broker

### Individual Services

```bash
# Web app only
pnpm --filter sentryvibe dev

# Broker only
pnpm --filter sentryvibe-broker dev

# Runner only
cd apps/runner
pnpm run dev
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
- Cloudflare tunnel auto-creation
- Tunnel URLs displayed for instant access
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

### "useState is not defined" or Module Loading Errors

If you encounter errors like `ReferenceError: useState is not defined` or `Module not found` during development with Fast Refresh, this typically means Next.js has cached references to deleted or moved files.

**Solution:**
```bash
# Stop the dev server (Ctrl+C)
cd apps/sentryvibe
npm run clean:cache
# Restart the dev server
npm run dev
```

This error occurs when:
- A component file was deleted but webpack still references it
- Files were moved/renamed during hot reload
- Build cache contains stale module references

The `clean:cache` script removes the `.next` directory, forcing a clean rebuild.

### Runner won't connect
- Verify broker URL is correct (`sentryvibe config get broker.url`)
- Check shared secret matches broker
- Ensure firewall allows WebSocket connections
- Check broker is running (`curl http://localhost:4000/status`)

### Builds failing
- Verify workspace directory exists and is writable
- Check Node.js version (18+ required): `node --version`
- Ensure git is installed: `git --version`
- Check AI API keys are valid
- Review runner logs with `--verbose` flag

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
npm install -g @sentryvibe/runner-cli
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

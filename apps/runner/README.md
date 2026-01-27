# OpenBuilder CLI

The OpenBuilder CLI connects your local machine to [OpenBuilder](https://openbuilder.sh) to build AI-powered applications. It handles code generation, dev servers, and live previews - all running on your machine.

## Quick Start

```bash
# Run directly with npx (no install needed)
npx @openbuilder/cli runner

# Or install globally
npm install -g @openbuilder/cli
openbuilder runner
```

That's it! The CLI will:
1. Open your browser to authenticate (GitHub or Sentry SSO)
2. Automatically generate and store your runner token
3. Connect to openbuilder.sh and start listening for builds

## Installation Options

### npx (Recommended)
No installation needed - always uses the latest version:
```bash
npx @openbuilder/cli runner
```

### Global Install
```bash
npm install -g @openbuilder/cli
openbuilder runner
```

### Curl Install Script
```bash
curl -fsSL https://openbuilder.sh/install | bash
openbuilder runner
```

## Usage

### Connect to OpenBuilder SaaS

```bash
# Start the runner (auto-authenticates via browser)
npx @openbuilder/cli runner

# Or if installed globally
openbuilder runner
```

On first run, your browser will open for authentication. After logging in, the CLI automatically:
- Creates a secure runner token
- Stores it locally for future sessions
- Connects to openbuilder.sh

### Interactive TUI Mode

```bash
npx @openbuilder/cli
# or
openbuilder
```

This opens an interactive menu where you can:
- **Runner Mode** - Connect to openbuilder.sh (SaaS)
- **Local Mode** - Run everything locally (self-hosted)

### Local Mode (Self-Hosted)

Run the entire OpenBuilder stack locally:

```bash
openbuilder run
```

This starts:
- Web App on `http://localhost:3000`
- Runner connected to local web app

## Keyboard Shortcuts

When the runner is connected, use these shortcuts:

| Key | Action |
|-----|--------|
| `b` | Open OpenBuilder in browser |
| `r` | Restart runner connection |
| `q` | Quit the runner |

## Configuration

Configuration is stored at:
- **macOS**: `~/Library/Application Support/openbuilder/config.json`
- **Linux**: `~/.config/openbuilder/config.json`

### View Configuration

```bash
openbuilder status
openbuilder config list
```

### Change Workspace

Projects are stored in `~/openbuilder-projects/` by default:

```bash
openbuilder config set workspace ~/my-projects
```

### CLI Options

Override settings via command-line:

```bash
openbuilder runner \
  --workspace ~/custom-projects \
  --runner-id my-macbook
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `openbuilder` | Launch interactive TUI |
| `openbuilder runner` | Connect to openbuilder.sh |
| `openbuilder run` | Start local mode (self-hosted) |
| `openbuilder login` | Authenticate with openbuilder.sh |
| `openbuilder logout` | Clear stored credentials |
| `openbuilder status` | Show runner status |
| `openbuilder config list` | View all settings |
| `openbuilder config set <key> <value>` | Update a setting |
| `openbuilder config reset` | Reset to defaults |
| `openbuilder cleanup --all` | Remove all projects |
| `openbuilder upgrade` | Upgrade to latest version |

## How It Works

```
┌─────────────────────┐         ┌─────────────────┐
│   openbuilder.sh    │◀──────▶│   Runner CLI    │
│   (Web Interface)   │  WSS   │ (Your Machine)  │
└─────────────────────┘         └────────┬────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │   AI Backend    │
                                │ (Claude Code)   │
                                └─────────────────┘
```

1. You create a project at openbuilder.sh
2. The web app sends build commands to your runner via WebSocket
3. Your runner executes the AI agent (Claude Code) locally
4. Generated code is saved to your workspace
5. Runner starts dev server and creates a Cloudflare tunnel for preview

## Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Claude CLI** - For AI code generation
  ```bash
  # Install Claude CLI
  npm install -g @anthropic-ai/claude-cli
  claude auth login
  ```

## Troubleshooting

### "Runner not authenticated"

The OAuth flow didn't complete. Try:
```bash
openbuilder login
```

### "Cannot connect to server"

Check your internet connection and runner status:
```bash
openbuilder status
```

### Browser doesn't open for auth

Manually visit the URL shown in the terminal, or:
```bash
openbuilder login
```

### Projects not appearing

Ensure you're connected to the same account:
```bash
openbuilder status  # Shows connected account
```

### Reset everything

```bash
openbuilder logout
openbuilder config reset
openbuilder cleanup --all
openbuilder runner  # Re-authenticate
```

## FAQ

**Q: Do I need an API key?**
A: No! Authentication is handled via OAuth (GitHub or Sentry SSO). The CLI automatically manages tokens.

**Q: Where are my projects stored?**
A: In `~/openbuilder-projects/` by default. Check with `openbuilder config get workspace`.

**Q: Can I run multiple runners?**
A: Yes! Each runner gets a unique ID. Run on different machines or use `--runner-id`:
```bash
openbuilder runner --runner-id work-laptop
openbuilder runner --runner-id home-desktop
```

**Q: Does the runner need to stay running?**
A: Yes, while you're using openbuilder.sh. It executes builds and serves previews.

**Q: Can I use a different AI model?**
A: Yes! Select your preferred Claude model using the `@model` tag in the web UI:
- `claude-haiku-4-5` (fast)
- `claude-sonnet-4-5` (balanced)
- `claude-opus-4-5` (most capable)

**Q: How do I update the CLI?**
A: 
```bash
# If using npx, it auto-updates
npx @openbuilder/cli runner

# If installed globally
npm update -g @openbuilder/cli
# or
openbuilder upgrade
```

**Q: How do I uninstall?**
A:
```bash
openbuilder cleanup --all
npm uninstall -g @openbuilder/cli
rm -rf ~/Library/Application\ Support/openbuilder  # macOS
rm -rf ~/.config/openbuilder  # Linux
```

## Development

See the main [OpenBuilder repository](https://github.com/codyde/openbuilder) for development instructions.

```bash
# Clone and setup
git clone https://github.com/codyde/openbuilder.git
cd openbuilder
pnpm install

# Build the CLI
cd apps/runner
pnpm run build

# Test locally
node dist/cli/index.js runner
```

## License

MIT

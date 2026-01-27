# OpenBuilder

OpenBuilder is an AI-powered application builder that uses Claude AI to generate and build projects. You can run it locally on your machine or connect a runner to the hosted SaaS version.

## Quick Start

### Option 1: Local Mode (Self-Hosted)

Run everything locally on your machine - web app, broker, and runner in one command.

```bash
# Install the CLI
curl -fsSL https://openbuilder.app/install | bash

# Start OpenBuilder (full stack)
openbuilder
```

This starts:
- **Web App** on `http://localhost:3000`
- **Broker** for real-time communication
- **Runner** to execute builds

Open `http://localhost:3000` in your browser and start building!

### Option 2: Runner Mode (Connect to SaaS)

Connect your local machine as a runner to the hosted OpenBuilder at [openbuilder.sh](https://openbuilder.sh).

```bash
# Install the CLI
curl -fsSL https://openbuilder.app/install | bash

# Start in runner mode
openbuilder runner --secret <your-runner-key>
```

Get your runner key from the OpenBuilder web app by clicking **"Connect a Runner"**.

## Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **npm or pnpm** - Package manager
- **macOS, Linux, or WSL** - Windows users should use WSL

Verify your setup:
```bash
node --version  # Should be 18.0.0 or higher
```

## How It Works

1. **You describe what you want** - Enter a prompt like "Create a React app with a todo list"
2. **AI builds it** - Claude AI generates the code based on your prompt
3. **Preview instantly** - The runner starts a dev server and creates a preview URL
4. **Iterate** - Continue refining with follow-up prompts

## CLI Commands

| Command | Description |
|---------|-------------|
| `openbuilder` | Start full stack (web + broker + runner) |
| `openbuilder runner` | Start runner only (connect to remote broker) |
| `openbuilder init` | Interactive setup wizard |
| `openbuilder status` | Show runner status and configuration |
| `openbuilder config list` | View all configuration |
| `openbuilder cleanup --all` | Clean up all projects |

## Configuration

Configuration is stored at:
- **macOS**: `~/Library/Application Support/openbuilder/config.json`
- **Linux**: `~/.config/openbuilder/config.json`

Override settings with command-line flags:
```bash
openbuilder runner \
  --broker wss://your-broker.com/socket \
  --workspace ~/my-projects \
  --id my-runner
```

## Project Structure

Generated projects are saved to your workspace directory (default: `~/openbuilder-workspace/`):

```
~/openbuilder-workspace/
├── react-todo-app/
│   ├── package.json
│   ├── src/
│   └── ...
├── nextjs-blog/
└── vite-portfolio/
```

## Troubleshooting

### CLI not found after install
Restart your terminal or run:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### Cannot connect to broker
Check your internet connection and verify the broker URL:
```bash
openbuilder config get broker.url
```

### Build fails
Ensure you have all prerequisites installed:
```bash
node --version
git --version
```

### Reset everything
```bash
openbuilder config reset
openbuilder cleanup --all
openbuilder init
```

## Development

For detailed development instructions, see the [CLI README](apps/runner/README.md).

### Run from source

```bash
# Clone the repo
git clone <repo-url>
cd openbuilder

# Install dependencies
pnpm install

# Start development
pnpm run dev
```

## Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌────────────┐
│    Web App      │────▶│   Broker    │────▶│   Runner   │
│  (Next.js UI)   │◀────│ (WebSocket) │◀────│ (CLI/Node) │
└─────────────────┘     └─────────────┘     └────────────┘
                                                   │
                                                   ▼
                                            ┌────────────┐
                                            │  Claude AI │
                                            └────────────┘
```

- **Web App**: User interface for creating and managing projects
- **Broker**: Real-time communication layer between web and runners
- **Runner**: Executes builds, manages dev servers, creates tunnels
- **Claude AI**: Generates code based on your prompts

## License

[License info]

# OpenBuilder

OpenBuilder is an AI-powered application builder that leverages Claude Code, OpenAI Codex, or OpenCode to generate and build projects. You can run it locally on your machine or connect a runner to the hosted SaaS version at [openbuilder.sh](https://openbuilder.sh).

## Quick Start

```bash
# Install the CLI
curl -fsSL https://openbuilder.app/install | bash

# Launch the TUI
openbuilder
```

This opens an interactive TUI where you can choose:
- **Local Mode** - Run the full stack locally (web app + runner)
- **Runner Mode** - Connect to the hosted SaaS at openbuilder.sh

## Local Mode (Self-Hosted)

Run everything locally on your machine.

```bash
openbuilder
# Select "Local mode" from the TUI
```

This starts:
- **Web App** on `http://localhost:3000` (Next.js frontend)
- **Runner** to execute builds and manage dev servers

Open `http://localhost:3000` in your browser and start building!

## Runner Mode (Connect to SaaS)

Connect your local machine as a runner to the hosted OpenBuilder at [openbuilder.sh](https://openbuilder.sh).

1. Sign up at [openbuilder.sh](https://openbuilder.sh)
2. Click **"Connect a Runner"** to get your runner key
3. Run the CLI:

```bash
openbuilder
# Select "Runner mode" from the TUI and enter your key

# Or directly via command line:
openbuilder runner --secret <your-runner-key>
```

## AI Backends

OpenBuilder supports multiple AI backends for code generation:

### Claude Code (Default)

Uses your local Claude Code subscription via the Claude CLI.

```bash
# Ensure Claude CLI is installed and authenticated
claude --version
```

### OpenAI Codex

Use OpenAI's Codex for code generation:

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your-api-key

# Configure OpenBuilder to use Codex
openbuilder config set ai.provider codex
```

### OpenCode (Experimental)

Use OpenCode Zen for code generation:

```bash
# Configure OpenBuilder to use OpenCode
openbuilder config set ai.provider opencode
```

## Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **npm or pnpm** - Package manager
- **macOS, Linux, or WSL** - Windows users should use WSL
- **AI Backend** - Claude Code, OpenAI API key, or OpenCode

Verify your setup:
```bash
node --version  # Should be 18.0.0 or higher
```

## How It Works

1. **You describe what you want** - Enter a prompt like "Create a React app with a todo list"
2. **AI generates the code** - Your configured AI backend (Claude, Codex, or OpenCode) builds the application
3. **Preview instantly** - The runner starts a dev server and creates a preview URL via tunnel
4. **Iterate with tags** - Use `@` tags to reference files, URLs, or context in your prompts

### Using Tags

Tags let you provide context to the AI:

| Tag | Description | Example |
|-----|-------------|---------|
| `@file` | Reference a file in your project | `@file:src/App.tsx` |
| `@url` | Include content from a URL | `@url:https://api.example.com/docs` |
| `@image` | Attach an image for visual context | `@image:design.png` |
| `@git` | Reference git diff or history | `@git:diff` |

Example prompt:
```
Update the header component @file:src/components/Header.tsx to match this design @image:header-mockup.png
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `openbuilder` | Launch TUI to choose local or runner mode |
| `openbuilder runner` | Start runner only (connect to openbuilder.sh) |
| `openbuilder run` | Start local mode directly |
| `openbuilder init` | Interactive setup wizard |
| `openbuilder upgrade` | Upgrade CLI and app installation |
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
  --secret <your-runner-key> \
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

### Cannot connect to server
Check your internet connection and runner key:
```bash
openbuilder status
```

### Build fails
Ensure you have all prerequisites installed:
```bash
node --version
git --version
claude --version  # If using Claude Code
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
git clone https://github.com/codyde/openbuilder.git
cd openbuilder

# Install dependencies
pnpm install

# Start development
pnpm run dev
```

## Architecture

```
┌─────────────────┐                    ┌────────────┐
│    Web App      │◀──── WebSocket ───▶│   Runner   │
│  (Next.js UI)   │                    │ (CLI/Node) │
└─────────────────┘                    └────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │    AI Backend    │
                                    │ (Claude/Codex/   │
                                    │    OpenCode)     │
                                    └──────────────────┘
```

- **Web App**: Next.js frontend for creating and managing projects
- **Runner**: Executes builds, manages dev servers, creates tunnels for previews
- **AI Backend**: Generates code based on your prompts (Claude Code, Codex, or OpenCode)

## License

MIT

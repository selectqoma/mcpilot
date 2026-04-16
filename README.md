# MCPilot

Local MCP proxy — one config, one connection, all your tools.

MCPilot sits between your AI client (Claude Code, Cursor, Codex CLI) and your MCP servers. One config file, one connection, all your tools — with logging, filtering, and credential management built in.

## The Problem

Running multiple MCP servers today means:

- **Config sprawl** — every client has its own JSON config, API keys scattered everywhere
- **No visibility** — zero logs of what tools your agents call, when they fail, or how often
- **Tool overload** — >40 tools degrades LLM accuracy, no way to filter
- **Brittle setups** — servers crash silently, no health checks, manual restarts

## Quick Start

```bash
# Initialize config
npx mcpilot init

# Edit with your servers
vim mcpilot.yaml

# Start the proxy
npx mcpilot start
```

Then add **one entry** to your Claude Code config:

```json
{
  "mcpServers": {
    "mcpilot": {
      "command": "npx",
      "args": ["mcpilot", "start"]
    }
  }
}
```

That's it. All your servers, credentials, and filtering managed through a single `mcpilot.yaml`.

## Config File

```yaml
# mcpilot.yaml
settings:
  log_file: ~/.mcpilot/logs.jsonl
  max_tools: 40
  health_check_interval: 30

# Credentials — reference with ${VAR_NAME}
credentials:
  GITHUB_TOKEN: ${GITHUB_TOKEN}
  DATABASE_URL: postgres://localhost/mydb

# Servers
servers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: ${GITHUB_TOKEN}
    tools:
      include: ["*"]
      exclude: ["github_delete_*"]

  postgres:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-postgres"]
    env:
      POSTGRES_CONNECTION_STRING: ${DATABASE_URL}
    tools:
      include: ["query"]

  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    tools:
      include: ["*"]

# Tool namespacing
namespacing:
  separator: "_"
```

## How It Works

```
┌─────────────────────┐
│   Claude Code /      │
│   Cursor / Codex     │
└──────────┬──────────┘
           │ stdio
           ▼
┌─────────────────────┐
│      MCPilot        │
│                     │
│  Config Manager     │  ← mcpilot.yaml
│  Tool Router        │  ← routes calls to correct server
│  Tool Filter        │  ← namespace + cap at max_tools
│  Credential Vault   │  ← ${ENV_VAR} substitution
│  Request Logger     │  ← every call logged with timing
│  Health Monitor     │  ← periodic checks, auto-restart
└──────────┬──────────┘
           │ stdio
     ┌─────┼─────┐
     ▼     ▼     ▼
  GitHub  DB  Filesystem
```

## Features

**Credential Vault** — Define credentials once, reference everywhere. Values pulled from environment variables. Rotating a key means changing one line.

**Tool Namespacing** — Tools are prefixed with server name (`github_create_issue`, `postgres_query`). No collisions between servers.

**Tool Filtering** — Per-server `include`/`exclude` patterns. Hide dangerous tools. Stay under the 40-tool LLM limit.

**Request Logging** — Every tool call logged as structured JSONL with timestamp, server, tool name, duration, and status.

**Health Monitoring** — Periodic health checks on all servers. Auto-restart after 3 consecutive failures. State written to `~/.mcpilot/state.json`.

**Tool Capping** — When total tools exceed `max_tools`, least-recently-used tools are automatically hidden.

## CLI

```bash
mcpilot init                        # Create mcpilot.yaml
mcpilot init --client claude-code   # Also print Claude Code config
mcpilot start                       # Start proxy with all servers
mcpilot start --config path         # Use specific config file
mcpilot status                      # Show proxy + server health
mcpilot logs                        # View recent tool call logs
mcpilot logs --server github        # Filter by server
mcpilot logs --status error         # Show only errors
mcpilot logs --tail 100             # Show last 100 entries
mcpilot doctor                      # Comprehensive health check
mcpilot add                         # Add server from curated registry
mcpilot add github                  # Add specific server
```

## Adding Servers

Use the curated registry to add popular MCP servers:

```bash
$ mcpilot add

Available servers:
  1. github — GitHub API — issues, PRs, repos
  2. filesystem — Local filesystem access
  3. postgres — PostgreSQL database
  4. fetch — HTTP fetch — web requests
  5. sqlite — SQLite database
  6. brave_search — Brave web search
  7. memory — Persistent key-value memory
  8. puppeteer — Browser automation via Puppeteer
  9. sequential_thinking — Structured step-by-step thinking
  10. slack — Slack messaging API

Pick a server (name or number):
```

Or add directly:

```bash
mcpilot add github
```

## Request Logs

Every tool call is logged to `~/.mcpilot/logs.jsonl`:

```jsonl
{"ts":"2026-04-16T14:32:01Z","server":"github","tool":"list_issues","duration_ms":342,"status":"success"}
{"ts":"2026-04-16T14:32:05Z","server":"postgres","tool":"query","duration_ms":1205,"status":"error","error":"connection refused"}
```

View with:

```bash
mcpilot logs
```

## Install

```bash
npm install -g mcpilot
```

Or use without installing:

```bash
npx mcpilot init
npx mcpilot start
```

## License

MIT

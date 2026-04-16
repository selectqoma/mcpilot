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
│  Tool Filter        │  ← namespace + filter tools
│  Credential Vault   │  ← ${ENV_VAR} substitution
│  Request Logger     │  ← every call logged with timing
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

## CLI

```bash
mcpilot init                  # Create mcpilot.yaml
mcpilot init --client claude-code  # Also print Claude Code config
mcpilot start                 # Start proxy with all servers
mcpilot start --config path   # Use specific config file
```

## Request Logs

Every tool call is logged to `~/.mcpilot/logs.jsonl`:

```jsonl
{"ts":"2026-04-16T14:32:01Z","server":"github","tool":"list_issues","duration_ms":342,"status":"success"}
{"ts":"2026-04-16T14:32:05Z","server":"postgres","tool":"query","duration_ms":1205,"status":"error","error":"connection refused"}
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

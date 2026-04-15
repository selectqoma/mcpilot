# MCPilot — Product Specification

## What

MCPilot is a local MCP proxy that sits between your AI client (Claude Code, Cursor, Codex CLI) and your MCP servers. One config file, one connection, all your tools — with logging, health checks, and credential management built in.

## Problem

Developers running multiple MCP servers face:
- **Config sprawl** — every client has its own JSON config, API keys scattered everywhere
- **No visibility** — zero logs of what tools your agents call, when they fail, or how often
- **Tool overload** — >40 tools degrades LLM accuracy, no way to filter
- **Brittle setups** — servers crash silently, no health checks, manual restarts
- **No sharing** — can't share MCP configs across a team without copy-pasting JSON

## Solution

A lightweight proxy that:
1. Manages all your MCP servers from a single config file
2. Exposes one unified endpoint to any MCP client
3. Logs every tool call with timestamps, duration, and results
4. Filters tools to stay under the 40-tool LLM limit
5. Health-checks servers and auto-restarts on crash
6. Vaults credentials so API keys live in one place

## Positioning

| | MetaMCP | Portkey | MCPilot |
|---|---|---|---|
| Target | Self-hosted tinkerers | Enterprise teams | Solo devs → small teams |
| Setup | Docker compose + config | SaaS onboarding + SDK | `npx mcpilot init` |
| Auth | Manual | Full IdP integration | Env var vault, upgrade to OAuth |
| Analytics | None | Full observability ($49/mo) | Request logging (free), analytics ($15/mo) |
| Hosting | Self-hosted only | Cloud or self-hosted | Local proxy (free), cloud sync (paid) |

**Wedge:** Developer-first. Zero config friction. Local-first. Upgrade when you need team features.

---

## Architecture

```
┌─────────────────────┐
│   Claude Code /      │
│   Cursor / Codex     │
└──────────┬──────────┘
           │ stdio
           ▼
┌─────────────────────┐
│      MCPilot        │  ← single process, local proxy
│                     │
│  ┌───────────────┐  │
│  │ Config Manager │  │  ← mcpilot.yaml: servers, credentials, filters
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Tool Router    │  │  ← routes tool calls to correct backend server
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Tool Filter    │  │  ← namespace + cap at 40 tools
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Credential     │  │  ← ${ENV_VAR} substitution from vault
│  │  Vault         │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Request Logger │  │  ← every tool call logged with timestamp + duration
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Health Monitor │  │  ← ping servers, auto-restart on crash
│  └───────────────┘  │
└──────────┬──────────┘
           │ stdio (subprocesses)
     ┌─────┼─────┐
     ▼     ▼     ▼
  GitHub  DB  Filesystem   ← actual MCP servers
```

---

## Tech Stack

- **Language:** TypeScript / Node.js
- **MCP SDK:** `@modelcontextprotocol/sdk` (official)
- **Config:** YAML (`mcpilot.yaml`)
- **Transport:** stdio (client ↔ MCPilot) and stdio (MCPilot ↔ servers)
- **Logging:** structured JSON to file + console
- **Distribution:** npm package (`npx mcpilot`)

**Why TypeScript:** Official MCP SDK, native stdio support, fast to build, npm distribution = zero install friction.

---

## Config File: `mcpilot.yaml`

```yaml
# mcpilot.yaml — single source of truth for all your MCP servers

# Global settings
settings:
  log_file: ~/.mcpilot/logs.jsonl        # where request logs go
  max_tools: 40                           # cap tools exposed to client
  health_check_interval: 30              # seconds between health checks

# Credential vault — reference with ${VAR_NAME}
credentials:
  GITHUB_TOKEN: ${GITHUB_TOKEN}           # pulled from env vars
  DATABASE_URL: postgres://localhost/mydb  # or hardcoded (local dev)
  OPENAI_API_KEY: ${OPENAI_API_KEY}

# MCP servers to manage
servers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: ${GITHUB_TOKEN}
    tools:
      include: ["*"]                       # expose all tools
      # exclude: ["github_delete_*"]       # can exclude dangerous tools

  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
    tools:
      include: ["*"]

  postgres:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-postgres"]
    env:
      POSTGRES_CONNECTION_STRING: ${DATABASE_URL}
    tools:
      include: ["query"]                   # only expose query, not dangerous ones

# Tool filtering — namespaces prevent collisions
namespacing:
  prefix: server                          # github:tool_name, postgres:tool_name
  separator: "_"                          # github_tool_name (underscore = Claude-friendly)
```

---

## CLI Commands

```bash
# Initialize a new config
mcpilot init

# Start the proxy (spawns all servers, exposes single endpoint)
mcpilot start

# Check status of all servers
mcpilot status

# View recent tool calls
mcpilot logs [--server github] [--tail 50]

# Add a server interactively
mcpilot add github

# Test a tool call
mcpilot test github_list_issues --input '{"owner":"anthropics","repo":"claude-code"}'

# Health check all servers
mcpilot doctor
```

---

## Client Integration

After `mcpilot start`, the user adds ONE entry to their Claude Code config:

```json
{
  "mcpServers": {
    "mcpilot": {
      "command": "mcpilot",
      "args": ["start"]
    }
  }
}
```

That's it. All servers, credentials, and filtering are managed through `mcpilot.yaml`.

---

## Core Features — Detailed

### 1. Credential Vault

**Problem:** API keys are scattered across per-client JSON configs. Rotating a key means editing N files.

**Solution:** Define credentials once in `mcpilot.yaml`. Reference with `${VAR_NAME}` syntax. Values pulled from environment variables or the config file itself.

```yaml
credentials:
  GITHUB_TOKEN: ${GITHUB_TOKEN}
```

**Implementation:**
- On startup, resolve all `${VAR_NAME}` references
- Check required vars are set, fail with clear error if missing
- Inject resolved values into server `env` blocks
- Never log or expose credential values

### 2. Tool Filtering and Namespacing

**Problem:** More than 40 tools degrades LLM accuracy. Tool name collisions between servers.

**Solution:** 
- Each server can have `include`/`exclude` patterns for its tools
- Tools are namespaced with server prefix (e.g., `github_create_issue`)
- Total tool count capped at `max_tools` (default 40)
- When over cap, least-recently-used tools are hidden

**Implementation:**
- On `tools/list` from client, MCPilot aggregates from all healthy servers
- Apply per-server include/exclude filters
- Add namespace prefix
- If total > max_tools, drop tools with lowest usage count from last 24h

### 3. Request Logging

**Problem:** Zero visibility into what tools agents call, when they fail, or how long they take.

**Solution:** Every tool call logged as structured JSON.

```jsonl
{"ts":"2026-04-15T14:32:01Z","server":"github","tool":"create_issue","duration_ms":342,"status":"success"}
{"ts":"2026-04-15T14:32:05Z","server":"postgres","tool":"query","duration_ms":1205,"status":"error","error":"connection refused"}
```

**Implementation:**
- Intercept all `tools/call` requests
- Log before (start timer) and after (record duration + result)
- Write to `~/.mcpilot/logs.jsonl` as JSONL
- `mcpilot logs` command reads and filters this file

### 4. Health Monitoring

**Problem:** MCP servers crash silently. Agents fail with cryptic errors.

**Solution:**
- Every 30 seconds, ping each server with a lightweight request
- If a server is unresponsive, kill and restart it
- Log restart events
- `mcpilot status` shows health of all servers

**Implementation:**
- Use `ping` method if server supports it, otherwise `tools/list`
- Track consecutive failures per server
- After 3 consecutive failures, restart the subprocess
- `mcpilot doctor` runs a comprehensive check

### 5. Config Management

**Problem:** Every client (Claude Code, Cursor, Codex CLI) has its own MCP config format and location.

**Solution:**
- Single `mcpilot.yaml` defines everything
- MCPilot handles the translation to each client's config format
- `mcpilot init --client claude-code` generates the right client config

---

## Pricing

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | Local proxy, credential vault, tool filtering, request logging, health checks |
| **Pro** | $15/mo | Team config sharing (sync `mcpilot.yaml` to cloud), analytics dashboard (tool usage charts, error rates, latency), config versioning |

**Free tier is fully functional.** Paid tier adds collaboration features, not core functionality. The free tier needs to be genuinely valuable on its own — that's what drives word of mouth.

**Upgrade trigger:** When a second person on the team wants the same MCP setup. That's when sharing configs becomes painful enough to pay $15/mo.

---

## File Structure

```
mcpilot/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── proxy.ts              # Main proxy server (MCP server implementation)
│   ├── config.ts             # YAML config parser + credential resolver
│   ├── registry.ts           # Server registry (lifecycle management)
│   ├── router.ts             # Request routing (tools/resources/prompts)
│   ├── filter.ts             # Tool filtering + namespacing
│   ├── logger.ts             # Structured JSON request logging
│   ├── health.ts             # Health monitoring + auto-restart
│   └── commands/
│       ├── init.ts           # mcpilot init
│       ├── start.ts          # mcpilot start
│       ├── status.ts         # mcpilot status
│       ├── logs.ts           # mcpilot logs
│       ├── add.ts            # mcpilot add <server>
│       ├── test.ts           # mcpilot test <tool>
│       └── doctor.ts         # mcpilot doctor
├── package.json
├── tsconfig.json
└── README.md
```

---

## MVP Scope (v0.1 — 2 weeks)

Build ONLY these features:
1. `mcpilot init` — generate config file
2. `mcpilot start` — spawn servers, expose unified MCP endpoint
3. Credential vault — `${ENV_VAR}` substitution
4. Tool namespacing — prefix tools with server name
5. Request logging — JSONL file with every tool call
6. Single client integration — Claude Code config generation

**Explicitly out of v0.1:**
- Health monitoring / auto-restart (v0.2)
- Tool count capping (v0.2)
- `mcpilot status`, `mcpilot logs`, `mcpilot doctor` (v0.2)
- `mcpilot add`, `mcpilot test` (v0.2)
- Team sharing / analytics dashboard (v1.0 paid tier)
- Multi-client config generation (v0.3)

---

## Verification

1. `npm install -g mcpilot && mcpilot init` creates valid config
2. Add 3 MCP servers to config, run `mcpilot start`
3. Configure Claude Code to use MCPilot as single MCP server
4. Verify Claude Code sees all tools from all 3 servers, namespaced correctly
5. Make a tool call through Claude Code, verify it routes to correct server
6. Check `~/.mcpilot/logs.jsonl` shows the tool call with timestamp and duration
7. Verify credentials are resolved from env vars, not hardcoded

---

## Distribution

```bash
# Install
npm install -g mcpilot

# Or use without installing
npx mcpilot init
npx mcpilot start
```

No Docker. No cloud account. No signup. Local-first, developer-friendly.

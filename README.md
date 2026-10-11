# MCPilot

A local proxy that connects an MCP client to several MCP servers over stdio. It prefixes and filters tool names, logs calls, checks server health, and supports configuration profiles and OS keychain credentials.

## Run from source

```sh
npm ci
npm run build
node dist/index.js init
```

Edit the generated `mcpilot.yaml`, then point your MCP client's configuration at the built proxy:

```json
{
  "mcpServers": {
    "mcpilot": {
      "command": "node",
      "args": ["/absolute/path/to/mcpilot/dist/index.js", "start", "--config", "/absolute/path/to/mcpilot/mcpilot.yaml"]
    }
  }
}
```

Each server has a command, arguments, environment variables and optional `tools.include` / `tools.exclude` patterns. Credentials can reference `${ENV_VAR}` or `vault://KEY_NAME`. Backend servers need their own dependencies and credentials.

## Useful commands

Run these after `node dist/index.js`:

- `add` — choose a server from the registry.
- `status` or `doctor` — inspect server health and configuration.
- `logs` — read tool-call logs, stored in `~/.mcpilot/logs.jsonl` by default.
- `profile`, `vault`, `dashboard` — manage profiles, credentials and the local dashboard; use `--help` for options.

`settings.max_tools` controls how many tools the proxy exposes; the default is 40. This is a configurable cap, not an MCP protocol limit.

Run `npm test` for the end-to-end checks. Licensed under [MIT](LICENSE).

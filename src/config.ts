import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { McpilotConfig, ResolvedServer } from "./types.js";

const DEFAULTS: McpilotConfig = {
  settings: {
    log_file: "~/.mcpilot/logs.jsonl",
    max_tools: 40,
    health_check_interval: 30,
  },
  credentials: {},
  servers: {},
  namespacing: {
    prefix: "server",
    separator: "_",
  },
};

export function resolvePath(filepath: string): string {
  if (filepath.startsWith("~")) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return path.resolve(filepath);
}

function resolveCredentialValue(value: string): string {
  const envMatch = value.match(/^\$\{(.+)\}$/);
  if (envMatch) {
    const envVar = envMatch[1];
    const resolved = process.env[envVar];
    if (!resolved) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
    return resolved;
  }
  return value;
}

export function resolveEnv(
  env: Record<string, string> | undefined,
  credentials: Record<string, string>
): Record<string, string> {
  if (!env) return {};

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const envMatch = value.match(/^\$\{(.+)\}$/);
    if (envMatch) {
      const varName = envMatch[1];
      if (credentials[varName]) {
        resolved[key] = resolveCredentialValue(credentials[varName]);
      } else {
        resolved[key] = resolveCredentialValue(value);
      }
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

export function loadConfig(configPath?: string): McpilotConfig {
  const resolvedPath = configPath
    ? resolvePath(configPath)
    : findConfig();

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throw new Error(
      "No mcpilot.yaml found. Run `mcpilot init` to create one."
    );
  }

  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const parsed = yaml.load(raw) as Partial<McpilotConfig>;

  // Resolve credential values
  const credentials: Record<string, string> = {};
  if (parsed.credentials) {
    for (const [key, value] of Object.entries(parsed.credentials)) {
      credentials[key] = resolveCredentialValue(value);
    }
  }

  return {
    settings: { ...DEFAULTS.settings, ...parsed.settings },
    credentials,
    servers: parsed.servers || DEFAULTS.servers,
    namespacing: { ...DEFAULTS.namespacing, ...parsed.namespacing },
  };
}

export function resolveServers(config: McpilotConfig): ResolvedServer[] {
  return Object.entries(config.servers).map(([name, server]) => ({
    name,
    ...server,
    resolvedEnv: resolveEnv(server.env, config.credentials),
  }));
}

export function findConfig(): string | null {
  // Check current directory, then parent directories up to home
  let dir = process.cwd();
  const home = os.homedir();

  while (true) {
    const candidate = path.join(dir, "mcpilot.yaml");
    if (fs.existsSync(candidate)) return candidate;

    if (dir === home || path.dirname(dir) === dir) break;
    dir = path.dirname(dir);
  }

  // Check home directory as fallback
  const homeCandidate = path.join(home, "mcpilot.yaml");
  if (fs.existsSync(homeCandidate)) return homeCandidate;

  return null;
}

export function getDefaultConfig(): McpilotConfig {
  return DEFAULTS;
}

export function generateConfigYaml(): string {
  return `# mcpilot.yaml — single source of truth for all your MCP servers

settings:
  log_file: ~/.mcpilot/logs.jsonl
  max_tools: 40
  health_check_interval: 30

# Credential vault — reference with \${VAR_NAME}
credentials:
  GITHUB_TOKEN: \${GITHUB_TOKEN}

# MCP servers to manage
servers:
  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    tools:
      include: ["*"]
`;
}

export function generateClaudeCodeConfig(): string {
  return JSON.stringify(
    {
      mcpServers: {
        mcpilot: {
          command: "mcpilot",
          args: ["start"],
        },
      },
    },
    null,
    2
  );
}

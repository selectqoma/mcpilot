import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProxyState, ServerState } from "./types.js";
import { ServerRegistry } from "./registry.js";

const STATE_DIR = path.join(os.homedir(), ".mcpilot");
const STATE_FILE = path.join(STATE_DIR, "state.json");

export function getStatePath(): string {
  return STATE_FILE;
}

export function writeState(
  registry: ServerRegistry,
  serverHealth?: Map<string, { healthy: boolean; tool_count?: number; error?: string }>
): void {
  const servers: Record<string, ServerState> = {};

  for (const name of registry.getServerNames()) {
    const managed = registry.getManagedServer(name);
    const health = serverHealth?.get(name);

    if (managed) {
      servers[name] = {
        status: health ? (health.healthy ? "healthy" : "unhealthy") : "starting",
        tool_count: health?.tool_count ?? 0,
        last_check: health ? new Date().toISOString() : "",
        restarts: managed.restartCount,
        error: health?.error,
      };
    }
  }

  const state: ProxyState = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    servers,
  };

  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function readState(): ProxyState | null {
  if (!fs.existsSync(STATE_FILE)) return null;

  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw) as ProxyState;
  } catch {
    return null;
  }
}

export function clearState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function isProxyRunning(): boolean {
  const state = readState();
  if (!state) return false;

  try {
    // Send signal 0 to check if process exists
    process.kill(state.pid, 0);
    return true;
  } catch {
    return false;
  }
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { readState } from "../state.js";

const STATE_FILE = path.join(os.homedir(), ".mcpilot", "state.json");
const LOG_FILE = path.join(os.homedir(), ".mcpilot", "logs.jsonl");

export function dashboardCommand(): Command {
  return new Command("dashboard")
    .description("Live dashboard — streaming server health and tool calls")
    .option("--log-file <path>", "Custom log file path")
    .action((options: { logFile?: string }) => {
      const logFile = options.logFile ?? LOG_FILE;

      // Initial draw
      draw(logFile);

      // Watch for changes
      const stateWatcher = fs.watch(
        path.dirname(STATE_FILE),
        { persistent: false },
        (eventType, filename) => {
          if (filename === "state.json") {
            draw(logFile);
          }
        }
      );

      const logWatcher = fs.watch(
        path.dirname(logFile),
        { persistent: false },
        (eventType, filename) => {
          if (filename === path.basename(logFile)) {
            draw(logFile);
          }
        }
      );

      // Also refresh every 2 seconds for smooth updates
      const interval = setInterval(() => draw(logFile), 2000);

      // Cleanup on exit
      process.on("SIGINT", () => {
        clearInterval(interval);
        stateWatcher.close();
        logWatcher.close();
        process.stdout.write("\x1B[?25h"); // show cursor
        process.exit(0);
      });

      process.stdout.write("\x1B[?25l"); // hide cursor
    });
}

function draw(logFile: string): void {
  const state = readState();
  const lines: string[] = [];

  // Header
  if (state) {
    const uptime = Date.now() - new Date(state.started_at).getTime();
    const uptimeStr = formatDuration(uptime);
    const serverCount = Object.keys(state.servers).length;
    lines.push(`  MCPilot — ${serverCount} server${serverCount !== 1 ? "s" : ""}, up ${uptimeStr}`);
  } else {
    lines.push("  MCPilot — proxy not running");
  }

  // Server status
  lines.push("");
  lines.push("  SERVERS");
  if (state) {
    for (const [name, info] of Object.entries(state.servers)) {
      const icon = info.status === "healthy" ? "\u25CF" : "\u25CB";
      const status = info.status.padEnd(10);
      const tools = `${info.tool_count} tools`.padEnd(10);
      const restarts = info.restarts > 0 ? `  ${info.restarts} restarts` : "";
      const error = info.error ? `  (${info.error})` : "";
      lines.push(`  ${name.padEnd(16)} ${icon} ${status} ${tools}${restarts}${error}`);
    }
  } else {
    lines.push("  No servers — start the proxy first");
  }

  // Recent calls
  lines.push("");
  lines.push("  RECENT CALLS");

  const logs = readLastLogs(logFile, 8);
  if (logs.length > 0) {
    for (const entry of logs) {
      const ts = entry.ts.replace("T", " ").replace("Z", "").slice(11, 19);
      const server = entry.server;
      const tool = entry.tool;
      const status = entry.status === "error" ? "FAIL" : " OK ";
      const duration = formatMs(entry.duration_ms);
      const error = entry.error ? `  ${entry.error}` : "";
      lines.push(`  ${ts}  ${server}:${tool.padEnd(24)} ${status} ${duration}${error}`);
    }
  } else {
    lines.push("  No tool calls yet");
  }

  // Clear and redraw
  process.stdout.write("\x1B[2J\x1B[H"); // clear screen, move to top
  process.stdout.write(lines.join("\n") + "\n");
}

function readLastLogs(logPath: string, count: number): Array<{
  ts: string; server: string; tool: string;
  duration_ms: number; status: string; error?: string;
}> {
  if (!fs.existsSync(logPath)) return [];

  try {
    const content = fs.readFileSync(logPath, "utf-8").trim();
    if (!content) return [];

    const lines = content.split("\n");
    return lines
      .slice(-count)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean) as Array<{
        ts: string; server: string; tool: string;
        duration_ms: number; status: string; error?: string;
      }>;
  } catch {
    return [];
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

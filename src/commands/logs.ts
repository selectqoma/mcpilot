import fs from "node:fs";
import { Command } from "commander";
import { loadConfig } from "../config.js";

export function logsCommand(): Command {
  return new Command("logs")
    .description("View request logs")
    .option("--server <name>", "Filter by server name")
    .option("--status <status>", "Filter by status (success|error)")
    .option("--tail <n>", "Show last N lines", "50")
    .option("--config <path>", "Path to mcpilot.yaml")
    .action((options: { server?: string; status?: string; tail: string; config?: string }) => {
      const config = loadConfig(options.config);
      const logPath = config.settings.log_file.replace("~", process.env.HOME || "~");

      if (!fs.existsSync(logPath)) {
        console.log("No logs found.");
        return;
      }

      const content = fs.readFileSync(logPath, "utf-8").trim();
      if (!content) {
        console.log("No logs found.");
        return;
      }

      let lines = content.split("\n");

      // Parse and filter
      const entries = lines
        .map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean) as Array<{
          ts: string; server: string; tool: string;
          duration_ms: number; status: string; error?: string;
        }>;

      let filtered = entries;
      if (options.server) {
        filtered = filtered.filter((e) => e.server === options.server);
      }
      if (options.status) {
        filtered = filtered.filter((e) => e.status === options.status);
      }

      const tail = parseInt(options.tail, 10) || 50;
      const sliced = filtered.slice(-tail);

      if (sliced.length === 0) {
        console.log("No matching log entries.");
        return;
      }

      for (const entry of sliced) {
        const ts = entry.ts.replace("T", " ").replace("Z", "");
        const status = entry.status === "error" ? "FAIL" : "OK";
        let line = `[${ts}] ${entry.server}:${entry.tool} (${entry.duration_ms}ms) ${status}`;
        if (entry.error) line += ` — ${entry.error}`;
        console.log(line);
      }
    });
}

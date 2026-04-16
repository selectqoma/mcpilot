import { Command } from "commander";
import { loadConfig } from "../config.js";
import { readState, isProxyRunning } from "../state.js";

export function statusCommand(): Command {
  return new Command("status")
    .description("Show health of all configured servers")
    .option("--config <path>", "Path to mcpilot.yaml")
    .action((options: { config?: string }) => {
      const running = isProxyRunning();

      if (!running) {
        console.log("Proxy is not running.");
        console.log("\nRun `mcpilot start` to start the proxy.");

        // Show what's configured even when not running
        try {
          const config = loadConfig(options.config);
          const serverNames = Object.keys(config.servers);
          if (serverNames.length > 0) {
            console.log(`\nConfigured servers (${serverNames.length}):`);
            for (const name of serverNames) {
              const server = config.servers[name];
              console.log(`  - ${name}: ${server.command} ${server.args.join(" ")}`);
            }
          }
        } catch {
          // No config found, that's fine
        }
        return;
      }

      const state = readState();
      if (!state) {
        console.log("Proxy is running but no state file found.");
        return;
      }

      const uptime = Date.now() - new Date(state.started_at).getTime();
      const uptimeStr = formatDuration(uptime);

      console.log(`Proxy is running (PID ${state.pid}, up ${uptimeStr})`);
      console.log();

      const serverNames = Object.keys(state.servers);
      if (serverNames.length === 0) {
        console.log("No servers registered.");
        return;
      }

      console.log("Servers:");
      for (const [name, info] of Object.entries(state.servers)) {
        const icon = info.status === "healthy" ? "OK" : info.status === "unhealthy" ? "FAIL" : "...";
        let line = `  [${icon}] ${name} — ${info.status}, ${info.tool_count} tools`;
        if (info.restarts > 0) line += `, ${info.restarts} restarts`;
        if (info.error) line += ` (${info.error})`;
        console.log(line);
      }
    });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

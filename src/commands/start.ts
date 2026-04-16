import { Command } from "commander";
import { loadConfig } from "../config.js";
import { startProxy } from "../proxy.js";

export function startCommand(): Command {
  return new Command("start")
    .description("Start the MCP proxy (spawns all servers, exposes unified endpoint)")
    .option("--config <path>", "Path to mcpilot.yaml")
    .action(async (options: { config?: string }) => {
      try {
        const config = loadConfig(options.config);
        await startProxy(config);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : err}`
        );
        process.exit(1);
      }
    });
}

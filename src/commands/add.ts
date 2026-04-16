import fs from "node:fs";
import readline from "node:readline";
import { Command } from "commander";
import yaml from "js-yaml";
import { CURATED_SERVERS } from "../registry-data.js";
import { loadConfig, findConfig } from "../config.js";

export function addCommand(): Command {
  return new Command("add")
    .description("Add a server to the config")
    .argument("[name]", "Server name")
    .option("--registry", "Choose from curated registry")
    .option("--command <cmd>", "Server command")
    .option("--args <args>", "Comma-separated arguments")
    .option("--config <path>", "Path to mcpilot.yaml")
    .action(async (name?: string, options?: {
      registry?: boolean;
      command?: string;
      args?: string;
      config?: string;
    }) => {
      const configPath = options?.config || findConfig();
      if (!configPath) {
        console.error("No mcpilot.yaml found. Run `mcpilot init` first.");
        process.exit(1);
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ask = (question: string): Promise<string> =>
        new Promise((resolve) => rl.question(question, resolve));

      try {
        let serverName = name;
        let command = options?.command;
        let args = options?.args;

        // If --registry or no name, show curated list
        if (options?.registry || !serverName) {
          console.log("\nAvailable servers:");
          const entries = Object.entries(CURATED_SERVERS);
          entries.forEach(([key, entry], i) => {
            console.log(`  ${i + 1}. ${key} — ${entry.description}`);
          });
          console.log();

          const choice = await ask("Pick a server (name or number): ");
          const num = parseInt(choice, 10);
          if (num >= 1 && num <= entries.length) {
            serverName = entries[num - 1][0];
          } else if (CURATED_SERVERS[choice.trim()]) {
            serverName = choice.trim();
          } else {
            console.error("Invalid choice.");
            process.exit(1);
          }

          // Pre-fill from registry
          const entry = CURATED_SERVERS[serverName];
          if (!command) command = entry.command;
          if (!args) args = entry.args.join(", ");
        }

        if (!serverName) {
          serverName = await ask("Server name: ");
        }
        if (!command) {
          command = await ask("Command (e.g., npx): ");
        }
        if (!args) {
          args = await ask("Arguments (comma-separated): ");
        }

        // Read existing config
        const raw = fs.readFileSync(configPath, "utf-8");
        const config = yaml.load(raw) as Record<string, unknown>;

        if (!config.servers) config.servers = {};
        const servers = config.servers as Record<string, unknown>;

        if (servers[serverName]) {
          console.error(`Server "${serverName}" already exists in config.`);
          process.exit(1);
        }

        const argsArray = args.split(",").map((a: string) => a.trim());
        const serverEntry: Record<string, unknown> = {
          command,
          args: argsArray,
        };

        // Add env from registry if available
        if (CURATED_SERVERS[serverName]?.env) {
          serverEntry.env = CURATED_SERVERS[serverName].env;
        }

        serverEntry.tools = { include: ["*"] };

        servers[serverName] = serverEntry;

        fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1 }), "utf-8");
        console.log(`Added server "${serverName}" to ${configPath}`);
      } finally {
        rl.close();
      }
    });
}

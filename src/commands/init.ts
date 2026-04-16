import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { generateConfigYaml, generateClaudeCodeConfig } from "../config.js";

export function initCommand(): Command {
  return new Command("init")
    .description("Initialize a new mcpilot.yaml config")
    .option("--client <client>", "Generate client config (claude-code)", "")
    .action((options: { client: string }) => {
      // Generate mcpilot.yaml
      const configPath = path.join(process.cwd(), "mcpilot.yaml");

      if (fs.existsSync(configPath)) {
        console.error("mcpilot.yaml already exists in this directory.");
        process.exit(1);
      }

      fs.writeFileSync(configPath, generateConfigYaml(), "utf-8");
      console.log(`Created mcpilot.yaml`);

      // Generate client config if requested
      if (options.client === "claude-code") {
        const clientConfig = generateClaudeCodeConfig();
        console.log(`\nAdd this to your Claude Code settings:\n`);
        console.log(clientConfig);
      } else {
        console.log(`\nTo use with Claude Code, run: mcpilot init --client claude-code`);
      }
    });
}

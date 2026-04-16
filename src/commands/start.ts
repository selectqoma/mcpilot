import { Command } from "commander";
import { loadConfigAsync, findConfig } from "../config.js";
import { startProxy } from "../proxy.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROFILES_DIR = path.join(os.homedir(), ".mcpilot", "profiles");

export function startCommand(): Command {
  return new Command("start")
    .description("Start the MCP proxy (spawns all servers, exposes unified endpoint)")
    .option("--config <path>", "Path to mcpilot.yaml")
    .option("--profile <name>", "Use a named profile from ~/.mcpilot/profiles/")
    .action(async (options: { config?: string; profile?: string }) => {
      try {
        const configPath = resolveConfigPath(options.config, options.profile);
        const config = await loadConfigAsync(configPath);
        await startProxy(config);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : err}`
        );
        process.exit(1);
      }
    });
}

function resolveConfigPath(configFlag?: string, profileFlag?: string): string | undefined {
  if (configFlag) return configFlag;

  // Check current directory
  const local = path.join(process.cwd(), "mcpilot.yaml");
  if (fs.existsSync(local)) return local;

  // Check named profile
  if (profileFlag) {
    const profile = path.join(PROFILES_DIR, `${profileFlag}.yaml`);
    if (fs.existsSync(profile)) return profile;
    throw new Error(`Profile "${profileFlag}" not found at ${profile}`);
  }

  // Check default profile
  const defaultProfile = path.join(PROFILES_DIR, "default.yaml");
  if (fs.existsSync(defaultProfile)) return defaultProfile;

  // Fall back to findConfig (searches up to home)
  const found = findConfig();
  return found ?? undefined;
}

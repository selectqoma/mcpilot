import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Command } from "commander";
import yaml from "js-yaml";
import { generateConfigYaml } from "../config.js";

const PROFILES_DIR = path.join(os.homedir(), ".mcpilot", "profiles");

export function profileCommand(): Command {
  return new Command("profile")
    .description("Manage configuration profiles")
    .addCommand(
      new Command("list")
        .description("List all profiles")
        .action(() => {
          if (!fs.existsSync(PROFILES_DIR)) {
            console.log("No profiles found.");
            return;
          }

          const files = fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".yaml"));
          if (files.length === 0) {
            console.log("No profiles found.");
            return;
          }

          for (const file of files) {
            const name = file.replace(".yaml", "");
            const fullPath = path.join(PROFILES_DIR, file);
            const raw = fs.readFileSync(fullPath, "utf-8");
            const config = yaml.load(raw) as { servers?: Record<string, unknown> };
            const serverCount = config.servers ? Object.keys(config.servers).length : 0;
            const marker = name === "default" ? " (default)" : "";
            console.log(`  ${name}${marker} — ${serverCount} servers`);
          }
        })
    )
    .addCommand(
      new Command("create")
        .description("Create a new profile")
        .argument("<name>", "Profile name")
        .action((name: string) => {
          if (!fs.existsSync(PROFILES_DIR)) {
            fs.mkdirSync(PROFILES_DIR, { recursive: true });
          }

          const filePath = path.join(PROFILES_DIR, `${name}.yaml`);
          if (fs.existsSync(filePath)) {
            console.error(`Profile "${name}" already exists.`);
            process.exit(1);
          }

          fs.writeFileSync(filePath, generateConfigYaml(), "utf-8");
          console.log(`Created profile "${name}" at ${filePath}`);
          console.log(`Run: mcpilot start --profile ${name}`);
        })
    );
}

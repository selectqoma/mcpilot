#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { logsCommand } from "./commands/logs.js";
import { doctorCommand } from "./commands/doctor.js";
import { addCommand } from "./commands/add.js";
import { vaultCommand } from "./commands/vault.js";
import { profileCommand } from "./commands/profile.js";
import { dashboardCommand } from "./commands/dashboard.js";

const program = new Command();

program
  .name("mcpilot")
  .description("Local MCP proxy — one config, one connection, all your tools")
  .version("0.3.0");

program.addCommand(initCommand());
program.addCommand(startCommand());
program.addCommand(statusCommand());
program.addCommand(logsCommand());
program.addCommand(doctorCommand());
program.addCommand(addCommand());
program.addCommand(vaultCommand());
program.addCommand(profileCommand());
program.addCommand(dashboardCommand());

program.parse();

#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";

const program = new Command();

program
  .name("mcpilot")
  .description("Local MCP proxy — one config, one connection, all your tools")
  .version("0.1.0");

program.addCommand(initCommand());
program.addCommand(startCommand());

program.parse();

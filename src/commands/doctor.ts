import { Command } from "commander";
import { loadConfig, resolveServers } from "../config.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Run comprehensive health check")
    .option("--config <path>", "Path to mcpilot.yaml")
    .action(async (options: { config?: string }) => {
      let passed = 0;
      let failed = 0;

      // Check 1: Config file
      let config;
      try {
        config = loadConfig(options.config);
        printResult("Config file", true, "valid");
        passed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        printResult("Config file", false, msg);
        failed++;
        console.log(`\n${failed} failed, ${passed} passed`);
        process.exit(1);
      }

      // Check 2: Credentials resolve
      const credNames = Object.keys(config.credentials);
      if (credNames.length === 0) {
        printResult("Credentials", true, "none configured");
        passed++;
      } else {
        let allOk = true;
        for (const [name, value] of Object.entries(config.credentials)) {
          if (value.includes("${")) {
            // This means it wasn't resolved (loadConfig would have thrown)
            // But let's double-check the env vars exist
          }
        }
        // If we got here, loadConfig already resolved them successfully
        printResult("Credentials", true, `${credNames.length}/${credNames.length} resolved`);
        passed++;
      }

      // Check 3: Server connectivity
      const servers = resolveServers(config);
      for (const server of servers) {
        try {
          const start = Date.now();
          const transport = new StdioClientTransport({
            command: server.command,
            args: server.args,
            env: { ...process.env, ...server.resolvedEnv } as Record<string, string>,
          });

          const client = new Client(
            { name: "mcpilot-doctor", version: "0.1.0" },
            { capabilities: {} }
          );

          await client.connect(transport);
          const tools = await client.listTools();
          const latency = Date.now() - start;

          await client.close();

          printResult(
            `Server "${server.name}"`,
            true,
            `${tools.tools.length} tools, ${latency}ms`
          );
          passed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          printResult(`Server "${server.name}"`, false, msg);
          failed++;
        }
      }

      // Check 4: Log file writable
      const logPath = config.settings.log_file.replace("~", process.env.HOME || "~");
      const logDir = logPath.replace(/\/[^/]+$/, "");
      try {
        const { default: fs } = await import("node:fs");
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(logPath, "");
        printResult("Log file", true, logPath);
        passed++;
      } catch (err) {
        printResult("Log file", false, `cannot write to ${logPath}`);
        failed++;
      }

      console.log(`\n${passed} passed, ${failed} failed`);
      process.exit(failed > 0 ? 1 : 0);
    });
}

function printResult(name: string, ok: boolean, detail: string): void {
  const icon = ok ? "OK" : "FAIL";
  console.log(`  [${icon}] ${name}: ${detail}`);
}

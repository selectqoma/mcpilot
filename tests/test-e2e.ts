import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = "/tmp/mcpilot-test/mcpilot.yaml";
const TEST_DIR = "/tmp/mcpilot-test";

async function main() {
  // Ensure test dir and config exist
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  const realTestDir = fs.realpathSync(TEST_DIR);

  fs.writeFileSync(
    CONFIG_PATH,
    `settings:
  log_file: ${realTestDir}/logs.jsonl
  max_tools: 40
  health_check_interval: 30

credentials: {}

servers:
  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "${realTestDir}"]
    tools:
      include: ["*"]

namespacing:
  prefix: server
  separator: "_"
`
  );

  // Create a test file for the filesystem server to find
  fs.writeFileSync(`${realTestDir}/hello.txt`, "hello from mcpilot!");

  console.log("Connecting to MCPilot...");

  const transport = new StdioClientTransport({
    command: "node",
    args: [
      path.join(PROJECT_ROOT, "dist/index.js"),
      "start",
      "--config",
      CONFIG_PATH,
    ],
  });

  const client = new Client(
    { name: "mcpilot-test", version: "0.1.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected!");

  // Test 1: List tools
  console.log("\n--- Test: tools/list ---");
  const toolsResponse = await client.listTools();
  console.log(`Found ${toolsResponse.tools.length} tools:`);
  for (const tool of toolsResponse.tools) {
    console.log(`  - ${tool.name}`);
  }

  // Verify namespacing
  const namespaced = toolsResponse.tools.every((t) =>
    t.name.startsWith("filesystem_")
  );
  console.log(`All tools namespaced: ${namespaced}`);

  // Test 2: Call a tool
  console.log("\n--- Test: tools/call (read_file) ---");
  const readTool = toolsResponse.tools.find((t) =>
    t.name.includes("read_file")
  );
  if (readTool) {
    const result = await client.callTool({
      name: readTool.name,
      arguments: { path: `${realTestDir}/hello.txt` },
    });
    console.log("Result:", JSON.stringify(result).slice(0, 300));
  }

  // Test 3: Check logs
  console.log("\n--- Test: request logs ---");
  await new Promise((r) => setTimeout(r, 500));
  const logFile = `${realTestDir}/logs.jsonl`;
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, "utf-8").trim().split("\n");
    console.log(`${logs.length} log entries:`);
    for (const line of logs) {
      const entry = JSON.parse(line);
      console.log(
        `  [${entry.status}] ${entry.server}:${entry.tool} (${entry.duration_ms}ms)`
      );
    }
  } else {
    console.log("No log file found");
  }

  await client.close();
  console.log("\nAll tests passed!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

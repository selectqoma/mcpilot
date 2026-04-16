import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { McpilotConfig } from "./types.js";
import { ServerRegistry } from "./registry.js";
import { RequestLogger } from "./logger.js";
import { applyFilter, parseNamespacedTool, NamespacedTool } from "./filter.js";

export async function startProxy(config: McpilotConfig): Promise<void> {
  const registry = new ServerRegistry();
  const logger = new RequestLogger(config.settings.log_file);

  // Resolve and start all backend servers
  const { resolveServers } = await import("./config.js");
  const servers = resolveServers(config);
  await registry.startAll(servers);

  // Create the MCP server that clients connect to
  const server = new Server(
    { name: "mcpilot", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // Handle tools/list — aggregate from all backends with namespacing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allTools = await registry.listTools();
    const namespaced: NamespacedTool[] = [];

    for (const [serverName, tools] of allTools) {
      const filtered = applyFilter(tools, serverName, config);
      namespaced.push(...filtered);
    }

    return {
      tools: namespaced.map((t) => ({
        name: t.namespacedName,
        description: t.description
          ? `[${t.serverName}] ${t.description}`
          : undefined,
        inputSchema: t.inputSchema as {
          type: "object";
          properties?: Record<string, unknown>;
        },
      })),
    };
  });

  // Handle tools/call — parse namespace, route to correct backend
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const sep = config.namespacing.separator;
    const parsed = parseNamespacedTool(name, sep);

    if (!parsed) {
      throw new Error(
        `Invalid tool name: ${name}. Expected format: server${sep}tool`
      );
    }

    if (!registry.hasServer(parsed.serverName)) {
      throw new Error(`Server not found: ${parsed.serverName}`);
    }

    return logger.wrapCall<CallToolResult>(
      parsed.serverName,
      parsed.originalName,
      () =>
        registry.callTool(
          parsed.serverName,
          parsed.originalName,
          args || {}
        ) as Promise<CallToolResult>
    );
  });

  // Connect to stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[mcpilot] Proxy running with ${servers.length} server(s)`);

  // Graceful shutdown
  const cleanup = async () => {
    console.error("[mcpilot] Shutting down...");
    await registry.stopAll();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

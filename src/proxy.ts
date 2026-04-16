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
import { HealthMonitor } from "./health.js";
import { UsageTracker } from "./usage-tracker.js";
import { applyFilter, parseNamespacedTool, NamespacedTool } from "./filter.js";
import { writeState, clearState } from "./state.js";

export async function startProxy(config: McpilotConfig): Promise<void> {
  const registry = new ServerRegistry();
  const logger = new RequestLogger(config.settings.log_file);
  const usageTracker = new UsageTracker();
  usageTracker.seedFromLog(config.settings.log_file);

  // Resolve and start all backend servers
  const { resolveServers } = await import("./config.js");
  const servers = resolveServers(config);
  await registry.startAll(servers);

  // Write initial state
  writeState(registry);

  // Start health monitoring
  const healthMonitor = new HealthMonitor(registry, config, logger, () => {
    const allStatus = healthMonitor.getAllStatus();
    const healthMap = new Map<string, { healthy: boolean; tool_count?: number; error?: string }>();
    for (const [name, status] of allStatus) {
      healthMap.set(name, {
        healthy: status.healthy,
        tool_count: status.tool_count,
        error: status.error,
      });
    }
    writeState(registry, healthMap);
  });
  healthMonitor.start();

  // Create the MCP server that clients connect to
  const server = new Server(
    { name: "mcpilot", version: "0.2.0" },
    { capabilities: { tools: {} } }
  );

  // Handle tools/list — aggregate from all backends with namespacing + capping
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allTools = await registry.listTools();
    const namespaced: NamespacedTool[] = [];

    for (const [serverName, tools] of allTools) {
      const filtered = applyFilter(tools, serverName, config);
      namespaced.push(...filtered);
    }

    // Cap at max_tools — drop least-recently-used
    let result = namespaced;
    if (result.length > config.settings.max_tools) {
      const excess = result.length - config.settings.max_tools;
      const toDrop = new Set(
        usageTracker.getLeastRecentlyUsed(
          result.map((t) => t.namespacedName),
          excess
        )
      );
      result = result.filter((t) => !toDrop.has(t.namespacedName));
      console.error(
        `[mcpilot] Capped tools: ${namespaced.length} → ${result.length} (max: ${config.settings.max_tools})`
      );
    }

    return {
      tools: result.map((t) => ({
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

    // Track usage
    usageTracker.record(name);

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
    healthMonitor.stop();
    clearState();
    await registry.stopAll();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

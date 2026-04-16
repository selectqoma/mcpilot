import { McpilotConfig } from "./types.js";

export interface NamespacedTool {
  originalName: string;
  namespacedName: string;
  serverName: string;
  description?: string;
  inputSchema?: unknown;
}

export function applyFilter(
  tools: { name: string; description?: string; inputSchema?: unknown }[],
  serverName: string,
  config: McpilotConfig
): NamespacedTool[] {
  const serverConfig = config.servers[serverName];
  const toolFilter = serverConfig?.tools;
  const sep = config.namespacing.separator;

  const filtered = tools.filter((tool) => {
    if (!toolFilter) return true;

    const includes = toolFilter.include || ["*"];
    const excludes = toolFilter.exclude || [];

    // Check includes
    const included = includes.some((pattern) =>
      pattern === "*" ? true : matchPattern(tool.name, pattern)
    );

    // Check excludes
    const excluded = excludes.some((pattern) =>
      matchPattern(tool.name, pattern)
    );

    return included && !excluded;
  });

  return filtered.map((tool) => ({
    originalName: tool.name,
    namespacedName: `${serverName}${sep}${tool.name}`,
    serverName,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

function matchPattern(name: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$"
  );
  return regex.test(name);
}

// Parse a namespaced tool name back into server + original name
export function parseNamespacedTool(
  namespacedName: string,
  separator: string
): { serverName: string; originalName: string } | null {
  const idx = namespacedName.indexOf(separator);
  if (idx === -1) return null;

  return {
    serverName: namespacedName.slice(0, idx),
    originalName: namespacedName.slice(idx + separator.length),
  };
}

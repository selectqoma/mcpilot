export interface McpilotConfig {
  settings: {
    log_file: string;
    max_tools: number;
    health_check_interval: number;
  };
  credentials: Record<string, string>;
  servers: Record<string, ServerConfig>;
  namespacing: {
    prefix: string;
    separator: string;
  };
}

export interface ServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  tools?: {
    include: string[];
    exclude?: string[];
  };
}

export interface ResolvedServer extends ServerConfig {
  name: string;
  resolvedEnv: Record<string, string>;
}

export interface ToolCallLog {
  ts: string;
  server: string;
  tool: string;
  duration_ms: number;
  status: "success" | "error";
  error?: string;
}

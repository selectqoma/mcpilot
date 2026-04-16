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

export interface ServerState {
  status: "healthy" | "unhealthy" | "stopped" | "starting";
  tool_count: number;
  last_check: string;
  restarts: number;
  error?: string;
}

export interface ProxyState {
  pid: number;
  started_at: string;
  servers: Record<string, ServerState>;
}

export interface HealthStatus {
  healthy: boolean;
  latency_ms: number;
  error?: string;
  tool_count?: number;
}

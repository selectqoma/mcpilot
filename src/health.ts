import { ServerRegistry } from "./registry.js";
import { McpilotConfig, HealthStatus } from "./types.js";
import { RequestLogger } from "./logger.js";

const MAX_FAILURES = 3;

export class HealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private healthStatus: Map<string, HealthStatus> = new Map();
  private failureCounts: Map<string, number> = new Map();

  constructor(
    private registry: ServerRegistry,
    private config: McpilotConfig,
    private logger: RequestLogger,
    private onHealthUpdate: () => void
  ) {}

  start(): void {
    const interval = this.config.settings.health_check_interval * 1000;
    this.intervalId = setInterval(() => this.checkAll(), interval);
    console.error(
      `[mcpilot] Health monitoring started (every ${this.config.settings.health_check_interval}s)`
    );
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getStatus(name: string): HealthStatus | undefined {
    return this.healthStatus.get(name);
  }

  getAllStatus(): Map<string, HealthStatus> {
    return new Map(this.healthStatus);
  }

  private async checkAll(): Promise<void> {
    for (const name of this.registry.getServerNames()) {
      await this.checkServer(name);
    }
    this.onHealthUpdate();
  }

  async checkServer(name: string): Promise<HealthStatus> {
    const client = this.registry.getClient(name);
    if (!client) {
      const status: HealthStatus = { healthy: false, latency_ms: 0, error: "no client" };
      this.healthStatus.set(name, status);
      return status;
    }

    const start = Date.now();
    try {
      // Try ping first, fallback to tools/list
      try {
        await client.ping();
      } catch {
        const tools = await client.listTools();
        const managed = this.registry.getManagedServer(name);
        const toolCount = managed ? managed.consecutiveFailures : 0; // just checking it works
      }

      const latency = Date.now() - start;
      const status: HealthStatus = { healthy: true, latency_ms: latency };

      // Get tool count
      try {
        const tools = await client.listTools();
        status.tool_count = tools.tools.length;
      } catch {
        // Non-critical
      }

      this.failureCounts.set(name, 0);
      this.healthStatus.set(name, status);
      return status;
    } catch (err) {
      const latency = Date.now() - start;
      const failures = (this.failureCounts.get(name) ?? 0) + 1;
      this.failureCounts.set(name, failures);

      const errorMsg = err instanceof Error ? err.message : String(err);
      const status: HealthStatus = {
        healthy: false,
        latency_ms: latency,
        error: errorMsg,
      };
      this.healthStatus.set(name, status);

      // Auto-restart after MAX_FAILURES consecutive failures
      if (failures >= MAX_FAILURES) {
        console.error(
          `[mcpilot] Server ${name} failed ${failures} times, restarting...`
        );
        try {
          await this.registry.restart(name);
          this.failureCounts.set(name, 0);
        } catch (restartErr) {
          console.error(`[mcpilot] Failed to restart ${name}: ${restartErr}`);
        }
      }

      return status;
    }
  }
}

import { ChildProcess, spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ResolvedServer } from "./types.js";

interface ManagedServer {
  name: string;
  process: ChildProcess;
  client: Client;
}

export class ServerRegistry {
  private servers: Map<string, ManagedServer> = new Map();

  async startAll(resolvedServers: ResolvedServer[]): Promise<void> {
    const errors: string[] = [];

    for (const server of resolvedServers) {
      try {
        await this.start(server);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${server.name}: ${msg}`);
      }
    }

    if (errors.length > 0) {
      console.error(`Failed to start ${errors.length} server(s):`);
      errors.forEach((e) => console.error(`  - ${e}`));
    }
  }

  private async start(server: ResolvedServer): Promise<void> {
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: { ...process.env, ...server.resolvedEnv } as Record<string, string>,
    });

    const client = new Client(
      { name: `mcpilot-${server.name}`, version: "0.1.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    // Get the child process from the transport for cleanup
    const childProcess = (transport as unknown as { _process?: ChildProcess })
      ._process ?? ({} as ChildProcess);

    this.servers.set(server.name, {
      name: server.name,
      process: childProcess,
      client,
    });

    console.error(`[mcpilot] Started server: ${server.name}`);
  }

  getClient(name: string): Client | undefined {
    return this.servers.get(name)?.client;
  }

  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }

  hasServer(name: string): boolean {
    return this.servers.has(name);
  }

  async listTools(): Promise<
    Map<string, { name: string; description?: string; inputSchema?: unknown }[]>
  > {
    const result = new Map<
      string,
      { name: string; description?: string; inputSchema?: unknown }[]
    >();

    for (const [serverName, managed] of this.servers) {
      try {
        const response = await managed.client.listTools();
        result.set(
          serverName,
          response.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }))
        );
      } catch (err) {
        console.error(
          `[mcpilot] Failed to list tools from ${serverName}: ${err}`
        );
      }
    }

    return result;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const managed = this.servers.get(serverName);
    if (!managed) {
      throw new Error(`Server not found: ${serverName}`);
    }

    const response = await managed.client.callTool({ name: toolName, arguments: args });
    return response;
  }

  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [name, managed] of this.servers) {
      promises.push(
        (async () => {
          try {
            await managed.client.close();
          } catch {
            // Ignore close errors
          }
          try {
            managed.process.kill();
          } catch {
            // Ignore kill errors
          }
          console.error(`[mcpilot] Stopped server: ${name}`);
        })()
      );
    }

    await Promise.all(promises);
    this.servers.clear();
  }
}

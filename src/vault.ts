import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execFileAsync = promisify(execFile);

const SERVICE_NAME = "mcpilot";

type Platform = "darwin" | "linux" | "win32";

function getPlatform(): Platform {
  return os.platform() as Platform;
}

export class Vault {
  private platform: Platform;

  constructor() {
    this.platform = getPlatform();
  }

  async set(key: string, value: string): Promise<void> {
    switch (this.platform) {
      case "darwin":
        return this.setMacOS(key, value);
      case "linux":
        return this.setLinux(key, value);
      case "win32":
        return this.setWindows(key, value);
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  async get(key: string): Promise<string | null> {
    switch (this.platform) {
      case "darwin":
        return this.getMacOS(key);
      case "linux":
        return this.getLinux(key);
      case "win32":
        return this.getWindows(key);
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  async delete(key: string): Promise<void> {
    switch (this.platform) {
      case "darwin":
        return this.deleteMacOS(key);
      case "linux":
        return this.deleteLinux(key);
      case "win32":
        return this.deleteWindows(key);
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  async list(): Promise<string[]> {
    switch (this.platform) {
      case "darwin":
        return this.listMacOS();
      case "linux":
        return this.listLinux();
      case "win32":
        return this.listWindows();
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  // --- macOS Keychain ---

  private async setMacOS(key: string, value: string): Promise<void> {
    // Delete first to avoid duplicates
    try { await this.deleteMacOS(key); } catch { /* ok if not exists */ }

    await execFileAsync("security", [
      "add-generic-password",
      "-a", process.env.USER || "mcpilot",
      "-s", `${SERVICE_NAME}/${key}`,
      "-w", value,
    ], { timeout: 5000 });
  }

  private async getMacOS(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-a", process.env.USER || "mcpilot",
        "-s", `${SERVICE_NAME}/${key}`,
        "-w",
      ], { timeout: 5000 });
      return stdout.trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("could not be found") || msg.includes("item not found")) {
        return null;
      }
      throw new Error(`Keychain access failed: ${msg}`);
    }
  }

  private async deleteMacOS(key: string): Promise<void> {
    try {
      await execFileAsync("security", [
        "delete-generic-password",
        "-a", process.env.USER || "mcpilot",
        "-s", `${SERVICE_NAME}/${key}`,
      ], { timeout: 5000 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("could not be found") || msg.includes("item not found")) {
        return; // Already gone
      }
      throw new Error(`Keychain delete failed: ${msg}`);
    }
  }

  private async listMacOS(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync("security", [
        "dump-keychain",
      ], { timeout: 5000 });

      const keys: string[] = [];
      const prefix = `${SERVICE_NAME}/`;
      for (const line of stdout.split("\n")) {
        const match = line.match(/"svce"<blob>="([^"]+)"/);
        if (match && match[1].startsWith(prefix)) {
          keys.push(match[1].slice(prefix.length));
        }
      }
      return keys;
    } catch {
      return [];
    }
  }

  // --- Linux libsecret ---

  private async setLinux(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("secret-tool", [
        "store",
        "--label", `${SERVICE_NAME}/${key}`,
        "service", SERVICE_NAME,
        "key", key,
      ], { stdio: ["pipe", "pipe", "pipe"] });

      child.stdin.write(value + "\n");
      child.stdin.end();

      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`secret-tool store exited with code ${code}`));
      });

      child.on("error", reject);
    });
  }

  private async getLinux(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("secret-tool", [
        "lookup",
        "service", SERVICE_NAME,
        "key", key,
      ], { timeout: 5000 });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async deleteLinux(key: string): Promise<void> {
    try {
      await execFileAsync("secret-tool", [
        "clear",
        "service", SERVICE_NAME,
        "key", key,
      ], { timeout: 5000 });
    } catch {
      // Not found is fine
    }
  }

  private async listLinux(): Promise<string[]> {
    // secret-tool doesn't have a list command, search instead
    try {
      const { stdout } = await execFileAsync("secret-tool", [
        "search",
        "--all",
        "service", SERVICE_NAME,
      ], { timeout: 5000 });

      const keys: string[] = [];
      for (const line of stdout.split("\n")) {
        const match = line.match(/^key\s*=\s*(.+)$/);
        if (match) {
          keys.push(match[1].trim());
        }
      }
      return [...new Set(keys)];
    } catch {
      return [];
    }
  }

  // --- Windows Credential Manager ---

  private async setWindows(key: string, value: string): Promise<void> {
    const target = `${SERVICE_NAME}/${key}`;
    // Use cmdkey to store (stores as generic credential)
    await execFileAsync("cmdkey", [
      "/generic:" + target,
      "/user:mcpilot",
      "/pass:" + value,
    ], { timeout: 5000, shell: true });
  }

  private async getWindows(key: string): Promise<string | null> {
    const target = `${SERVICE_NAME}/${key}`;
    try {
      const { stdout } = await execFileAsync("cmdkey", [
        `/list:${target}`,
      ], { timeout: 5000, shell: true });

      // cmdkey /list shows if credential exists but doesn't show the password
      // Need PowerShell for that
      const { stdout: pw } = await execFileAsync("powershell", [
        "-Command",
        `$c = Get-StoredCredential -Target '${target}'; if ($c) { $c.GetNetworkCredential().Password }`,
      ], { timeout: 5000, shell: true });

      return pw.trim() || null;
    } catch {
      return null;
    }
  }

  private async deleteWindows(key: string): Promise<void> {
    const target = `${SERVICE_NAME}/${key}`;
    try {
      await execFileAsync("cmdkey", [
        `/delete:${target}`,
      ], { timeout: 5000, shell: true });
    } catch {
      // Already gone
    }
  }

  private async listWindows(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync("cmdkey", [
        "/list",
      ], { timeout: 5000, shell: true });

      const keys: string[] = [];
      const prefix = `${SERVICE_NAME}/`;
      for (const line of stdout.split("\n")) {
        const match = line.match(/Target:\s+(.+)/);
        if (match && match[1].trim().startsWith(prefix)) {
          keys.push(match[1].trim().slice(prefix.length));
        }
      }
      return keys;
    } catch {
      return [];
    }
  }
}

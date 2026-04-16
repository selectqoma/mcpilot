import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolCallLog } from "./types.js";

export class RequestLogger {
  private logPath: string;

  constructor(logFilePath: string) {
    this.logPath = logFilePath.replace("~", os.homedir());
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  log(entry: ToolCallLog): void {
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(this.logPath, line, "utf-8");
  }

  wrapCall<T>(
    serverName: string,
    toolName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();

    return fn()
      .then((result) => {
        this.log({
          ts: new Date().toISOString(),
          server: serverName,
          tool: toolName,
          duration_ms: Date.now() - start,
          status: "success",
        });
        return result;
      })
      .catch((err) => {
        this.log({
          ts: new Date().toISOString(),
          server: serverName,
          tool: toolName,
          duration_ms: Date.now() - start,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      });
  }
}

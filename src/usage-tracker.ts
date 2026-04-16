import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class UsageTracker {
  private lastUsed: Map<string, number> = new Map();

  record(namespacedToolName: string): void {
    this.lastUsed.set(namespacedToolName, Date.now());
  }

  getLastUsed(namespacedToolName: string): number {
    return this.lastUsed.get(namespacedToolName) ?? 0;
  }

  /** Return the N least-recently-used tool names from the given list */
  getLeastRecentlyUsed(toolNames: string[], count: number): string[] {
    const sorted = [...toolNames].sort((a, b) => {
      const aTime = this.lastUsed.get(a) ?? 0;
      const bTime = this.lastUsed.get(b) ?? 0;
      return aTime - bTime; // least recently used first
    });

    return sorted.slice(0, count);
  }

  /** Seed from existing JSONL log file to have initial usage data */
  seedFromLog(logPath: string): void {
    const resolved = logPath.replace("~", os.homedir());
    if (!fs.existsSync(resolved)) return;

    try {
      const content = fs.readFileSync(resolved, "utf-8").trim();
      if (!content) return;

      const lines = content.split("\n").slice(-1000); // last 1000 entries
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.server && entry.tool) {
            const key = `${entry.server}_${entry.tool}`;
            const ts = new Date(entry.ts).getTime();
            const current = this.lastUsed.get(key) ?? 0;
            if (ts > current) {
              this.lastUsed.set(key, ts);
            }
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Ignore read errors
    }
  }
}

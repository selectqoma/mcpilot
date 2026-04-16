import readline from "node:readline";
import { Command } from "commander";
import { Vault } from "../vault.js";

export function vaultCommand(): Command {
  return new Command("vault")
    .description("Manage secrets in OS keychain")
    .addCommand(
      new Command("set")
        .description("Store a secret in the keychain")
        .argument("<key>", "Secret name (e.g., GITHUB_TOKEN)")
        .action(async (key: string) => {
          const vault = new Vault();
          const value = await promptSecret(`Enter value for ${key}: `);
          if (!value) {
            console.error("No value provided.");
            process.exit(1);
          }
          await vault.set(key, value);
          console.log(`Stored ${key} in keychain.`);
        })
    )
    .addCommand(
      new Command("get")
        .description("Check if a secret exists (never prints the value)")
        .argument("<key>", "Secret name")
        .action(async (key: string) => {
          const vault = new Vault();
          const value = await vault.get(key);
          if (value !== null) {
            console.log(`${key}: exists (${value.length} chars)`);
          } else {
            console.log(`${key}: not found`);
          }
        })
    )
    .addCommand(
      new Command("list")
        .description("List all stored secret names")
        .action(async () => {
          const vault = new Vault();
          const keys = await vault.list();
          if (keys.length === 0) {
            console.log("No secrets stored.");
            return;
          }
          for (const key of keys) {
            console.log(`  ${key}`);
          }
        })
    )
    .addCommand(
      new Command("delete")
        .description("Remove a secret from the keychain")
        .argument("<key>", "Secret name")
        .action(async (key: string) => {
          const vault = new Vault();
          await vault.delete(key);
          console.log(`Deleted ${key}.`);
        })
    );
}

function promptSecret(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Hide input
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    process.stdout.write(prompt);

    let value = "";
    const onData = (ch: Buffer) => {
      const c = ch.toString();
      switch (c) {
        case "\n":
        case "\r":
        case "\u0004": // Ctrl+D
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          stdin.removeListener("data", onData);
          rl.close();
          process.stdout.write("\n");
          resolve(value);
          break;
        case "\u0003": // Ctrl+C
          process.exit(1);
          break;
        case "\u007F": // Backspace
          value = value.slice(0, -1);
          break;
        default:
          value += c;
          break;
      }
    };

    stdin.on("data", onData);
  });
}

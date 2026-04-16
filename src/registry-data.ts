export interface RegistryEntry {
  command: string;
  args: string[];
  description: string;
  env?: Record<string, string>;
}

export const CURATED_SERVERS: Record<string, RegistryEntry> = {
  github: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    description: "GitHub API — issues, PRs, repos",
    env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
  },
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    description: "Local filesystem access",
  },
  postgres: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    description: "PostgreSQL database",
    env: { POSTGRES_CONNECTION_STRING: "${DATABASE_URL}" },
  },
  fetch: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    description: "HTTP fetch — web requests",
  },
  sqlite: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite"],
    description: "SQLite database",
  },
  brave_search: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    description: "Brave web search",
    env: { BRAVE_API_KEY: "${BRAVE_API_KEY}" },
  },
  memory: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    description: "Persistent key-value memory",
  },
  puppeteer: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    description: "Browser automation via Puppeteer",
  },
  sequential_thinking: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    description: "Structured step-by-step thinking",
  },
  slack: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    description: "Slack messaging API",
    env: {
      SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}",
      SLACK_TEAM_ID: "${SLACK_TEAM_ID}",
    },
  },
};

#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRuCalendarMcpServer } from "./server.js";

async function main(): Promise<void> {
  const server = createRuCalendarMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ru-calendar-mcp failed: ${message}`);
  process.exit(1);
});

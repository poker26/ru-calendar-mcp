import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRuCalendarMcpServer } from "./server.js";

const defaultPort = 8765;

async function main(): Promise<void> {
  const configuredPort = process.env.PORT?.trim();
  const port = configuredPort ? Number(configuredPort) : defaultPort;
  const apiKey = process.env.RU_CALENDAR_MCP_API_KEY?.trim();

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "ru-calendar-mcp" });
  });

  app.all("/mcp", async (request, response) => {
    if (apiKey) {
      const providedKey = request.header("x-api-key") ?? request.header("authorization")?.replace(/^Bearer\s+/i, "");
      if (providedKey !== apiKey) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const server = createRuCalendarMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  });

  app.listen(port, () => {
    console.log(`ru-calendar-mcp HTTP listening on :${port}/mcp`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ru-calendar-mcp http failed: ${message}`);
  process.exit(1);
});

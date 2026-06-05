module.exports = {
  apps: [
    {
      name: "ru-calendar-mcp",
      script: "dist/http.js",
      cwd: "/root/ru-calendar-mcp",
      env: {
        PORT: "8765",
        RU_CALENDAR_MCP_API_KEY: "CHANGE_ME",
        RU_CALENDAR_TIMEZONE: "Europe/Moscow",
      },
    },
  ],
};

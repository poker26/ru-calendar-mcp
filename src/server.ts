import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildCalendarContext,
  resolvePhrase,
  resolvePhrasesInText,
  resolveWeekRange,
} from "./calendar/phrase-resolver.js";
import { formatIsoDate, resolveTimezone } from "./calendar/date-math.js";
import { productionCalendarStore } from "./production-calendar/store.js";

function asJsonText(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function createRuCalendarMcpServer(): McpServer {
  const server = new McpServer({
    name: "ru-calendar",
    version: "1.0.0",
  });

  server.tool(
    "resolve_phrase",
    "Resolve a Russian relative date phrase to exact ISO dates. Examples: «завтра», «в понедельник», «на этой неделе», «через 3 рабочих дня».",
    {
      phrase: z.string().describe("Russian phrase, e.g. «в понедельник», «на этой неделе»"),
      timezone: z.string().optional().describe("IANA timezone, default Europe/Moscow"),
      reference_iso: z.string().optional().describe("Reference date YYYY-MM-DD, default today in timezone"),
    },
    async ({ phrase, timezone, reference_iso: referenceIso }) => {
      const resolvedTimezone = resolveTimezone(timezone ?? process.env.RU_CALENDAR_TIMEZONE);
      const referenceDate = referenceIso
        ? new Date(`${referenceIso}T12:00:00Z`)
        : new Date();
      const payload = await resolvePhrase(phrase, {
        timezone: resolvedTimezone,
        referenceIso,
        referenceDate,
      });
      return asJsonText(payload);
    },
  );

  server.tool(
    "resolve_text",
    "Find and resolve all supported calendar phrases inside free-form Russian text.",
    {
      text: z.string(),
      timezone: z.string().optional(),
      reference_iso: z.string().optional(),
    },
    async ({ text, timezone, reference_iso: referenceIso }) => {
      const resolvedTimezone = resolveTimezone(timezone ?? process.env.RU_CALENDAR_TIMEZONE);
      const referenceDate = referenceIso
        ? new Date(`${referenceIso}T12:00:00Z`)
        : new Date();
      const payload = await resolvePhrasesInText(text, {
        timezone: resolvedTimezone,
        referenceIso,
        referenceDate,
      });
      return asJsonText(payload);
    },
  );

  server.tool(
    "is_workday",
    "Check whether a date is a working day according to the Russian production calendar (isDayOff data).",
    {
      iso_date: z.string().describe("Date YYYY-MM-DD"),
      timezone: z.string().optional(),
    },
    async ({ iso_date: isoDate, timezone }) => {
      const resolvedTimezone = resolveTimezone(timezone ?? process.env.RU_CALENDAR_TIMEZONE);
      const dayInfo = await productionCalendarStore.explainDay(isoDate, resolvedTimezone);
      return asJsonText(dayInfo);
    },
  );

  server.tool(
    "next_workday",
    "Return the Nth working day after the reference date.",
    {
      from_iso: z.string().optional().describe("Start date YYYY-MM-DD, default today"),
      count: z.number().int().min(1).optional().describe("How many workdays ahead, default 1"),
      timezone: z.string().optional(),
    },
    async ({ from_iso: fromIso, count, timezone }) => {
      const resolvedTimezone = resolveTimezone(timezone ?? process.env.RU_CALENDAR_TIMEZONE);
      const startIso = fromIso ?? formatIsoDate(new Date(), resolvedTimezone);
      const workdayCount = count ?? 1;
      const isoDate = await productionCalendarStore.nextWorkday(startIso, resolvedTimezone, workdayCount);
      const dayInfo = await productionCalendarStore.explainDay(isoDate, resolvedTimezone);
      return asJsonText({
        fromIso: startIso,
        count: workdayCount,
        isoDate,
        dayInfo,
      });
    },
  );

  server.tool(
    "workdays_in_range",
    "List all working days in an inclusive ISO date range.",
    {
      date_from: z.string(),
      date_to: z.string(),
      timezone: z.string().optional(),
    },
    async ({ date_from: dateFrom, date_to: dateTo, timezone }) => {
      const resolvedTimezone = resolveTimezone(timezone ?? process.env.RU_CALENDAR_TIMEZONE);
      const dates = await productionCalendarStore.workdaysInRange(dateFrom, dateTo, resolvedTimezone);
      return asJsonText({ dateFrom, dateTo, dates, count: dates.length });
    },
  );

  server.tool(
    "week_range",
    "Return this/next/previous ISO week (Mon–Sun) with optional workdays-only filter.",
    {
      kind: z.enum(["this", "next", "previous"]),
      workdays_only: z.boolean().optional(),
      timezone: z.string().optional(),
      reference_iso: z.string().optional(),
    },
    async ({ kind, workdays_only: workdaysOnly, timezone, reference_iso: referenceIso }) => {
      const resolvedTimezone = resolveTimezone(timezone ?? process.env.RU_CALENDAR_TIMEZONE);
      const todayIso = referenceIso ?? formatIsoDate(new Date(), resolvedTimezone);
      const payload = await resolveWeekRange(kind, todayIso, resolvedTimezone, workdaysOnly ?? false);
      return asJsonText(payload);
    },
  );

  server.tool(
    "explain_day",
    "Explain a calendar day: weekday, workday/weekend/holiday/transfer/shortened.",
    {
      iso_date: z.string(),
      timezone: z.string().optional(),
    },
    async ({ iso_date: isoDate, timezone }) => {
      const resolvedTimezone = resolveTimezone(timezone ?? process.env.RU_CALENDAR_TIMEZONE);
      const payload = await productionCalendarStore.explainDay(isoDate, resolvedTimezone);
      return asJsonText(payload);
    },
  );

  server.tool(
    "get_calendar_context",
    "Build a deterministic calendar context block for agent prompts (now + rules + resolved phrases + 14-day table).",
    {
      user_text: z.string().optional().describe("User message to scan for phrases"),
      timezone: z.string().optional(),
      lookup_days: z.number().int().min(7).max(31).optional(),
    },
    async ({ user_text: userText, timezone, lookup_days: lookupDays }) => {
      const resolvedTimezone = resolveTimezone(timezone ?? process.env.RU_CALENDAR_TIMEZONE);
      const contextText = await buildCalendarContext(userText ?? "", {
        timezone: resolvedTimezone,
        lookupDays: lookupDays ?? 14,
      });
      return {
        content: [{ type: "text", text: contextText }],
      };
    },
  );

  return server;
}

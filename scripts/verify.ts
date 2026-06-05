import { resolveNextNamedWeekday, formatIsoDate } from "../src/calendar/date-math.js";
import { resolvePhrase } from "../src/calendar/phrase-resolver.js";

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function runChecks(): Promise<void> {
  const timezone = "Europe/Moscow";
  const thursdayReference = new Date("2026-06-04T12:00:00Z");
  const todayIso = formatIsoDate(thursdayReference, timezone);

  assertEqual(
    resolveNextNamedWeekday(1, todayIso, timezone),
    "2026-06-08",
    "Thursday -> next Monday",
  );

  const mondayMeeting = await resolvePhrase("в понедельник", {
    timezone,
    referenceIso: todayIso,
    referenceDate: thursdayReference,
  });
  assertEqual(mondayMeeting.dateFrom, "2026-06-08", "Phrase: в понедельник");
  if (mondayMeeting.dateFrom === "2026-06-09") {
    throw new Error("Monday must not resolve to 2026-06-09");
  }

  const tomorrowPhrase = await resolvePhrase("завтра", {
    timezone,
    referenceIso: todayIso,
    referenceDate: thursdayReference,
  });
  assertEqual(tomorrowPhrase.dateFrom, "2026-06-05", "Phrase: завтра");

  const thisWeekPhrase = await resolvePhrase("на этой неделе", {
    timezone,
    referenceIso: todayIso,
    referenceDate: thursdayReference,
  });
  if (!thisWeekPhrase.dates.includes("2026-06-04")) {
    throw new Error("This week must include today");
  }
  if (!thisWeekPhrase.dates.includes("2026-06-05")) {
    throw new Error("This week must include Friday 2026-06-05");
  }

  console.log("ru-calendar-mcp verify: OK");
}

runChecks().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

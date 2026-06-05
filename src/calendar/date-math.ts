export const DEFAULT_TIMEZONE = "Europe/Moscow";

export const ISO_WEEKDAY_COUNT = 7;

export const WEEKDAY_NAME_TO_ISO: Readonly<Record<string, number>> = {
  понедельник: 1,
  вторник: 2,
  среда: 3,
  среду: 3,
  четверг: 4,
  пятница: 5,
  пятницу: 5,
  суббота: 6,
  субботу: 6,
  воскресенье: 7,
  воскресенья: 7,
};

export const ISO_TO_WEEKDAY_NAME: Readonly<Record<number, string>> = {
  1: "понедельник",
  2: "вторник",
  3: "среда",
  4: "четверг",
  5: "пятница",
  6: "суббота",
  7: "воскресенье",
};

export function resolveTimezone(configuredTimezone?: string): string {
  const trimmedTimezone = configuredTimezone?.trim();
  return trimmedTimezone || DEFAULT_TIMEZONE;
}

export function formatIsoDate(referenceDate: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function formatWeekdayLabel(referenceDate: Date, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    weekday: "long",
  }).format(referenceDate);
}

export function formatHumanDate(referenceDate: Date, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(referenceDate);
}

export function formatClockTime(referenceDate: Date, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(referenceDate);
}

export function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, "е");
}

export function isoDateToReferenceDate(isoDate: string): Date {
  const [yearText, monthText, dayText] = isoDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function addCalendarDays(
  isoDate: string,
  daysToAdd: number,
  timezone: string,
): string {
  const referenceDate = isoDateToReferenceDate(isoDate);
  referenceDate.setUTCDate(referenceDate.getUTCDate() + daysToAdd);
  return formatIsoDate(referenceDate, timezone);
}

export function getWeekdayIso(isoDate: string, timezone: string): number {
  const weekdayLabel = normalizeText(formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone));
  const weekdayIso = WEEKDAY_NAME_TO_ISO[weekdayLabel];
  if (!weekdayIso) {
    throw new Error(`Unknown weekday label for ${isoDate}: ${weekdayLabel}`);
  }
  return weekdayIso;
}

export function resolveNextNamedWeekday(
  weekdayIso: number,
  todayIso: string,
  timezone: string,
): string {
  const todayWeekdayIso = getWeekdayIso(todayIso, timezone);
  let daysAhead = (weekdayIso - todayWeekdayIso + ISO_WEEKDAY_COUNT) % ISO_WEEKDAY_COUNT;
  if (daysAhead === 0) {
    daysAhead = ISO_WEEKDAY_COUNT;
  }
  return addCalendarDays(todayIso, daysAhead, timezone);
}

export function resolveThisNamedWeekday(
  weekdayIso: number,
  todayIso: string,
  timezone: string,
): string {
  const todayWeekdayIso = getWeekdayIso(todayIso, timezone);
  let daysAhead = (weekdayIso - todayWeekdayIso + ISO_WEEKDAY_COUNT) % ISO_WEEKDAY_COUNT;
  if (daysAhead === 0) {
    return todayIso;
  }
  return addCalendarDays(todayIso, daysAhead, timezone);
}

export function getTimezoneOffset(isoDate: string, timezone: string): string {
  const referenceDate = isoDateToReferenceDate(isoDate);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(referenceDate);
  const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetPart.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return "+00:00";
  }
  const sign = match[1].startsWith("-") ? "-" : "+";
  const hours = Math.abs(Number(match[1])).toString().padStart(2, "0");
  const minutes = (match[2] ?? "00").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

export function buildDayDateTimeRange(isoDate: string, timezone: string): {
  dateFrom: string;
  dateTo: string;
} {
  const offset = getTimezoneOffset(isoDate, timezone);
  return {
    dateFrom: `${isoDate}T00:00:00${offset}`,
    dateTo: `${isoDate}T23:59:59${offset}`,
  };
}

export function getIsoWeekBounds(
  isoDate: string,
  timezone: string,
): { mondayIso: string; sundayIso: string } {
  const weekdayIso = getWeekdayIso(isoDate, timezone);
  const mondayIso = addCalendarDays(isoDate, -(weekdayIso - 1), timezone);
  const sundayIso = addCalendarDays(mondayIso, 6, timezone);
  return { mondayIso, sundayIso };
}

export function enumerateIsoDatesInclusive(
  dateFromIso: string,
  dateToIso: string,
  timezone: string,
): string[] {
  const dates: string[] = [];
  let cursorIso = dateFromIso;
  while (cursorIso <= dateToIso) {
    dates.push(cursorIso);
    cursorIso = addCalendarDays(cursorIso, 1, timezone);
  }
  return dates;
}

export interface CalendarDayEntry {
  isoDate: string;
  weekdayLabel: string;
  weekdayIso: number;
  relativeLabel: string | null;
}

export function buildUpcomingCalendarDays(
  referenceDate: Date,
  timezone: string,
  dayCount: number,
): CalendarDayEntry[] {
  const todayIso = formatIsoDate(referenceDate, timezone);
  const entries: CalendarDayEntry[] = [];

  for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
    const isoDate = addCalendarDays(todayIso, dayOffset, timezone);
    const weekdayLabel = formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone);
    const weekdayIso = getWeekdayIso(isoDate, timezone);

    let relativeLabel: string | null = null;
    if (dayOffset === 0) {
      relativeLabel = "сегодня";
    } else if (dayOffset === 1) {
      relativeLabel = "завтра";
    } else if (dayOffset === 2) {
      relativeLabel = "послезавтра";
    }

    entries.push({
      isoDate,
      weekdayLabel,
      weekdayIso,
      relativeLabel,
    });
  }

  return entries;
}

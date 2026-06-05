import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addCalendarDays,
  enumerateIsoDatesInclusive,
  formatWeekdayLabel,
  getWeekdayIso,
  isoDateToReferenceDate,
} from "../calendar/date-math.js";
import type { DayInfo, DayKind, IsDayOffCalendarJson } from "./types.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const bundledCalendarsDirectory = path.resolve(moduleDirectory, "../../data/calendars");

function isoDateToMonthDay(isoDate: string): string {
  return isoDate.slice(5, 7) + isoDate.slice(8, 10);
}

function buildDayKindLabel(dayKind: DayKind, weekdayLabel: string): string {
  switch (dayKind) {
    case "workday":
      return `${weekdayLabel}, рабочий день`;
    case "shortened_workday":
      return `${weekdayLabel}, сокращённый рабочий день`;
    case "holiday":
      return `${weekdayLabel}, праздничный выходной`;
    case "transferred_workday":
      return `${weekdayLabel}, рабочий день (перенос)`;
    case "weekend":
      return `${weekdayLabel}, выходной`;
    default:
      return weekdayLabel;
  }
}

export class ProductionCalendarStore {
  private readonly calendarByYear = new Map<number, IsDayOffCalendarJson>();
  private readonly apiCache = new Map<string, DayInfo>();

  async explainDay(isoDate: string, timezone: string): Promise<DayInfo> {
    const cachedApiDay = this.apiCache.get(isoDate);
    if (cachedApiDay) {
      return cachedApiDay;
    }

    const year = Number(isoDate.slice(0, 4));
    const calendarJson = await this.loadYearCalendar(year);
    const monthDay = isoDateToMonthDay(isoDate);
    const weekdayLabel = formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone);
    const weekdayIso = getWeekdayIso(isoDate, timezone);
    const isRegularWeekend = weekdayIso >= 6;

    let dayKind: DayKind;
    if (calendarJson.workday.includes(monthDay)) {
      dayKind = "transferred_workday";
    } else if (calendarJson.dayoff.includes(monthDay)) {
      dayKind = "holiday";
    } else if (calendarJson.predayoff.includes(monthDay)) {
      dayKind = "shortened_workday";
    } else if (isRegularWeekend) {
      dayKind = "weekend";
    } else {
      dayKind = "workday";
    }

    const dayInfo: DayInfo = {
      isoDate,
      kind: dayKind,
      isWorkday: dayKind === "workday" || dayKind === "shortened_workday" || dayKind === "transferred_workday",
      isShortened: dayKind === "shortened_workday",
      label: buildDayKindLabel(dayKind, weekdayLabel),
      source: "bundled",
    };

    return dayInfo;
  }

  async isWorkday(isoDate: string, timezone: string): Promise<boolean> {
    const dayInfo = await this.explainDay(isoDate, timezone);
    return dayInfo.isWorkday;
  }

  async nextWorkday(fromIso: string, timezone: string, count = 1): Promise<string> {
    let cursorIso = fromIso;
    let foundWorkdays = 0;

    while (foundWorkdays < count) {
      cursorIso = addCalendarDays(cursorIso, 1, timezone);
      if (await this.isWorkday(cursorIso, timezone)) {
        foundWorkdays += 1;
      }
    }

    return cursorIso;
  }

  async previousWorkday(fromIso: string, timezone: string, count = 1): Promise<string> {
    let cursorIso = fromIso;
    let foundWorkdays = 0;

    while (foundWorkdays < count) {
      cursorIso = addCalendarDays(cursorIso, -1, timezone);
      if (await this.isWorkday(cursorIso, timezone)) {
        foundWorkdays += 1;
      }
    }

    return cursorIso;
  }

  async workdaysInRange(
    dateFromIso: string,
    dateToIso: string,
    timezone: string,
  ): Promise<string[]> {
    const allDates = enumerateIsoDatesInclusive(dateFromIso, dateToIso, timezone);
    const workdayDates: string[] = [];

    for (const isoDate of allDates) {
      if (await this.isWorkday(isoDate, timezone)) {
        workdayDates.push(isoDate);
      }
    }

    return workdayDates;
  }

  async addWorkdays(fromIso: string, timezone: string, workdayCount: number): Promise<string> {
    if (workdayCount <= 0) {
      return fromIso;
    }
    return this.nextWorkday(fromIso, timezone, workdayCount);
  }

  private async loadYearCalendar(year: number): Promise<IsDayOffCalendarJson> {
    const cachedCalendar = this.calendarByYear.get(year);
    if (cachedCalendar) {
      return cachedCalendar;
    }

    const bundledPath = path.join(bundledCalendarsDirectory, `ru${year}.json`);
    try {
      const rawJson = await readFile(bundledPath, "utf8");
      const parsedJson = JSON.parse(rawJson) as IsDayOffCalendarJson;
      this.calendarByYear.set(year, parsedJson);
      return parsedJson;
    } catch {
      const fetchedCalendar = await this.fetchYearCalendarFromApi(year);
      this.calendarByYear.set(year, fetchedCalendar);
      return fetchedCalendar;
    }
  }

  private async fetchYearCalendarFromApi(year: number): Promise<IsDayOffCalendarJson> {
    const response = await fetch(`https://isdayoff.ru/api/getdata?year=${year}&cc=ru`);
    if (!response.ok) {
      throw new Error(`isDayOff API failed for ${year}: HTTP ${response.status}`);
    }

    const rawText = await response.text();
    const dayoff: string[] = [];
    const predayoff: string[] = [];
    const workday: string[] = [];
    const startIso = `${year}-01-01`;

    for (let dayIndex = 0; dayIndex < rawText.length; dayIndex += 1) {
      const isoDate = addCalendarDays(startIso, dayIndex, "Europe/Moscow");
      const monthDay = isoDateToMonthDay(isoDate);
      const code = rawText[dayIndex];

      if (code === "1") {
        dayoff.push(monthDay);
      } else if (code === "2") {
        predayoff.push(monthDay);
      } else if (code === "0") {
        const weekdayIso = getWeekdayIso(isoDate, "Europe/Moscow");
        if (weekdayIso >= 6) {
          workday.push(monthDay);
        }
      }
    }

    return {
      year,
      countrycode: "ru",
      dayoff,
      predayoff,
      workday,
    };
  }
}

export const productionCalendarStore = new ProductionCalendarStore();

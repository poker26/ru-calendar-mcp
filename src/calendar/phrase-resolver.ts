import {
  addCalendarDays,
  buildDayDateTimeRange,
  buildUpcomingCalendarDays,
  enumerateIsoDatesInclusive,
  formatClockTime,
  formatHumanDate,
  formatIsoDate,
  formatWeekdayLabel,
  getIsoWeekBounds,
  getWeekdayIso,
  ISO_TO_WEEKDAY_NAME,
  isoDateToReferenceDate,
  normalizeText,
  resolveNextNamedWeekday,
  resolveThisNamedWeekday,
  resolveTimezone,
  WEEKDAY_NAME_TO_ISO,
} from "./date-math.js";
import { productionCalendarStore } from "../production-calendar/store.js";
import type { ResolvedPhraseResult, WeekRangeResult } from "../production-calendar/types.js";

const WEEKDAY_NAME_PATTERN =
  "понедельник|вторник|среда|среду|четверг|пятница|пятницу|суббота|субботу|воскресенье|воскресенья";

const NON_WORD_LOOKBEHIND = "(?<![\\p{L}\\p{N}_])";
const NON_WORD_LOOKAHEAD = "(?![\\p{L}\\p{N}_])";

function buildPattern(corePattern: string): RegExp {
  return new RegExp(`${NON_WORD_LOOKBEHIND}${corePattern}${NON_WORD_LOOKAHEAD}`, "giu");
}

function buildResolvedPhraseResult(
  phrase: string,
  rule: string,
  timezone: string,
  referenceIso: string,
  dates: string[],
  workdaysOnly: boolean,
  labels: string[],
): ResolvedPhraseResult {
  const dateFrom = dates[0] ?? referenceIso;
  const dateTo = dates[dates.length - 1] ?? referenceIso;
  const firstDayRange = buildDayDateTimeRange(dateFrom, timezone);
  const lastDayRange = buildDayDateTimeRange(dateTo, timezone);

  return {
    phrase,
    rule,
    timezone,
    referenceIso,
    dateFrom,
    dateTo,
    dates,
    workdaysOnly,
    labels,
    dateTimeFrom: firstDayRange.dateFrom,
    dateTimeTo: lastDayRange.dateTo,
  };
}

async function resolveThisWeekWorkdays(
  todayIso: string,
  timezone: string,
): Promise<ResolvedPhraseResult> {
  const { sundayIso } = getIsoWeekBounds(todayIso, timezone);
  const workdayDates = await productionCalendarStore.workdaysInRange(
    todayIso,
    sundayIso,
    timezone,
  );

  return buildResolvedPhraseResult(
    "на этой неделе",
    "«на этой неделе» = сегодня и все оставшиеся рабочие дни до конца текущей ISO-недели (пн–вс)",
    timezone,
    todayIso,
    workdayDates,
    true,
    workdayDates.map((isoDate) => `${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`),
  );
}

async function resolveWeekRange(
  kind: "this" | "next" | "previous",
  todayIso: string,
  timezone: string,
  workdaysOnly: boolean,
): Promise<WeekRangeResult> {
  const { mondayIso, sundayIso } = getIsoWeekBounds(todayIso, timezone);
  let targetMondayIso = mondayIso;

  if (kind === "next") {
    targetMondayIso = addCalendarDays(mondayIso, 7, timezone);
  } else if (kind === "previous") {
    targetMondayIso = addCalendarDays(mondayIso, -7, timezone);
  }

  const targetSundayIso = addCalendarDays(targetMondayIso, 6, timezone);
  const allDates = enumerateIsoDatesInclusive(targetMondayIso, targetSundayIso, timezone);
  const workdayDates = await productionCalendarStore.workdaysInRange(
    targetMondayIso,
    targetSundayIso,
    timezone,
  );

  return {
    kind,
    timezone,
    referenceIso: todayIso,
    mondayIso: targetMondayIso,
    sundayIso: targetSundayIso,
    dateFrom: workdaysOnly ? (workdayDates[0] ?? targetMondayIso) : targetMondayIso,
    dateTo: workdaysOnly ? (workdayDates[workdayDates.length - 1] ?? targetSundayIso) : targetSundayIso,
    dates: workdaysOnly ? workdayDates : allDates,
    workdayDates,
  };
}

async function resolveWeekdayPhrase(
  weekdayName: string,
  todayIso: string,
  timezone: string,
  rule: string,
  useNextOccurrence: boolean,
): Promise<ResolvedPhraseResult | null> {
  const normalizedWeekdayName = normalizeText(weekdayName);
  const weekdayIso = WEEKDAY_NAME_TO_ISO[normalizedWeekdayName];
  if (!weekdayIso) {
    return null;
  }

  const isoDate = useNextOccurrence
    ? resolveNextNamedWeekday(weekdayIso, todayIso, timezone)
    : resolveThisNamedWeekday(weekdayIso, todayIso, timezone);
  const weekdayLabel = ISO_TO_WEEKDAY_NAME[weekdayIso];

  return buildResolvedPhraseResult(
    weekdayName,
    rule,
    timezone,
    todayIso,
    [isoDate],
    false,
    [`${isoDate} (${weekdayLabel})`],
  );
}

export async function resolvePhrase(
  phraseInput: string,
  options?: {
    timezone?: string;
    referenceIso?: string;
    referenceDate?: Date;
  },
): Promise<ResolvedPhraseResult> {
  const timezone = resolveTimezone(options?.timezone ?? process.env.RU_CALENDAR_TIMEZONE);
  const referenceDate = options?.referenceDate ?? new Date();
  const todayIso = options?.referenceIso ?? formatIsoDate(referenceDate, timezone);
  const phrase = phraseInput.trim();
  const normalizedPhrase = normalizeText(phrase);

  if (normalizedPhrase === "сегодня") {
    return buildResolvedPhraseResult(
      phrase,
      "«сегодня» = текущий календарный день",
      timezone,
      todayIso,
      [todayIso],
      false,
      [`${todayIso} (${formatWeekdayLabel(isoDateToReferenceDate(todayIso), timezone)})`],
    );
  }

  if (normalizedPhrase === "завтра") {
    const isoDate = addCalendarDays(todayIso, 1, timezone);
    return buildResolvedPhraseResult(
      phrase,
      "«завтра» = следующий календарный день",
      timezone,
      todayIso,
      [isoDate],
      false,
      [`${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`],
    );
  }

  if (normalizedPhrase === "послезавтра") {
    const isoDate = addCalendarDays(todayIso, 2, timezone);
    return buildResolvedPhraseResult(
      phrase,
      "«послезавтра» = через два календарных дня",
      timezone,
      todayIso,
      [isoDate],
      false,
      [`${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`],
    );
  }

  if (normalizedPhrase === "вчера") {
    const isoDate = addCalendarDays(todayIso, -1, timezone);
    return buildResolvedPhraseResult(
      phrase,
      "«вчера» = предыдущий календарный день",
      timezone,
      todayIso,
      [isoDate],
      false,
      [`${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`],
    );
  }

  const throughDaysMatch = normalizedPhrase.match(/^через\s+(\d+)\s+(?:календарн(?:ый|ых|ого|ые)\s+)?д(?:ень|ня|ней)$/u);
  if (throughDaysMatch) {
    const dayCount = Number(throughDaysMatch[1]);
    const isoDate = addCalendarDays(todayIso, dayCount, timezone);
    return buildResolvedPhraseResult(
      phrase,
      "«через N дней» = сегодня + N календарных дней",
      timezone,
      todayIso,
      [isoDate],
      false,
      [`${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`],
    );
  }

  const throughWeekMatch = normalizedPhrase.match(/^через\s+(\d+)\s+недел(?:ю|и)$/u);
  if (throughWeekMatch) {
    const weekCount = Number(throughWeekMatch[1]);
    const isoDate = addCalendarDays(todayIso, weekCount * 7, timezone);
    return buildResolvedPhraseResult(
      phrase,
      "«через N недель» = сегодня + 7×N календарных дней (не «следующая ISO-неделя»)",
      timezone,
      todayIso,
      [isoDate],
      false,
      [`${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`],
    );
  }

  if (normalizedPhrase === "через неделю") {
    const isoDate = addCalendarDays(todayIso, 7, timezone);
    return buildResolvedPhraseResult(
      phrase,
      "«через неделю» = сегодня + 7 календарных дней",
      timezone,
      todayIso,
      [isoDate],
      false,
      [`${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`],
    );
  }

  const throughWorkdaysMatch = normalizedPhrase.match(/^через\s+(\d+)\s+рабоч(?:ий|их|его|ие)\s+д(?:ень|ня|ней)$/u);
  if (throughWorkdaysMatch) {
    const workdayCount = Number(throughWorkdaysMatch[1]);
    const isoDate = await productionCalendarStore.addWorkdays(todayIso, timezone, workdayCount);
    return buildResolvedPhraseResult(
      phrase,
      "«через N рабочих дней» = N шагов по производственному календарю РФ",
      timezone,
      todayIso,
      [isoDate],
      true,
      [`${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`],
    );
  }

  if (
    normalizedPhrase === "на этой неделе" ||
    normalizedPhrase === "в эту неделю" ||
    normalizedPhrase === "на текущей неделе"
  ) {
    return resolveThisWeekWorkdays(todayIso, timezone);
  }

  if (
    normalizedPhrase === "на следующей неделе" ||
    normalizedPhrase === "на будущей неделе"
  ) {
    const weekRange = await resolveWeekRange("next", todayIso, timezone, true);
    return buildResolvedPhraseResult(
      phrase,
      "«на следующей неделе» = все рабочие дни следующей ISO-недели (пн–вс)",
      timezone,
      todayIso,
      weekRange.dates,
      true,
      weekRange.dates.map((isoDate) => `${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`),
    );
  }

  if (normalizedPhrase === "до конца недели") {
    const { sundayIso } = getIsoWeekBounds(todayIso, timezone);
    const dates = enumerateIsoDatesInclusive(todayIso, sundayIso, timezone);
    return buildResolvedPhraseResult(
      phrase,
      "«до конца недели» = сегодня … воскресенье текущей ISO-недели",
      timezone,
      todayIso,
      dates,
      false,
      dates.map((isoDate) => `${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`),
    );
  }

  if (normalizedPhrase === "до конца рабочей недели") {
    const { sundayIso } = getIsoWeekBounds(todayIso, timezone);
    const workdayDates = await productionCalendarStore.workdaysInRange(todayIso, sundayIso, timezone);
    return buildResolvedPhraseResult(
      phrase,
      "«до конца рабочей недели» = сегодня … последний рабочий день текущей ISO-недели",
      timezone,
      todayIso,
      workdayDates,
      true,
      workdayDates.map((isoDate) => `${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`),
    );
  }

  if (normalizedPhrase === "в ближайший рабочий день") {
    const isoDate = (await productionCalendarStore.isWorkday(todayIso, timezone))
      ? todayIso
      : await productionCalendarStore.nextWorkday(todayIso, timezone, 1);
    return buildResolvedPhraseResult(
      phrase,
      "«в ближайший рабочий день» = сегодня, если сегодня рабочий, иначе следующий рабочий",
      timezone,
      todayIso,
      [isoDate],
      true,
      [`${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`],
    );
  }

  if (normalizedPhrase === "в следующий рабочий день") {
    const isoDate = await productionCalendarStore.nextWorkday(todayIso, timezone, 1);
    return buildResolvedPhraseResult(
      phrase,
      "«в следующий рабочий день» = первый рабочий день строго после сегодня",
      timezone,
      todayIso,
      [isoDate],
      true,
      [`${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`],
    );
  }

  if (normalizedPhrase === "на выходных") {
    const saturdayIso = resolveNextNamedWeekday(6, todayIso, timezone);
    const sundayIso = addCalendarDays(saturdayIso, 1, timezone);
    return buildResolvedPhraseResult(
      phrase,
      "«на выходных» = ближайшие суббота и воскресенье (календарные, не рабочие дни)",
      timezone,
      todayIso,
      [saturdayIso, sundayIso],
      false,
      [saturdayIso, sundayIso].map(
        (isoDate) => `${isoDate} (${formatWeekdayLabel(isoDateToReferenceDate(isoDate), timezone)})`,
      ),
    );
  }

  const thisWeekdayMatch = normalizedPhrase.match(
    new RegExp(`^(?:в|на)\\s+(?:этот|эту|это|ближайш(?:ий|ую|ее))\\s+(${WEEKDAY_NAME_PATTERN})$`, "u"),
  );
  if (thisWeekdayMatch) {
    const resolved = await resolveWeekdayPhrase(
      thisWeekdayMatch[1],
      todayIso,
      timezone,
      "«в этот <день>» = сегодня, если день совпадает, иначе ближайшее будущее вхождение",
      false,
    );
    if (resolved) {
      return resolved;
    }
  }

  const nextWeekdayMatch = normalizedPhrase.match(
    new RegExp(`^(?:в|на)\\s+(?:следующ(?:ий|ую|ее|ая))\\s+(${WEEKDAY_NAME_PATTERN})$`, "u"),
  );
  if (nextWeekdayMatch) {
    const resolved = await resolveWeekdayPhrase(
      nextWeekdayMatch[1],
      todayIso,
      timezone,
      "«в следующий <день>» = ближайшее будущее вхождение, не сегодня",
      true,
    );
    if (resolved) {
      return resolved;
    }
  }

  const weekdayMatch = normalizedPhrase.match(
    new RegExp(`^(?:в|на)?\\s*(${WEEKDAY_NAME_PATTERN})$`, "u"),
  );
  if (weekdayMatch) {
    const resolved = await resolveWeekdayPhrase(
      weekdayMatch[1],
      todayIso,
      timezone,
      "«в <день>» / «<день>» = ближайшее будущее вхождение, не сегодня (если сегодня тот же день — через 7 дней)",
      true,
    );
    if (resolved) {
      return resolved;
    }
  }

  throw new Error(`Не удалось распознать фразу: "${phraseInput}"`);
}

export async function resolvePhrasesInText(
  userText: string,
  options?: {
    timezone?: string;
    referenceIso?: string;
    referenceDate?: Date;
  },
): Promise<ResolvedPhraseResult[]> {
  const timezone = resolveTimezone(options?.timezone ?? process.env.RU_CALENDAR_TIMEZONE);
  const referenceDate = options?.referenceDate ?? new Date();
  const todayIso = options?.referenceIso ?? formatIsoDate(referenceDate, timezone);
  const normalizedText = normalizeText(userText);
  const candidates = new Set<string>();

  const patterns = [
    "на этой неделе",
    "на текущей неделе",
    "на следующей неделе",
    "до конца рабочей недели",
    "до конца недели",
    "послезавтра",
    "сегодня",
    "завтра",
    "вчера",
    "на выходных",
    "в ближайший рабочий день",
    "в следующий рабочий день",
    "через неделю",
    buildPattern(`(?:в|на)\\s+(?:этот|эту|это|ближайш(?:ий|ую|ее))\\s+(${WEEKDAY_NAME_PATTERN})`).source,
    buildPattern(`(?:в|на)\\s+(?:следующ(?:ий|ую|ее|ая))\\s+(${WEEKDAY_NAME_PATTERN})`).source,
    buildPattern(`(?:в|на)\\s+(${WEEKDAY_NAME_PATTERN})`).source,
    buildPattern(`(${WEEKDAY_NAME_PATTERN})`).source,
    buildPattern(`через\\s+\\d+\\s+(?:календарн(?:ый|ых|ого|ые)\\s+)?д(?:ень|ня|ней)`).source,
    buildPattern(`через\\s+\\d+\\s+недел(?:ю|и)`).source,
    buildPattern(`через\\s+\\d+\\s+рабоч(?:ий|их|его|ие)\\s+д(?:ень|ня|ней)`).source,
  ];

  for (const patternSource of patterns) {
    const pattern = new RegExp(patternSource, "giu");
    for (const match of normalizedText.matchAll(pattern)) {
      candidates.add(match[0]);
    }
  }

  const resolvedResults: ResolvedPhraseResult[] = [];
  for (const candidatePhrase of candidates) {
    try {
      const resolved = await resolvePhrase(candidatePhrase, {
        timezone,
        referenceIso: todayIso,
        referenceDate,
      });
      resolvedResults.push(resolved);
    } catch {
      continue;
    }
  }

  return resolvedResults;
}

export async function buildCalendarContext(
  userText: string,
  options?: {
    timezone?: string;
    referenceDate?: Date;
    lookupDays?: number;
  },
): Promise<string> {
  const timezone = resolveTimezone(options?.timezone ?? process.env.RU_CALENDAR_TIMEZONE);
  const referenceDate = options?.referenceDate ?? new Date();
  const lookupDays = options?.lookupDays ?? 14;
  const todayIso = formatIsoDate(referenceDate, timezone);
  const weekdayLabel = formatWeekdayLabel(referenceDate, timezone);
  const humanDate = formatHumanDate(referenceDate, timezone);
  const clockTime = formatClockTime(referenceDate, timezone);
  const lookupLines = buildUpcomingCalendarDays(referenceDate, timezone, lookupDays)
    .map((entry) => {
      const suffix = entry.relativeLabel ? ` | ${entry.relativeLabel}` : "";
      return `| ${entry.isoDate} | ${entry.weekdayLabel}${suffix} |`;
    })
    .join("\n");

  const resolvedPhrases = await resolvePhrasesInText(userText, {
    timezone,
    referenceDate,
  });

  const resolvedLines =
    resolvedPhrases.length > 0
      ? resolvedPhrases
          .map(
            (resolvedPhrase) =>
              `- «${resolvedPhrase.phrase}» → ${resolvedPhrase.dateFrom}${resolvedPhrase.dateFrom !== resolvedPhrase.dateTo ? `…${resolvedPhrase.dateTo}` : ""}; правило: ${resolvedPhrase.rule}; date_time_from=${resolvedPhrase.dateTimeFrom}; date_time_to=${resolvedPhrase.dateTimeTo}`,
          )
          .join("\n")
      : "- (в сообщении нет распознанных календарных фраз — используй таблицу ниже)";

  return `[Календарь РФ — вычислено ru-calendar-mcp, не пересчитывай даты сам]
Часовой пояс: ${timezone}
Сейчас: ${weekdayLabel}, ${humanDate}, ${clockTime}
Календарная дата (ISO): ${todayIso}

Правила (обязательны):
1. «сегодня» = ${todayIso}
2. «завтра» = ${addCalendarDays(todayIso, 1, timezone)}
3. «в понедельник» без «этот» = ближайший БУДУЩИЙ понедельник; если сегодня понедельник → через 7 дней
4. «на этой неделе» = сегодня + оставшиеся рабочие дни текущей ISO-недели (производственный календарь РФ)
5. «на следующей неделе» = все рабочие дни следующей ISO-недели
6. «через неделю» ≠ «на следующей неделе» (это +7 календарных дней от сегодня)

Распознано в сообщении:
${resolvedLines}

Таблица ближайших ${lookupDays} дней:
| ISO | день недели |
${lookupLines}

---

`;
}

export { resolveWeekRange };

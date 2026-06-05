export type DayKind =
  | "workday"
  | "weekend"
  | "holiday"
  | "transferred_workday"
  | "shortened_workday";

export interface DayInfo {
  isoDate: string;
  kind: DayKind;
  isWorkday: boolean;
  isShortened: boolean;
  label: string;
  source: "bundled" | "api";
}

export interface IsDayOffCalendarJson {
  year: number;
  countrycode: string;
  dayoff: string[];
  predayoff: string[];
  workday: string[];
  holiday?: string[];
}

export interface ResolvedPhraseResult {
  phrase: string;
  rule: string;
  timezone: string;
  referenceIso: string;
  dateFrom: string;
  dateTo: string;
  dates: string[];
  workdaysOnly: boolean;
  labels: string[];
  dateTimeFrom?: string;
  dateTimeTo?: string;
}

export interface WeekRangeResult {
  kind: "this" | "next" | "previous";
  timezone: string;
  referenceIso: string;
  mondayIso: string;
  sundayIso: string;
  dateFrom: string;
  dateTo: string;
  dates: string[];
  workdayDates: string[];
}

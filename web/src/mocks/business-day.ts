import { jakartaDateKey } from "./sale-number";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
/** Asia/Jakarta tetap UTC+7 (tanpa DST). */
const JAKARTA_OFFSET_MS = 7 * HOUR_MS;

export type BusinessDay = {
  /** "YYYYMMDD" */
  key: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** 00.00 Asia/Jakarta (UTC ms) */
  start: number;
  /** 0 = Minggu */
  weekday: number;
};

/** Hari bisnis (Asia/Jakarta) yang memuat `ms`. */
export function businessDay(ms: number): BusinessDay {
  const key = jakartaDateKey(ms);
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(4, 6));
  const d = Number(key.slice(6, 8));
  const utcMidnight = Date.UTC(y, m - 1, d);
  return {
    key,
    date: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`,
    start: utcMidnight - JAKARTA_OFFSET_MS,
    weekday: new Date(utcMidnight).getUTCDay(),
  };
}

/** Hari bisnis `back` hari sebelum hari bisnis `day`. */
export const daysBefore = (day: BusinessDay, back: number): BusinessDay =>
  businessDay(day.start - back * DAY_MS + 12 * HOUR_MS);

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
/** Asia/Jakarta tetap UTC+7 (tanpa DST). */
const JAKARTA_OFFSET_MS = 7 * HOUR_MS;

const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const JAKARTA_LABEL = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "long",
  day: "numeric",
  month: "short",
});

/** Tanggal bisnis "YYYYMMDD" di zona Asia/Jakarta untuk waktu UTC ms. */
export function jakartaDateKey(ms: number): string {
  return JAKARTA_DATE.format(ms).replaceAll("-", "");
}

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

/** Jam (0-23) di zona Asia/Jakarta untuk waktu UTC ms. */
export const jakartaHour = (ms: number): number =>
  Math.floor(
    ((((ms + JAKARTA_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS,
  );

/** Hari bisnis `back` hari sebelum hari bisnis `day`. */
export const daysBefore = (day: BusinessDay, back: number): BusinessDay =>
  businessDay(day.start - back * DAY_MS + 12 * HOUR_MS);

/** "Jumat, 23 Okt" */
export const businessDayLabel = (day: BusinessDay): string =>
  JAKARTA_LABEL.format(day.start);

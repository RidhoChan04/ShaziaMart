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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Jam dinding Asia/Jakarta: `14.05`. */
export function jakartaTime(ms: number): string {
  const minuteOfDay = Math.floor(
    ((((ms + JAKARTA_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS) / 60_000,
  );
  return `${pad2(Math.floor(minuteOfDay / 60))}.${pad2(minuteOfDay % 60)}`;
}

function dateParts(ms: number): { d: number; m: string; y: number } {
  const key = jakartaDateKey(ms);
  return {
    d: Number(key.slice(6, 8)),
    m: MONTHS[Number(key.slice(4, 6)) - 1] ?? "",
    y: Number(key.slice(0, 4)),
  };
}

/** `28 Okt 2026` (tanggal Asia/Jakarta). */
export function formatDateLong(ms: number): string {
  const { d, m, y } = dateParts(ms);
  return `${d} ${m} ${y}`;
}

/** `Hari ini 14.05` / `Kemarin 09.10` / `28 Okt 14.05`, menurut hari bisnis Asia/Jakarta. */
export function relativeDayTime(ms: number, now: number): string {
  const time = jakartaTime(ms);
  const key = jakartaDateKey(ms);
  const today = businessDay(now);
  if (key === today.key) return `Hari ini ${time}`;
  if (key === daysBefore(today, 1).key) return `Kemarin ${time}`;
  const { d, m } = dateParts(ms);
  return `${d} ${m} ${time}`;
}

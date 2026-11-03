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

// Tanggal kalender ISO "YYYY-MM-DD" (nota, jatuh tempo, kedaluwarsa), menurut kalender Asia/Jakarta.

/** Tanggal kalender Asia/Jakarta untuk waktu UTC ms: `2026-11-02`. */
export const jakartaIsoDate = (ms: number): string => JAKARTA_DATE.format(ms);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isLeapYear = (y: number): boolean =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function isoParts(s: string): { y: number; m: number; d: number } | null {
  const match = ISO_DATE.exec(s);
  if (match === null) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const parts = isoParts(iso);
  if (parts === null) throw new RangeError(`Tanggal tidak sah: ${iso}`);
  return parts;
}

/** Hari ke-n sejak 1970-01-01 (tengah malam UTC); aman untuk tahun < 100. */
function dayNumber(iso: string): number {
  const { y, m, d } = parseIso(iso);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return Math.round(date.getTime() / DAY_MS);
}

/** Tanggal kalender sah `YYYY-MM-DD` (tanpa jam, bulan & hari ada). */
export const isIsoDate = (s: string): boolean => isoParts(s) !== null;

/** `iso` ditambah `days` hari kalender (boleh negatif). */
export function addIsoDays(iso: string, days: number): string {
  if (!Number.isSafeInteger(days)) {
    throw new RangeError(`Jumlah hari harus bilangan bulat: ${days}`);
  }
  const date = new Date((dayNumber(iso) + days) * DAY_MS);
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  return `${y}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Selisih hari kalender `to − from`. */
export const isoDaysBetween = (from: string, to: string): number =>
  dayNumber(to) - dayNumber(from);

/** `20 Apr 2027` */
export function formatIsoDate(iso: string): string {
  const { y, m, d } = parseIso(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** `30 Okt` */
export function formatIsoDayMonth(iso: string): string {
  const { m, d } = parseIso(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

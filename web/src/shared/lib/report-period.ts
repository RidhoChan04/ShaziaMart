import type { ReportPeriod } from "../api/gen/shaziaMartAPI.schemas";
import {
  addIsoDays,
  formatIsoDate,
  formatIsoDayMonth,
  isIsoDate,
  isoDaysBetween,
} from "./business-day";
import { roundHalfUp } from "./quantity";

/**
 * Aturan periode laporan (K12/K13, jawaban pemilik Q7) — murni, dipakai server palsu dan app
 * pemilik. Semua tanggal = string kalender Asia/Jakarta `YYYY-MM-DD`; kedua ujung rentang ikut.
 */
export type IsoRange = { from: string; to: string };

export const MAX_RANGE_DAYS = 92;

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;
const WEEKDAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;
/** 4 Jan 1970 = hari Minggu. */
const A_SUNDAY = "1970-01-04";

const pad2 = (n: number): string => String(n).padStart(2, "0");

function ymd(iso: string): { y: number; m: number; d: number } {
  if (!isIsoDate(iso)) throw new RangeError(`Tanggal tidak sah: ${iso}`);
  return {
    y: Number(iso.slice(0, 4)),
    m: Number(iso.slice(5, 7)),
    d: Number(iso.slice(8, 10)),
  };
}

const isoOf = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;

/** Jumlah hari bulan `m` (1–12) tahun `y`. */
const daysInMonth = (y: number, m: number): number =>
  isoDaysBetween(
    isoOf(y, m, 1),
    m === 12 ? isoOf(y + 1, 1, 1) : isoOf(y, m + 1, 1),
  );

/** Bulan `m` tahun `y` digeser `step` bulan. */
function addMonths(
  y: number,
  m: number,
  step: number,
): { y: number; m: number } {
  const index = y * 12 + (m - 1) + step;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

/** 0 = Minggu … 6 = Sabtu. */
const weekdayOf = (iso: string): number =>
  ((isoDaysBetween(A_SUNDAY, iso) % 7) + 7) % 7;

/** Jumlah hari rentang, kedua ujung ikut. */
const lengthOf = (range: IsoRange): number =>
  isoDaysBetween(range.from, range.to) + 1;

function monthRange(y: number, m: number): IsoRange {
  return { from: isoOf(y, m, 1), to: isoOf(y, m, daysInMonth(y, m)) };
}

/** Periode yang memuat `anchor`: hari itu, Senin–Minggu, atau tanggal 1 sampai akhir bulan. */
export function periodRange(
  period: "hari" | "minggu" | "bulan",
  anchor: string,
): IsoRange {
  const { y, m } = ymd(anchor);
  if (period === "hari") return { from: anchor, to: anchor };
  if (period === "bulan") return monthRange(y, m);
  const monday = addIsoDays(anchor, -((weekdayOf(anchor) + 6) % 7));
  return { from: monday, to: addIsoDays(monday, 6) };
}

/**
 * Periode sebelum/sesudah (`‹` / `›`), selalu periode penuh walau `range` sudah dijepit ke hari
 * ini: hari = hari `range.from` ±1; minggu = Senin–Minggu yang memuat `range.from` ±7; bulan =
 * bulan penuh sebelum/sesudah bulan `range.from` (tidak pernah meluap: 31 Mar mundur → Februari
 * penuh); tanggal = rentang bebas, jadi rentang tepat sebelum/sesudah sepanjang `range` (pemanggil
 * memberi rentang yang ingin digeser, biasanya rentang permintaan).
 */
export function shiftPeriod(
  period: ReportPeriod,
  range: IsoRange,
  step: -1 | 1,
): IsoRange {
  if (period === "bulan") {
    const { y, m } = ymd(range.from);
    const next = addMonths(y, m, step);
    return monthRange(next.y, next.m);
  }
  if (period === "tanggal") {
    const days = lengthOf(range);
    return {
      from: addIsoDays(range.from, step * days),
      to: addIsoDays(range.to, step * days),
    };
  }
  const days = period === "hari" ? 1 : 7;
  return periodRange(period, addIsoDays(range.from, step * days));
}

/** `to` sesudah hari ini dijepit ke hari ini; `running` = rentang memuat hari ini. */
export function clampToToday(
  range: IsoRange,
  today: string,
): IsoRange & { running: boolean } {
  const running = range.to >= today;
  return { from: range.from, to: running ? today : range.to, running };
}

/**
 * Rentang pembanding (K12) dari rentang yang sudah dijepit: hari → H−7; minggu → geser 7 hari;
 * bulan yang sudah lewat → bulan sebelumnya penuh; bulan berjalan (`running`, termasuk hari
 * terakhirnya) → tanggal 1 sampai tanggal sejajar bulan sebelumnya, dijepit ke akhir bulan itu
 * bila lebih pendek (jawaban pemilik Q7: 30 Nov → 1–30 Okt, 30 Mar → 1–28 Feb); tanggal →
 * rentang tepat sebelumnya sepanjang sama.
 */
export function previousRange(
  period: ReportPeriod,
  range: IsoRange,
  running: boolean,
): IsoRange {
  if (period === "hari" || period === "minggu") {
    return {
      from: addIsoDays(range.from, -7),
      to: addIsoDays(range.to, -7),
    };
  }
  if (period === "tanggal") {
    const days = lengthOf(range);
    return {
      from: addIsoDays(range.from, -days),
      to: addIsoDays(range.from, -1),
    };
  }
  const { y, m } = ymd(range.from);
  const prev = addMonths(y, m, -1);
  const last = daysInMonth(prev.y, prev.m);
  return {
    from: isoOf(prev.y, prev.m, 1),
    to: isoOf(prev.y, prev.m, running ? Math.min(ymd(range.to).d, last) : last),
  };
}

/**
 * (jawaban pemilik Q7) Hari terakhir pembanding sejajar dengan hari ini, jadi total pembanding
 * berhenti di jam yang sama dengan sekarang (seperti Beranda): selalu bila periode berjalan,
 * kecuali bulan berjalan yang tanggal sejajarnya dijepit ke akhir bulan pembanding yang lebih
 * pendek (30 Mar → 28 Feb) — bulan pembanding itu dihitung penuh.
 */
export function previousCutAtNow(
  period: ReportPeriod,
  range: IsoRange,
  running: boolean,
): boolean {
  if (!running) return false;
  if (period !== "bulan") return true;
  const end = ymd(range.to);
  const prev = addMonths(end.y, end.m, -1);
  return end.d <= daysInMonth(prev.y, prev.m);
}

/**
 * Pesan galat rentang laporan (sama dengan 422 server), atau null bila sah. `to` sesudah hari ini
 * sah (dijepit), `from` sesudah hari ini tidak.
 */
export function checkRange(
  period: ReportPeriod,
  from: string,
  to: string,
  today: string,
): string | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return "Tanggal tidak valid";
  if (to < from) return "Tanggal akhir sebelum tanggal awal";
  if (from > today) return "Tanggal di masa depan";
  if (period === "tanggal") {
    return lengthOf({ from, to }) > MAX_RANGE_DAYS
      ? `Rentang maksimal ${MAX_RANGE_DAYS} hari`
      : null;
  }
  const expected = periodRange(period, from);
  return expected.from === from && expected.to === to
    ? null
    : "Periode tidak cocok";
}

/** `5 Nov` · `1–5 Nov` · `28 Okt–3 Nov` · `28 Des 2026–3 Jan 2027`. */
export function rangeLabel(range: IsoRange): string {
  const a = ymd(range.from);
  const b = ymd(range.to);
  if (range.from === range.to) return formatIsoDayMonth(range.from);
  if (a.y !== b.y) {
    return `${formatIsoDate(range.from)}–${formatIsoDate(range.to)}`;
  }
  if (a.m === b.m) return `${a.d}–${formatIsoDayMonth(range.to)}`;
  return `${formatIsoDayMonth(range.from)}–${formatIsoDayMonth(range.to)}`;
}

const weekdayName = (iso: string): string =>
  WEEKDAY_NAMES[weekdayOf(iso)] ?? "";

/** Label pembanding period hari (H−7), dengan nama hari: `Kamis, 29 Okt`. */
export function weekdayLabel(iso: string): string {
  return `${weekdayName(iso)}, ${formatIsoDayMonth(iso)}`;
}

/** Judul navigator: `Kamis, 5 Nov 2026` · `2–8 Nov 2026` · `November 2026` · `10 Okt–5 Nov 2026`. */
export function periodTitle(period: ReportPeriod, range: IsoRange): string {
  const a = ymd(range.from);
  if (period === "hari") {
    return `${weekdayName(range.from)}, ${formatIsoDate(range.from)}`;
  }
  if (period === "bulan") return `${MONTH_NAMES[a.m - 1]} ${a.y}`;
  const label = rangeLabel(range);
  return a.y === ymd(range.to).y ? `${label} ${a.y}` : label;
}

/**
 * Teks pembanding (K13): `Belum ada data {label}` bila pembanding tanpa penjualan; pembanding ≤ 0
 * → `{nilai} di {label}`; selain itu persen dibulatkan setengah ke atas, 0% → `Sama dengan`.
 */
export function compareText(
  current: number,
  previous: number,
  label: string,
  hasData: boolean,
  format: (n: number) => string,
): string {
  if (!hasData) return `Belum ada data ${label}`;
  if (previous <= 0) return `${format(previous)} di ${label}`;
  const percent = roundHalfUp(Math.abs(current - previous) * 100, previous);
  if (percent === 0) return `Sama dengan ${label}`;
  return `${current > previous ? "▲" : "▼"} ${percent}% dari ${label}`;
}

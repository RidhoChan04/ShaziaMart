import { ReportPeriod } from "../api/gen/shaziaMartAPI.schemas";
import { checkRange, periodRange } from "./report-period";

/** State periode Laporan di URL (K26): rute app (validateSearch) dan layar Laporan pemilik. */
export type ReportSearch = {
  periode: ReportPeriod;
  dari: string;
  sampai: string;
};

const isPeriod = (v: unknown): v is ReportPeriod =>
  (Object.values(ReportPeriod) as unknown[]).includes(v);

/** Periode `hari` / `minggu` / `bulan` yang memuat `today`. */
export function reportSearch(
  periode: "hari" | "minggu" | "bulan",
  today: string,
): ReportSearch {
  const { from, to } = periodRange(periode, today);
  return { periode, dari: from, sampai: to };
}

/** Search URL laporan; tidak sah (aturan sama dengan 422 server) → bulan berjalan (K26). */
export function validateReportSearch(
  search: Record<string, unknown>,
  today: string,
): ReportSearch {
  const { periode, dari, sampai } = search;
  if (
    isPeriod(periode) &&
    typeof dari === "string" &&
    typeof sampai === "string" &&
    checkRange(periode, dari, sampai, today) === null
  ) {
    return { periode, dari, sampai };
  }
  return reportSearch("bulan", today);
}

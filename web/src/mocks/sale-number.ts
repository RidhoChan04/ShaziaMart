const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Tanggal bisnis "YYYYMMDD" di zona Asia/Jakarta untuk waktu UTC ms. */
export function jakartaDateKey(ms: number): string {
  return JAKARTA_DATE.format(ms).replaceAll("-", "");
}

/** Nomor struk `YYYYMMDD-NNNN`, urutan per hari bisnis. */
export function formatSaleNumber(createdAt: number, seq: number): string {
  return `${jakartaDateKey(createdAt)}-${String(seq).padStart(4, "0")}`;
}

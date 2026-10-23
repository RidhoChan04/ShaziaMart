import { jakartaDateKey } from "@/shared/lib/business-day";

/** Nomor struk `YYYYMMDD-NNNN`, urutan per hari bisnis. */
export function formatSaleNumber(createdAt: number, seq: number): string {
  return `${jakartaDateKey(createdAt)}-${String(seq).padStart(4, "0")}`;
}

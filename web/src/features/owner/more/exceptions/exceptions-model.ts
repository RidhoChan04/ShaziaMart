import type {
  CashierException,
  ExceptionKind,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatDateLong, jakartaTime } from "@/shared/lib/business-day";
import { formatRupiah, formatSignedRupiah } from "@/shared/lib/money";

/** Semua jenis kejadian punya halaman tinjau. */
const KINDS: readonly ExceptionKind[] = [
  "batal_transaksi",
  "batal_pelunasan",
  "kasbon_lewat_limit",
  "batal_kas_keluar",
  "selisih_kas",
  "kas_keluar",
  "serah_terima",
  "shift_lama",
  "selisih_kecil",
];

export const isExceptionKind = (v: string): v is ExceptionKind =>
  (KINDS as readonly string[]).includes(v);

/** Judul halaman tinjau = teks butir Beranda tanpa angka. */
export const EXCEPTION_TITLE: Record<ExceptionKind, string> = {
  batal_transaksi: "Transaksi dibatalkan kasir",
  batal_pelunasan: "Pelunasan dibatalkan kasir",
  kasbon_lewat_limit: "Kasbon lewat limit",
  batal_kas_keluar: "Kas keluar dibatalkan kasir",
  selisih_kas: "Selisih kas",
  kas_keluar: "Kas keluar besar",
  serah_terima: "Modal berbeda saat serah terima",
  shift_lama: "Shift kelamaan buka",
  selisih_kecil: "Selisih kecil berulang",
};

/** `Sejak ditinjau 5 Nov 2026 14.30` / `Belum pernah ditinjau`. */
export function reviewedEyebrow(reviewedAt: number | null): string {
  return reviewedAt === null
    ? "Belum pernah ditinjau"
    : `Sejak ditinjau ${formatDateLong(reviewedAt)} ${jakartaTime(reviewedAt)}`;
}

/** Judul baris: `{nomor} · {kasir}` untuk transaksi, `{pelanggan} · {kasir}` selain itu. */
export function exceptionRowTitle(e: CashierException): string {
  const subject =
    e.kind === "batal_transaksi"
      ? (e.saleNumber ?? "Transaksi")
      : (e.customerName ?? "Pelanggan");
  return `${subject} · ${e.kasirName}`;
}

/** Keterangan uang laci void kasir (ruling R12 / koreksi M1); kosong bila tak ada. */
export function drawerNote(e: CashierException): string | null {
  if (e.kind !== "batal_transaksi") return null;
  if (e.fromClosedShift) {
    return e.refund > 0
      ? `Shift sebelumnya · tunai dari laci ${formatRupiah(e.refund)}`
      : "Shift sebelumnya";
  }
  return e.refund > 0
    ? `QRIS dikembalikan tunai dari laci ${formatRupiah(e.refund)}`
    : null;
}

/** Tugas pemilik: QRIS yang kasir pilih "Transfer oleh pemilik nanti". */
export function transferTask(e: CashierException): string | null {
  if (e.kind !== "batal_transaksi" || e.qrisToOwner <= 0) return null;
  return `Transfer ${formatRupiah(e.qrisToOwner)} ke ${e.customerName ?? "pembeli"} (pengembalian QRIS struk ${e.saleNumber ?? "—"})`;
}

/** `at` kejadian terbaru yang tampil: batas `upTo` yang dikirim saat menandai ditinjau. */
export function newestAt(items: readonly CashierException[]): number {
  return items.reduce((max, e) => Math.max(max, e.at), 0);
}

/** Jenis F3c-2a: baris dua tingkat per kasir (F3c-1 memakai baris sendiri). */
export const isShiftEventKind = (kind: ExceptionKind): boolean =>
  kind !== "batal_transaksi" &&
  kind !== "batal_pelunasan" &&
  kind !== "kasbon_lewat_limit";

/** Nilai kanan: `{j} jam` untuk shift kelamaan, ±Rp untuk selisih/serah terima, Rp polos selain itu. */
export function shiftEventValue(e: CashierException): string {
  switch (e.kind) {
    case "shift_lama":
      return `${Math.floor((e.durationMinutes ?? 0) / 60)} jam`;
    case "selisih_kas":
    case "selisih_kecil":
    case "serah_terima":
      return formatSignedRupiah(e.amount);
    default:
      return formatRupiah(e.amount);
  }
}

/** `Shift 15.00–22.04`; shift masih buka: `Shift 15.00–sekarang`. */
export function shiftSpanText(
  openedAt: number,
  closedAt: number | null,
): string {
  return `Shift ${jakartaTime(openedAt)}–${closedAt === null ? "sekarang" : jakartaTime(closedAt)}`;
}

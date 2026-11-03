import type { ReceiptError } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { DraftLine } from "@/shared/lib/receipt-rules";

export type DraftPayment = {
  timing: "sekarang" | "nanti";
  method: "tunai" | "transfer";
  cashSource: "laci" | "pemilik";
  dueDate: string | null;
};

export type ReceiptForm = {
  supplierName: string;
  notaDate: string;
  lines: DraftLine[];
  payment: DraftPayment;
};

/** Foto tetap di HP sampai notanya terkirim; `uploaded` = sudah diterima server. */
export type DraftPhoto = {
  id: string;
  blob: Blob;
  takenAt: number;
  bytes: number;
  uploaded: boolean;
};

/** editing: masih diisi; queued: antre dikirim; rejected: ditolak server, menunggu dibetulkan. */
export type DraftStatus = "editing" | "queued" | "rejected";

/** Nota barang masuk di HP; `id` = kunci idempoten saat dikirim (kirim ulang tidak menggandakan). */
export type ReceiptDraft = {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  status: DraftStatus;
  form: ReceiptForm;
  photo: DraftPhoto | null;
  errors: ReceiptError[];
};

import type {
  OpnameError,
  OpnameScope,
  StaffProduct,
} from "@/shared/api/gen/shaziaMartAPI.schemas";

/** Hitungan satu barang; `countedAt` = jam HP saat barang dibuka untuk dihitung (K6). */
export type OpnameCount = { qtyBase: number; countedAt: number };

/**
 * Opname di HP (K17). `id` = ID sesi saat dikirim (idempoten). `products` = salinan daftar
 * hitung saat mulai (hitung offline); `counts` per productId. counting: masih dihitung;
 * queued: antre dikirim; rejected: ditolak server, menunggu dibetulkan.
 */
export type OpnameDraft = {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  status: "counting" | "queued" | "rejected";
  scope: OpnameScope;
  products: StaffProduct[];
  counts: Record<string, OpnameCount>;
  errors: OpnameError[];
};

import type {
  OpnameItemState,
  OwnerOpnameItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatQty } from "@/shared/lib/quantity";

/** Batas total selisih per sesi (J8: nilai tetap di server, belum ada endpoint pengaturan; layar pengaturan di F3c). */
export const OPNAME_SESSION_LIMIT = 250_000;

export type OpnameGroup = {
  title: "Menunggu persetujuan" | "Selisih" | "Stok awal" | "Cocok";
  items: OwnerOpnameItem[];
};

const GROUP_OF: Record<OpnameItemState, OpnameGroup["title"]> = {
  ditahan: "Menunggu persetujuan",
  menunggu_alasan: "Selisih",
  disesuaikan: "Selisih",
  disetujui: "Selisih",
  dihitung_ulang: "Selisih",
  diganti: "Selisih",
  stok_awal: "Stok awal",
  cocok: "Cocok",
};

const ORDER: OpnameGroup["title"][] = [
  "Menunggu persetujuan",
  "Selisih",
  "Stok awal",
  "Cocok",
];

/** Bagian halaman detail: yang menunggu persetujuan dulu, lalu selisih, stok awal, cocok; bagian kosong dibuang. */
export function groupItems(items: readonly OwnerOpnameItem[]): OpnameGroup[] {
  return ORDER.map((title) => ({
    title,
    items: items.filter((i) => GROUP_OF[i.state] === title),
  })).filter((g) => g.items.length > 0);
}

/** Angka yang berlaku untuk barang: hitung ulang pemilik menggantikan hitungan awal. */
export function effectiveCount(item: OwnerOpnameItem): {
  systemQtyBase: number;
  countedQtyBase: number;
  diffQtyBase: number;
  value: number | null;
} {
  const r = item.state === "dihitung_ulang" ? item.recount : null;
  return r
    ? {
        systemQtyBase: r.systemQtyBase,
        countedQtyBase: r.countedQtyBase,
        diffQtyBase: r.diffQtyBase,
        value: r.value,
      }
    : {
        systemQtyBase: item.systemQtyBase,
        countedQtyBase: item.countedQtyBase,
        diffQtyBase: item.diffQtyBase,
        value: item.value,
      };
}

/** `−40 pcs` · `+3 pcs`. */
export function signedQty(
  diffQtyBase: number,
  unitSize: number,
  unitName: string,
): string {
  const text = formatQty(diffQtyBase, unitSize, unitName);
  return diffQtyBase > 0 ? `+${text}` : text;
}

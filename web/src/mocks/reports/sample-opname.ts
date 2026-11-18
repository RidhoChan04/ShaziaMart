import type {
  OpnameItemState,
  OpnameReason,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { addIsoDays, jakartaIsoDate } from "@/shared/lib/business-day";
import type {
  MockOpnameItem,
  MockOpnameSession,
  MockProduct,
  MockState,
  MockUser,
} from "../db";
import { eceranOf } from "../products/views";
import { applyDiff } from "../stock/opname";
import { diffValue } from "../stock/opname-value";
import {
  pushSampleReceipt,
  type SampleProduct,
  sampleProduct,
} from "../stock/sample";
import { stockAt } from "../stock/stock-at";

export const ROKOK = "Rokok Gudang Garam 12";
export const KECAP = "Kecap ABC 600 ml";

const PRODUCTS: SampleProduct[] = [
  {
    name: ROKOK,
    category: "Rokok",
    unit: "bks",
    price: 24_000,
    cost: 21_000,
    stock: 0,
  },
  {
    name: KECAP,
    category: "Bumbu Dapur",
    unit: "pcs",
    price: 21_500,
    cost: 19_000,
    stock: 0,
  },
];
/** Sesudah barang contoh stok (`applySampleStock` memakai indeks 0–3). */
const PRODUCT_INDEX = 10;
/** Alasan disimpan 5 menit sesudah hitung; keputusan pemilik 2 jam sesudahnya. */
const FINISH_MS = 5 * 60_000;
const OWNER_MS = 2 * 3_600_000;

/**
 * Selisih terhadap stok ledger pada jam hitung. `dihitung_ulang`: hitungan asli `diff` ditahan,
 * pemilik menghitung ulang `OWNER_MS` kemudian dengan selisih `recountDiff` (yang diterapkan).
 */
type Count = {
  product: 0 | 1;
  diff: number;
  state: OpnameItemState;
  reason?: OpnameReason;
  recountDiff?: number;
};
type SessionSpec = {
  id: string;
  by: "Rina" | "Budi";
  daysAgo: number;
  hm: string;
  counts: Count[];
  /** Nota barang masuk Rokok oleh orang toko sebelum sesi ini (catatan di jeda hitungan). */
  receiptBefore?: {
    id: string;
    by: "Rina" | "Budi";
    daysAgo: number;
    hm: string;
    qty: number;
  };
};

/**
 * Mockup laporan selisih opname: Rokok stok awal 40 lalu 4 hitungan (cocok, −3, −5, −6: kurang 3
 * kali berturut-turut, −14 bks = Rp294.000; −6 hasil hitung ulang pemilik dari −8, dan Rina
 * mencatat nota masuk 10 bks di jeda hitungan −5); Kecap stok awal 7 lalu lebih 2 (Rp38.000).
 */
const SESSIONS: SessionSpec[] = [
  {
    id: "contoh-opname-1",
    by: "Rina",
    daysAgo: 8,
    hm: "08:30",
    counts: [
      { product: 0, diff: 40, state: "stok_awal" },
      { product: 1, diff: 7, state: "stok_awal" },
    ],
  },
  {
    id: "contoh-opname-2",
    by: "Budi",
    daysAgo: 4,
    hm: "08:50",
    counts: [{ product: 0, diff: 0, state: "cocok" }],
  },
  {
    id: "contoh-opname-3",
    by: "Rina",
    daysAgo: 3,
    hm: "09:15",
    counts: [
      { product: 0, diff: -3, state: "disesuaikan", reason: "tidak_diketahui" },
    ],
  },
  {
    id: "contoh-opname-4",
    by: "Budi",
    daysAgo: 2,
    hm: "16:20",
    receiptBefore: {
      id: "contoh-opname-nota-1",
      by: "Rina",
      daysAgo: 3,
      hm: "14:00",
      qty: 10,
    },
    counts: [
      { product: 0, diff: -5, state: "disetujui", reason: "tidak_diketahui" },
    ],
  },
  {
    id: "contoh-opname-5",
    by: "Rina",
    daysAgo: 1,
    hm: "10:05",
    counts: [
      {
        product: 0,
        diff: -8,
        state: "dihitung_ulang",
        reason: "hilang",
        recountDiff: -6,
      },
      { product: 1, diff: 2, state: "disesuaikan", reason: "tidak_diketahui" },
    ],
  },
];

function userNamed(state: MockState, name: string): MockUser {
  const user = state.users.find((u) => u.name === name);
  if (!user) throw new Error(`Seed tanpa ${name}`);
  return user;
}

/** Hitung ulang pemilik: selisih terhadap stok pada jamnya, langsung diterapkan (J5). */
function recountOf(
  state: MockState,
  sessionId: string,
  p: MockProduct,
  c: Count,
  at: number,
  owner: MockUser,
): NonNullable<MockOpnameItem["recount"]> {
  const system = stockAt(state, p.id, at);
  const diff = c.recountDiff ?? 0;
  applyDiff(
    state,
    {
      productId: p.id,
      diffQtyBase: diff,
      kind: "opname",
      sessionId,
      actorName: owner.name,
      reason: c.reason ?? null,
      effectiveAt: at,
    },
    at,
  );
  return {
    countedQtyBase: system + diff,
    countedAt: at,
    systemQtyBase: system,
    diffQtyBase: diff,
    value: diffValue(diff, p.cost),
  };
}

/** Satu hitungan yang sudah beres; stok & ledger disesuaikan pada jam berlakunya (K7). */
function countItem(
  state: MockState,
  session: SessionSpec,
  p: MockProduct,
  c: Count,
  countedAt: number,
  owner: MockUser,
): MockOpnameItem {
  const unit = eceranOf(p);
  const system = stockAt(state, p.id, countedAt);
  const byOwner = c.state === "disetujui" || c.state === "dihitung_ulang";
  const resolvedAt = countedAt + (byOwner ? OWNER_MS : FINISH_MS);
  const recount =
    c.state === "dihitung_ulang"
      ? recountOf(state, session.id, p, c, resolvedAt, owner)
      : null;
  if (recount === null) {
    applyDiff(
      state,
      {
        productId: p.id,
        diffQtyBase: c.diff,
        kind: c.state === "stok_awal" ? "stok_awal" : "opname",
        sessionId: session.id,
        actorName: byOwner ? owner.name : session.by,
        reason: c.reason ?? null,
        effectiveAt: countedAt,
      },
      resolvedAt,
    );
  }
  p.stockCounted = true;
  return {
    productId: p.id,
    productName: p.name,
    unitName: unit.name,
    unitSize: unit.unitSize,
    isCurah: p.isCurah,
    countedQtyBase: system + c.diff,
    countedAt,
    clockEstimated: false,
    systemQtyBase: system,
    diffQtyBase: c.diff,
    value: c.state === "stok_awal" ? null : diffValue(c.diff, p.cost),
    state: c.state,
    reason: c.reason ?? null,
    receiptRefId: null,
    resolvedByName: byOwner ? owner.name : null,
    resolvedAt: byOwner ? resolvedAt : null,
    replacedBySessionId: null,
    replacedByName: null,
    mustHold: false,
    recount,
  };
}

/**
 * Panel pengembang: barang, nota, dan sesi opname contoh laporan Selisih opname (pengaman 4),
 * relatif terhadap hari ini (8, 4, 3, 2, dan 1 hari lalu), diterapkan berurutan menurut jam.
 * Selisih, nota masuk, dan hitung ulang pemilik diterapkan ke stok & ledger seperti alur aslinya;
 * shift yang bertugas berasal dari riwayat seed. Dipanggil lagi → tidak berubah.
 */
export function applySampleOpname(state: MockState, now: number): void {
  if (state.opnameSessions.some((s) => s.id === SESSIONS[0]?.id)) return;
  const owner = state.users.find((u) => u.role === "pemilik");
  if (!owner) throw new Error("Seed tanpa pemilik");
  const products = PRODUCTS.map((spec, i) =>
    sampleProduct(state, spec, PRODUCT_INDEX + i),
  );
  const [rokok] = products;
  if (!rokok) throw new Error("Contoh opname tanpa barang");
  const today = jakartaIsoDate(now);
  const atOf = (daysAgo: number, hm: string): number =>
    Date.parse(`${addIsoDays(today, -daysAgo)}T${hm}:00+07:00`);
  for (const spec of SESSIONS) {
    const nota = spec.receiptBefore;
    if (nota) {
      pushSampleReceipt(state, {
        id: nota.id,
        product: rokok,
        qty: nota.qty,
        at: atOf(nota.daysAgo, nota.hm),
        actor: userNamed(state, nota.by),
        expiryDate: null,
        addStock: true,
      });
    }
    const by = userNamed(state, spec.by);
    const countedAt = atOf(spec.daysAgo, spec.hm);
    const items = spec.counts.map((c) => {
      const p = products[c.product];
      if (!p) throw new Error("Contoh opname tanpa barang");
      return countItem(state, spec, p, c, countedAt, owner);
    });
    const session: MockOpnameSession = {
      id: spec.id,
      scope: { kind: "semua", category: null },
      createdById: by.id,
      createdByName: by.name,
      submittedAt: countedAt,
      finishedAt: countedAt + FINISH_MS,
      status: "selesai",
      flagged: false,
      reviewedByName: null,
      reviewedAt: null,
      items,
    };
    state.opnameSessions.push(session);
  }
}

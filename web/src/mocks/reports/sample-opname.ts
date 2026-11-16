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
import { type SampleProduct, sampleProduct } from "../stock/sample";
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
/** Alasan disimpan 5 menit sesudah hitung; persetujuan pemilik 2 jam sesudahnya. */
const FINISH_MS = 5 * 60_000;
const APPROVE_MS = 2 * 3_600_000;

type Count = {
  product: 0 | 1;
  counted: number;
  state: OpnameItemState;
  reason?: OpnameReason;
};
type SessionSpec = {
  id: string;
  by: "Rina" | "Budi";
  daysAgo: number;
  hm: string;
  counts: Count[];
};

/**
 * Mockup laporan selisih opname: Rokok stok awal 40 lalu 4 hitungan (cocok, −3, −5, −6: kurang 3
 * kali berturut-turut, −14 bks = Rp294.000); Kecap stok awal 7 lalu lebih 2 (Rp38.000).
 */
const SESSIONS: SessionSpec[] = [
  {
    id: "contoh-opname-1",
    by: "Rina",
    daysAgo: 8,
    hm: "08:30",
    counts: [
      { product: 0, counted: 40, state: "stok_awal" },
      { product: 1, counted: 7, state: "stok_awal" },
    ],
  },
  {
    id: "contoh-opname-2",
    by: "Budi",
    daysAgo: 4,
    hm: "08:50",
    counts: [{ product: 0, counted: 40, state: "cocok" }],
  },
  {
    id: "contoh-opname-3",
    by: "Rina",
    daysAgo: 3,
    hm: "09:15",
    counts: [
      {
        product: 0,
        counted: 37,
        state: "disesuaikan",
        reason: "tidak_diketahui",
      },
    ],
  },
  {
    id: "contoh-opname-4",
    by: "Budi",
    daysAgo: 2,
    hm: "16:20",
    counts: [
      {
        product: 0,
        counted: 32,
        state: "disetujui",
        reason: "tidak_diketahui",
      },
    ],
  },
  {
    id: "contoh-opname-5",
    by: "Rina",
    daysAgo: 1,
    hm: "10:05",
    counts: [
      { product: 0, counted: 26, state: "disetujui", reason: "hilang" },
      {
        product: 1,
        counted: 9,
        state: "disesuaikan",
        reason: "tidak_diketahui",
      },
    ],
  },
];

function userNamed(state: MockState, name: string): MockUser {
  const user = state.users.find((u) => u.name === name);
  if (!user) throw new Error(`Seed tanpa ${name}`);
  return user;
}

/** Satu hitungan yang sudah beres; stok & ledger disesuaikan pada jam hitungnya (K7). */
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
  const diff = c.counted - system;
  const approved = c.state === "disetujui";
  const resolvedAt = countedAt + (approved ? APPROVE_MS : FINISH_MS);
  applyDiff(
    state,
    {
      productId: p.id,
      diffQtyBase: diff,
      kind: c.state === "stok_awal" ? "stok_awal" : "opname",
      sessionId: session.id,
      actorName: approved ? owner.name : session.by,
      reason: c.reason ?? null,
      effectiveAt: countedAt,
    },
    resolvedAt,
  );
  p.stockCounted = true;
  return {
    productId: p.id,
    productName: p.name,
    unitName: unit.name,
    unitSize: unit.unitSize,
    isCurah: p.isCurah,
    countedQtyBase: c.counted,
    countedAt,
    clockEstimated: false,
    systemQtyBase: system,
    diffQtyBase: diff,
    value: c.state === "stok_awal" ? null : diffValue(diff, p.cost),
    state: c.state,
    reason: c.reason ?? null,
    receiptRefId: null,
    resolvedByName: approved ? owner.name : null,
    resolvedAt: approved ? resolvedAt : null,
    replacedBySessionId: null,
    replacedByName: null,
    mustHold: false,
    recount: null,
  };
}

/**
 * Panel pengembang: barang & sesi opname contoh laporan Selisih opname (pengaman 4), relatif
 * terhadap hari ini (8, 4, 3, 2, dan 1 hari lalu). Selisih diterapkan ke stok & ledger seperti
 * alur aslinya; yang bertugas berasal dari shift riwayat seed. Dipanggil lagi → tidak berubah.
 */
export function applySampleOpname(state: MockState, now: number): void {
  if (state.opnameSessions.some((s) => s.id === SESSIONS[0]?.id)) return;
  const owner = state.users.find((u) => u.role === "pemilik");
  if (!owner) throw new Error("Seed tanpa pemilik");
  const products = PRODUCTS.map((spec, i) =>
    sampleProduct(state, spec, PRODUCT_INDEX + i),
  );
  const today = jakartaIsoDate(now);
  for (const spec of SESSIONS) {
    const by = userNamed(state, spec.by);
    const countedAt = Date.parse(
      `${addIsoDays(today, -spec.daysAgo)}T${spec.hm}:00+07:00`,
    );
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

// Bahan test form nota (dipakai beberapa file *.test.tsx; bukan kode app).
import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { expect } from "vitest";
import { AppProviders } from "@/app/providers";
import { createAppRouter } from "@/app/router";
import { mockDb } from "@/mocks/db";
import {
  loginWithShift,
  post,
  receiptInput,
  staffLogin,
} from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { createTestQueryClient } from "@/test/render-app";
import {
  type DraftStore,
  emptyForm,
  memoryDraftStore,
} from "../drafts/draft-store";
import type { ReceiptDraft, ReceiptForm } from "../drafts/draft-types";
import { DraftStoreContext } from "../drafts/use-drafts";
import { memoryOpnameStore } from "../opname/opname-draft-store";
import { OpnameStoreContext } from "../opname/use-opname-drafts";

export const DRAFT_ID = "draf-uji";
/** 2 Nov 2026 12.00 WIB. */
export const NOW = Date.UTC(2026, 10, 2, 5);

export const userIdOf = (name: string): string => {
  const u = mockDb.get().users.find((x) => x.name === name);
  if (!u) throw new Error(`seed tanpa ${name}`);
  return u.id;
};

/** Baris draf dari barang seed (salinan seperti hasil pencarian staf). */
export function seedLine(
  lineId: string,
  name: string,
  unitName: string,
  qty: number,
  unitCostText: string,
  expiryDate: string | null = null,
): DraftLine {
  const p = mockDb.get().products.find((x) => x.name === name);
  const unit = p?.units.find((u) => u.name === unitName);
  if (!p || !unit) throw new Error(`seed tanpa ${name} ${unitName}`);
  return {
    lineId,
    product: {
      id: p.id,
      name: p.name,
      category: p.category,
      baseUnit: p.baseUnit,
      units: p.units.map((u) => ({
        id: u.id,
        name: u.name,
        unitSize: u.unitSize,
        barcodes: u.barcodes,
      })),
    },
    unitId: unit.id,
    newProduct: null,
    qty,
    unitCostText,
    expiryDate,
  };
}

/** Tiga baris mockup 3a: total Rp1.442.000. */
export const mockupLines = (): DraftLine[] => [
  seedLine("l1", "Indomie Goreng", "dus", 2, "112.000", "2027-04-20"),
  seedLine("l2", "Minyak Goreng Bimoli 2 L", "pcs", 12, "34.000"),
  seedLine("l3", "Gula Pasir", "kg", 50, "16.200"),
];

export function makeDraft(patch: Partial<ReceiptForm> = {}): ReceiptDraft {
  return {
    id: DRAFT_ID,
    userId: userIdOf("Rina"),
    createdAt: NOW,
    updatedAt: NOW,
    status: "editing",
    form: { ...emptyForm("2026-11-02"), ...patch },
    photo: null,
    errors: [],
  };
}

export async function storeWithDraft(
  patch: Partial<ReceiptForm> = {
    lines: mockupLines(),
    supplierName: "CV Sumber Rejeki",
  },
): Promise<DraftStore> {
  const store = memoryDraftStore();
  await store.put(makeDraft(patch));
  return store;
}

/** Render app di halaman form dengan penyimpan draf nota & opname di memori (jsdom tanpa IndexedDB). */
export function renderForm(
  store: DraftStore = memoryDraftStore(),
  path = `/staff/masuk/baru?draf=${DRAFT_ID}`,
) {
  const queryClient = createTestQueryClient();
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const utils = render(
    <DraftStoreContext.Provider value={store}>
      <OpnameStoreContext.Provider value={memoryOpnameStore()}>
        <AppProviders router={router} queryClient={queryClient} />
      </OpnameStoreContext.Provider>
    </DraftStoreContext.Provider>,
  );
  return { ...utils, router, store, queryClient };
}

export async function loginRina(withShift: boolean) {
  if (withShift) await loginWithShift(1_500_000);
  expect((await staffLogin()).status).toBe(200);
}

const RECEIPTS = "/api/staff/receipts";

/** Isi POST nota yang masuk ke server palsu (pendengar dibuang oleh test lewat removeAllListeners). */
export function capturePosts() {
  const bodies: unknown[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === RECEIPTS
    ) {
      bodies.push(await request.clone().json());
    }
  });
  return bodies;
}

/** Nota mockup (CV Sumber Rejeki) tersimpan di server palsu atas nama Rina, shift terbuka. */
export async function seedReceipt(
  patch: Parameters<typeof receiptInput>[0] = {},
) {
  await loginRina(true);
  const res = await post(RECEIPTS, receiptInput(patch));
  expect(res.status).toBe(201);
}

/** Isi PUT ubah nota yang masuk ke server palsu. */
export function capturePuts() {
  const bodies: unknown[] = [];
  server.events.on("request:start", async ({ request }) => {
    const { pathname } = new URL(request.url);
    if (request.method === "PUT" && pathname.startsWith(RECEIPTS)) {
      bodies.push(await request.clone().json());
    }
  });
  return bodies;
}

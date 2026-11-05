// Bahan test tab Opname & layar hitung (dipakai beberapa file *.test.tsx; bukan kode app).
import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { AppProviders } from "@/app/providers";
import { createAppRouter } from "@/app/router";
import { mockDb } from "@/mocks/db";
import { json, post, staffLogin } from "@/mocks/handlers/test-helpers";
import type {
  OpnameScope,
  StaffOpnameSession,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { createTestQueryClient } from "@/test/render-app";
import { memoryDraftStore } from "../drafts/draft-store";
import { DraftStoreContext } from "../drafts/use-drafts";
import { memoryOpnameStore, type OpnameDraftStore } from "./opname-draft-store";
import { OpnameStoreContext } from "./use-opname-drafts";

export const MI_INSTAN: OpnameScope = {
  kind: "kategori",
  category: "Mi Instan",
};

/** 5 Nov 2026, jam WIB "HH.MM" ke epoch ms UTC. */
export const T = (hm: string): number => {
  const [h = 0, m = 0] = hm.split(".").map(Number);
  return Date.UTC(2026, 10, 5, h - 7, m);
};

export const DAY = 86_400_000;

export const miInstan = () =>
  mockDb.get().products.filter((p) => p.category === "Mi Instan");

export const staffId = (name = "Rina"): string => {
  const u = mockDb.get().users.find((x) => x.name === name);
  if (!u) throw new Error(`seed tanpa ${name}`);
  return u.id;
};

export async function loginStaff(): Promise<void> {
  const res = await staffLogin();
  if (res.status !== 200) throw new Error("login staf gagal");
}

/** Render app dengan penyimpan draf opname di memori (jsdom tanpa IndexedDB); simpan dipakai ulang antar render. */
export function renderOpname(
  path: string,
  opname: OpnameDraftStore = memoryOpnameStore(),
) {
  const queryClient = createTestQueryClient();
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const utils = render(
    <DraftStoreContext.Provider value={memoryDraftStore()}>
      <OpnameStoreContext.Provider value={opname}>
        <AppProviders router={router} queryClient={queryClient} />
      </OpnameStoreContext.Provider>
    </DraftStoreContext.Provider>,
  );
  return { ...utils, router, opname, queryClient };
}

/** Kirim sesi ke server palsu: tiap barang Mi Instan dihitung `qty(nama)` (stok diset 100). */
export async function submitMiInstan(
  id: string,
  qty: (name: string) => number = () => 100,
  scope: OpnameScope = MI_INSTAN,
): Promise<StaffOpnameSession> {
  const products = mockDb
    .get()
    .products.filter((p) => p.category === scope.category);
  mockDb.update((s) => {
    for (const p of s.products.filter((x) => x.category === scope.category)) {
      s.stock[p.id] = 100;
    }
  });
  const res = await post("/api/staff/opname-sessions", {
    id,
    scope,
    deviceNow: Date.now(),
    items: products.map((p) => ({
      productId: p.id,
      qtyBase: qty(p.name),
      countedAt: Date.now() - 60_000,
    })),
  });
  if (res.status !== 201) throw new Error(`kirim sesi gagal: ${res.status}`);
  return json<StaffOpnameSession>(res);
}

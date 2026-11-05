// Bahan test draf opname (dipakai beberapa file *.test.ts(x); bukan kode app).
import type {
  OpnameError,
  OpnameSessionInput,
  StaffOpnameSession,
  StaffProduct,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { apiError } from "../drafts/sync-fixtures";
import { memoryOpnameStore, type OpnameDraftStore } from "./opname-draft-store";
import type { OpnameDraft } from "./opname-draft-types";
import type { OpnameSyncApi } from "./opname-sync";

export const product = (id: string, name: string): StaffProduct => ({
  id,
  name,
  category: "Mi Instan",
  isCurah: false,
  baseUnit: "pcs",
  status: "aktif",
  units: [{ id: `${id}-pcs`, name: "pcs", unitSize: 1, barcodes: [] }],
});

/** Sarimi (10 pcs, dibuka 10.05) dan Indomie (40 pcs, dibuka 10.01); daftar urut nama. */
export function opnameDraft(
  id: string,
  patch: Partial<OpnameDraft> = {},
): OpnameDraft {
  return {
    id,
    userId: "u-rina",
    createdAt: 1,
    updatedAt: 1,
    status: "queued",
    scope: { kind: "kategori", category: "Mi Instan" },
    products: [
      product("p-indomie", "Indomie Goreng"),
      product("p-mie-sedaap", "Mie Sedaap Soto"),
      product("p-sarimi", "Sarimi Ayam Bawang"),
    ],
    counts: {
      "p-sarimi": { qtyBase: 10, countedAt: 1_005 },
      "p-indomie": { qtyBase: 40, countedAt: 1_001 },
    },
    errors: [],
    ...patch,
  };
}

export async function opnameStoreWith(
  ...drafts: OpnameDraft[]
): Promise<OpnameDraftStore> {
  const store = memoryOpnameStore();
  for (const d of drafts) await store.put(d);
  return store;
}

export const opnameProblem = (errors: OpnameError[]) =>
  apiError(422, "VALIDATION", "Hitungan opname tidak valid", { errors });

/** API palsu yang mencatat isi kiriman. */
export function fakeOpnameApi(
  createSession?: (input: OpnameSessionInput) => Promise<StaffOpnameSession>,
) {
  const inputs: OpnameSessionInput[] = [];
  const api: OpnameSyncApi = {
    createSession: async (input) => {
      inputs.push(input);
      if (createSession) return createSession(input);
      return { id: input.id } as StaffOpnameSession;
    },
  };
  return { api, inputs, posted: () => inputs.map((i) => i.id) };
}

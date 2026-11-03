// Bahan test sync draf (dipakai beberapa file *.test.ts; bukan kode app).
import { ApiError } from "@/shared/api/fetcher";
import type {
  ReceiptError,
  ReceiptInput,
  StaffReceipt,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { type DraftStore, emptyForm, memoryDraftStore } from "./draft-store";
import type { DraftPhoto, ReceiptDraft } from "./draft-types";
import type { SyncApi } from "./sync";

const line: DraftLine = {
  lineId: "l1",
  product: {
    id: "p-indomie",
    name: "Indomie Goreng",
    category: null,
    baseUnit: "pcs",
    units: [{ id: "u-dus", name: "dus", unitSize: 40, barcodes: [] }],
  },
  unitId: "u-dus",
  newProduct: null,
  qty: 2,
  unitCostText: "112.000",
  expiryDate: null,
};

export const photo = (patch: Partial<DraftPhoto> = {}): DraftPhoto => ({
  id: "foto-1",
  blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])]),
  takenAt: 1,
  bytes: 3,
  uploaded: false,
  ...patch,
});

export function draft(
  id: string,
  patch: Partial<ReceiptDraft> = {},
): ReceiptDraft {
  return {
    id,
    userId: "u-rina",
    createdAt: 1,
    updatedAt: 1,
    status: "queued",
    form: {
      ...emptyForm("2026-11-02"),
      supplierName: "CV Sumber Rejeki",
      lines: [line],
    },
    photo: null,
    errors: [],
    ...patch,
  };
}

export async function storeWith(
  ...drafts: ReceiptDraft[]
): Promise<DraftStore> {
  const store = memoryDraftStore();
  for (const d of drafts) await store.put(d);
  return store;
}

export const apiError = (
  status: number,
  code: ApiError["code"],
  detail?: string,
  extra: Record<string, unknown> = {},
) =>
  new ApiError({
    status,
    code,
    ...(detail === undefined ? {} : { detail }),
    body: {
      type: "about:blank",
      title: "Galat",
      status,
      code,
      ...(detail === undefined ? {} : { detail }),
      ...extra,
    },
  });

export const networkError = () => new ApiError({ status: 0, code: "NETWORK" });

export const receiptProblem = (errors: ReceiptError[]) =>
  apiError(422, "VALIDATION", "Nota tidak valid", { errors });

type Handlers = {
  putPhoto?: (id: string) => Promise<void>;
  createReceipt?: (input: ReceiptInput) => Promise<StaffReceipt>;
};

/** API palsu yang mencatat urutan panggilan. */
export function fakeApi(handlers: Handlers = {}) {
  const calls: string[] = [];
  const inputs: ReceiptInput[] = [];
  const api: SyncApi = {
    putPhoto: async (id) => {
      calls.push(`PUT ${id}`);
      await handlers.putPhoto?.(id);
    },
    createReceipt: async (input) => {
      calls.push(`POST ${input.id}`);
      inputs.push(input);
      if (handlers.createReceipt) return handlers.createReceipt(input);
      return { id: input.id } as StaffReceipt;
    },
  };
  return { api, calls, inputs };
}

/** Promise yang ditahan sampai `release()` dipanggil. */
export function gate() {
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

export const ids = (drafts: ReceiptDraft[]) => drafts.map((d) => d.id);

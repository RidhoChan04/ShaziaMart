// Bahan test sync draf lewat server palsu (realSyncApi); bukan kode app.
import { expect, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  loginWithShift,
  post,
  staffLogin,
} from "@/mocks/handlers/test-helpers";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { emptyForm } from "./draft-store";
import type { ReceiptDraft } from "./draft-types";
import { draft } from "./sync-fixtures";

export const INDOMIE = "Indomie Goreng";
export const RECEIPTS = "/api/staff/receipts";
const NOW = Date.UTC(2026, 10, 3, 3); // 3 Nov 2026 10.00 WIB

const productOf = (name: string) => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
};
export const stockOf = (name: string) => mockDb.get().stock[productOf(name).id];
export const userIdOf = (name: string) => {
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
): DraftLine {
  const p = productOf(name);
  const unit = p.units.find((u) => u.name === unitName);
  if (!unit) throw new Error(`seed tanpa ${name} ${unitName}`);
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
    expiryDate: null,
  };
}

export function serverDraft(
  id: string,
  lines: DraftLine[],
  patch: Partial<ReceiptDraft> = {},
): ReceiptDraft {
  return draft(id, {
    userId: userIdOf("Rina"),
    form: {
      ...emptyForm("2026-11-02"),
      supplierName: "CV Sumber Rejeki",
      lines,
    },
    ...patch,
  });
}

export const indomie2dus = () => seedLine("l1", INDOMIE, "dus", 2, "112.000");

export async function switchStaff(name: string, pin: string): Promise<void> {
  await post("/api/staff/logout", {});
  expect((await staffLogin(name, pin)).status).toBe(200);
}

/** Shift kasir buka dan Rina masuk di realm staf; jam palsu 3 Nov 2026 10.00 WIB. */
export async function startServerSync(): Promise<void> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await loginWithShift(1_500_000);
  expect((await staffLogin()).status).toBe(200);
}

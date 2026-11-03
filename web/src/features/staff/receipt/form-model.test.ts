import { expect, test } from "vitest";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { emptyForm } from "../drafts/draft-store";
import type { DraftPhoto } from "../drafts/draft-types";
import {
  DUE_CHIPS,
  drawerNote,
  formTotal,
  lineCount,
  photoCaption,
} from "./form-model";

const line = (id: string, qty: number, cost: string): DraftLine => ({
  lineId: id,
  product: {
    id: "p",
    name: "Indomie",
    category: "Mi",
    baseUnit: "pcs",
    units: [],
  },
  unitId: "u",
  newProduct: null,
  qty,
  unitCostText: cost,
  expiryDate: null,
});

test("DUE_CHIPS", () => expect(DUE_CHIPS).toEqual([7, 14, 30]));

test("lineCount & formTotal", () => {
  const f = {
    ...emptyForm("2026-11-02"),
    lines: [line("a", 2, "112.000"), line("b", 2, "204000")],
  };
  expect(lineCount(f)).toBe(2);
  expect(formTotal(f)).toBe(632_000);
  expect(formTotal(emptyForm("2026-11-02"))).toBe(0);
});

test("formTotal null bila ada harga belum terbaca", () => {
  const f = {
    ...emptyForm("2026-11-02"),
    lines: [line("a", 2, "112000"), line("b", 1, "")],
  };
  expect(formTotal(f)).toBeNull();
  expect(formTotal({ ...f, lines: [line("a", 1, "abc")] })).toBeNull();
});

test("photoCaption: takenAt 14.12 WIB, 219_136 byte", () => {
  const p: DraftPhoto = {
    id: "x",
    blob: new Blob(),
    takenAt: Date.UTC(2026, 10, 2, 7, 12),
    bytes: 219_136,
    uploaded: false,
  };
  expect(photoCaption(p)).toBe("Diambil 14.12 · 214 KB");
});

test("drawerNote", () => {
  const shift = { kasirName: "Rina", openedAt: Date.UTC(2026, 10, 1, 0, 0) };
  expect(drawerNote(shift, 1_442_000)).toBe(
    "Dicatat sebagai uang keluar di shift Rina (buka 07.00). Di tutup shift muncul Bayar supplier −Rp1.442.000.",
  );
  expect(drawerNote(null, 1_442_000)).toBeNull();
});

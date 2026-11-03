import { describe, expect, test } from "vitest";
import type {
  ReceiptLine,
  ReceiptPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockReceipt } from "../db";
import { editChanges, paymentSummary } from "./audit";

const line = (patch: Partial<ReceiptLine> = {}): ReceiptLine => ({
  lineId: "l1",
  productId: "p1",
  productName: "Indomie Goreng",
  unitId: "u1",
  unitName: "dus",
  unitSize: 40,
  qty: 2,
  unitCost: 112_000,
  subtotal: 224_000,
  expiryDate: "2027-04-20",
  newProduct: false,
  ...patch,
});

const laci: ReceiptPayment = {
  timing: "sekarang",
  method: "tunai",
  cashSource: "laci",
  dueDate: null,
};
const nanti = (dueDate: string): ReceiptPayment => ({
  timing: "nanti",
  method: null,
  cashSource: null,
  dueDate,
});

const receipt = (patch: Partial<MockReceipt> = {}): MockReceipt => ({
  id: "r1",
  supplierId: "s1",
  notaDate: "2026-11-02",
  photoId: null,
  lines: [
    line(),
    line({
      lineId: "l2",
      productId: "p2",
      productName: "Gula Pasir",
      unitId: "u2",
      unitName: "kg",
      unitSize: 1000,
      qty: 50,
      unitCost: 16_200,
      subtotal: 810_000,
      expiryDate: null,
    }),
  ],
  payment: laci,
  paid: null,
  status: "aktif",
  createdById: "u",
  createdByName: "Rina",
  createdAt: 0,
  editedByName: null,
  editedAt: null,
  cancelledAt: null,
  ...patch,
});

const names: Record<string, string> = {
  s1: "CV Sumber Rejeki",
  s2: "Toko Grosir Makmur",
};
const supplierName = (id: string) => names[id] ?? "";

describe("paymentSummary", () => {
  test.each<[ReceiptPayment, string]>([
    [laci, "Bayar sekarang · Tunai · Dari laci kasir"],
    [
      { ...laci, cashSource: "pemilik" },
      "Bayar sekarang · Tunai · Uang pemilik",
    ],
    [
      { ...laci, method: "transfer", cashSource: null },
      "Bayar sekarang · Transfer",
    ],
    [nanti("2026-11-16"), "Bayar nanti · jatuh tempo 16 Nov 2026"],
  ])("%o → %s", (p, text) => {
    expect(paymentSummary(p)).toBe(text);
  });
});

describe("editChanges", () => {
  test("tanpa perubahan → []", () => {
    expect(editChanges(receipt(), receipt(), supplierName)).toEqual([]);
  });

  test("urutan: supplier, tanggal, per baris (jumlah, harga beli, ED), jatuh tempo", () => {
    const before = receipt({ payment: nanti("2026-11-16") });
    const after = receipt({
      supplierId: "s2",
      notaDate: "2026-11-01",
      payment: nanti("2026-11-30"),
      lines: [
        line({
          qty: 1,
          unitCost: 108_000,
          subtotal: 108_000,
          expiryDate: null,
        }),
        line({
          lineId: "l2",
          productName: "Gula Pasir",
          unitName: "kg",
          unitSize: 1000,
          qty: 48,
          unitCost: 16_200,
          subtotal: 777_600,
          expiryDate: "2027-01-05",
        }),
      ],
    });
    expect(editChanges(before, after, supplierName)).toEqual([
      "Supplier CV Sumber Rejeki → Toko Grosir Makmur",
      "Tanggal nota 2 Nov 2026 → 1 Nov 2026",
      "Indomie Goreng: jumlah 2 dus → 1 dus",
      "Indomie Goreng: harga beli Rp112.000 → Rp108.000",
      "Indomie Goreng: ED 20 Apr 2027 → —",
      "Gula Pasir: jumlah 50 kg → 48 kg",
      "Gula Pasir: ED — → 5 Jan 2027",
      "Jatuh tempo 16 Nov 2026 → 30 Nov 2026",
    ]);
  });

  test("cara bayar berganti → satu baris Pembayaran (tanpa baris Jatuh tempo)", () => {
    const before = receipt({ payment: nanti("2026-11-16") });
    const after = receipt({ payment: laci });
    expect(editChanges(before, after, supplierName)).toEqual([
      "Pembayaran Bayar nanti · jatuh tempo 16 Nov 2026 → Bayar sekarang · Tunai · Dari laci kasir",
    ]);
  });
});

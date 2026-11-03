import { expect, test } from "vitest";
import type { StaffUnit } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import {
  equivalence,
  lineProblems,
  lineSummary,
  newProductEquivalence,
  type UnitOption,
  unitOptions,
} from "./line-model";

const unit = (id: string, name: string, unitSize: number): StaffUnit => ({
  id,
  name,
  unitSize,
  barcodes: [],
});
const PCS = unit("u-pcs", "pcs", 1);
const INDOMIE = [PCS, unit("u-dus", "dus", 40)];
const GULA = [unit("u-kg", "kg", 1000)];

const line = (patch: Partial<DraftLine> = {}): DraftLine => ({
  lineId: "l1",
  product: {
    id: "p1",
    name: "Indomie Goreng",
    category: "Mi Instan",
    baseUnit: "pcs",
    units: INDOMIE,
  },
  unitId: "u-dus",
  newProduct: null,
  qty: 2,
  unitCostText: "112.000",
  expiryDate: "2027-04-20",
  ...patch,
});

const newLine = (patch: Partial<NonNullable<DraftLine["newProduct"]>> = {}) =>
  line({
    product: null,
    unitId: null,
    newProduct: {
      name: "Teh Botol",
      sellUnit: "botol",
      notaUnit: "dus",
      notaUnitSize: "24",
      barcode: "",
      ...patch,
    },
  });

test("unitOptions Indomie → [{label:'pcs', perEceran:1}, {label:'dus (isi 40)', perEceran:40}]; Gula → [{label:'kg', unitSize:1000, perEceran:1}]", () => {
  expect(unitOptions(INDOMIE)).toEqual([
    { unitId: "u-pcs", label: "pcs", unitSize: 1, perEceran: 1 },
    { unitId: "u-dus", label: "dus (isi 40)", unitSize: 40, perEceran: 40 },
  ]);
  expect(unitOptions(GULA)).toEqual([
    { unitId: "u-kg", label: "kg", unitSize: 1000, perEceran: 1 },
  ]);
});

test("equivalence: 2 × dus Indomie → '= 80 pcs'; pcs → null; karung isi 25 kg ×2 → '= 50 kg'", () => {
  const [pcs, dus] = unitOptions(INDOMIE) as [UnitOption, UnitOption];
  expect(equivalence(2, dus, PCS)).toBe("= 80 pcs");
  expect(equivalence(2, pcs, PCS)).toBeNull();
  const kg = unit("k", "kg", 1000);
  const karung = unitOptions([
    kg,
    unit("kr", "karung", 25000),
  ])[1] as UnitOption;
  expect(equivalence(2, karung, kg)).toBe("= 50 kg");
});

test("lineSummary: '2 dus × Rp112.000 · ED 20 Apr 2027' subtotal 224000; tanpa ED tanpa ' · ED'", () => {
  expect(lineSummary(line())).toEqual({
    title: "Indomie Goreng",
    detail: "2 dus × Rp112.000 · ED 20 Apr 2027",
    subtotal: 224000,
  });
  expect(lineSummary(line({ expiryDate: null })).detail).toBe(
    "2 dus × Rp112.000",
  );
});

test("lineSummary barang baru memakai satuan nota; harga kosong → subtotal null", () => {
  const s = lineSummary({ ...newLine(), unitCostText: "" });
  expect(s.title).toBe("Teh Botol");
  expect(s.detail).toBe("2 dus × — · ED 20 Apr 2027");
  expect(s.subtotal).toBeNull();
});

test("newProductEquivalence: 2 dus isi 24 botol → '= 48 botol'; satuan sama atau Isi < 2 → null", () => {
  const np = (patch: Parameters<typeof newLine>[0] = {}) =>
    newLine(patch).newProduct as NonNullable<DraftLine["newProduct"]>;
  expect(newProductEquivalence(2, np())).toBe("= 48 botol");
  expect(newProductEquivalence(2, np({ notaUnit: "botol" }))).toBeNull();
  expect(newProductEquivalence(2, np({ notaUnitSize: "1" }))).toBeNull();
  expect(newProductEquivalence(2, np({ notaUnitSize: "" }))).toBeNull();
});

test("lineProblems: baris sah → kosong; harga kosong → 'Harga beli belum diisi' pada unitCost", () => {
  expect(lineProblems(line())).toEqual([]);
  expect(lineProblems(line({ unitCostText: "" }))).toEqual([
    { lineId: "l1", field: "unitCost", message: "Harga beli belum diisi" },
  ]);
});

test("lineProblems barang baru: isi 1 → 'Satuan besar: isi berapa? (min. 2)'; barcode '123' → 'Barcode salah, scan ulang'", () => {
  const fields = lineProblems(
    newLine({ notaUnitSize: "1", barcode: "123" }),
  ).map((e) => [e.field, e.message]);
  expect(fields).toEqual([
    ["newNotaUnitSize", "Satuan besar: isi berapa? (min. 2)"],
    ["newBarcode", "Barcode salah, scan ulang"],
  ]);
});

test("lineProblems dengan otherLines: nama kembar → 'Nama sama dengan baris lain' pada baris ini saja", () => {
  const other = { ...newLine({ name: "teh botol" }), lineId: "l0" };
  expect(lineProblems(newLine(), [other]).map((e) => e.message)).toEqual([
    "Nama sama dengan baris lain",
  ]);
});

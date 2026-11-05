import { expect, test } from "vitest";
import {
  CHOOSABLE_REASONS,
  countedQtyBase,
  diffBadgeText,
  expiryStage,
  expiryWhenText,
  OPNAME_REASON_LABEL,
  removedText,
  sameScope,
  scopeLabel,
  unitLabel,
} from "./stock-rules";

test("label alasan & lingkup", () => {
  expect(OPNAME_REASON_LABEL.salah_input).toBe("Salah input sebelumnya");
  expect(OPNAME_REASON_LABEL.tidak_diketahui).toBe("Tidak diketahui");
  expect(scopeLabel({ kind: "semua", category: null })).toBe("Semua barang");
  expect(scopeLabel({ kind: "tanpa_kategori", category: null })).toBe(
    "Tanpa kategori",
  );
  expect(
    sameScope(
      { kind: "kategori", category: "Susu" },
      { kind: "kategori", category: "Susu" },
    ),
  ).toBe(true);
  expect(unitLabel("dus")).toBe("Dus");
});

test("semua label alasan persis teks rencana", () => {
  expect(OPNAME_REASON_LABEL).toEqual({
    rusak: "Rusak",
    hilang: "Hilang",
    kedaluwarsa: "Kedaluwarsa",
    salah_input: "Salah input sebelumnya",
    tidak_diketahui: "Tidak diketahui",
  });
});

test("alasan yang bisa dipilih staf: 4, urut chip, tanpa tidak_diketahui", () =>
  expect(CHOOSABLE_REASONS).toEqual([
    "rusak",
    "hilang",
    "kedaluwarsa",
    "salah_input",
  ]));

test("label lingkup kategori = nama kategori", () =>
  expect(scopeLabel({ kind: "kategori", category: "Mi Instan" })).toBe(
    "Mi Instan",
  ));

test("lingkup kategori tanpa nama kategori → RangeError", () =>
  expect(() => scopeLabel({ kind: "kategori", category: null })).toThrow(
    RangeError,
  ));

test.each([
  [
    { kind: "kategori", category: "Susu" },
    { kind: "kategori", category: "Mi Instan" },
    false,
  ],
  [
    { kind: "kategori", category: "Susu" },
    { kind: "semua", category: null },
    false,
  ],
  [
    { kind: "tanpa_kategori", category: null },
    { kind: "semua", category: null },
    false,
  ],
  [{ kind: "semua", category: null }, { kind: "semua", category: null }, true],
  [
    { kind: "tanpa_kategori", category: null },
    { kind: "tanpa_kategori", category: null },
    true,
  ],
] as const)("sameScope(%o, %o) = %s", (a, b, same) =>
  expect(sameScope(a, b)).toBe(same),
);

test.each([
  ["pcs", "Pcs"],
  ["bungkus", "Bungkus"],
  ["Dus", "Dus"],
  ["", ""],
])("unitLabel(%j) = %j", (name, label) => expect(unitLabel(name)).toBe(label));

test("dus + pcs: 3 dus isi 40 + 5 pcs = 125 (mockup 6)", () =>
  expect(
    countedQtyBase([
      { unitSize: 40, count: 3 },
      { unitSize: 1, count: 5 },
    ]),
  ).toBe(125));

test("nol sah; tanpa satuan = 0 (K16)", () => {
  expect(
    countedQtyBase([
      { unitSize: 40, count: 0 },
      { unitSize: 1, count: 0 },
    ]),
  ).toBe(0);
  expect(countedQtyBase([])).toBe(0);
});

test("curah: gram dari isian kg dihitung apa adanya", () =>
  expect(countedQtyBase([{ unitSize: 1, count: 1500 }])).toBe(1500));

test("jumlah negatif → RangeError", () =>
  expect(() => countedQtyBase([{ unitSize: 1, count: -1 }])).toThrow(
    RangeError,
  ));

test.each([
  ["pecahan", [{ unitSize: 1, count: 1.5 }]],
  ["NaN", [{ unitSize: 1, count: Number.NaN }]],
  ["isi satuan nol", [{ unitSize: 0, count: 3 }]],
  ["isi satuan pecahan", [{ unitSize: 2.5, count: 3 }]],
  ["perkalian tidak aman", [{ unitSize: 1000, count: 2 ** 50 }]],
  [
    "jumlah tidak aman",
    [
      { unitSize: 1, count: Number.MAX_SAFE_INTEGER },
      { unitSize: 1, count: 1 },
    ],
  ],
])("%s → RangeError", (_name, parts) =>
  expect(() => countedQtyBase(parts)).toThrow(RangeError),
);

test.each([
  ["2026-10-31", "lewat", "Lewat 2 hari"],
  ["2026-11-01", "lewat", "Lewat 1 hari"],
  ["2026-11-02", "segera", "Hari ini"],
  ["2026-11-04", "segera", "2 hari lagi"],
  ["2026-12-02", "segera", "30 hari lagi"],
  ["2026-12-03", null, "31 hari lagi"],
])("ED %s pada 2 Nov 2026 (30 hari) → %s, %s", (ed, stage, text) => {
  expect(expiryStage(ed, "2026-11-02", 30)).toBe(stage);
  expect(expiryWhenText(ed, "2026-11-02")).toBe(text);
});

test("batas segera mengikuti soonDays server", () => {
  expect(expiryStage("2026-11-02", "2026-11-02", 0)).toBe("segera");
  expect(expiryStage("2026-11-03", "2026-11-02", 0)).toBeNull();
  expect(expiryStage("2026-11-09", "2026-11-02", 7)).toBe("segera");
});

test("lewat tahun & bulan kabisat dihitung per hari kalender", () => {
  expect(expiryWhenText("2027-01-01", "2026-12-31")).toBe("1 hari lagi");
  expect(expiryWhenText("2028-02-28", "2028-03-01")).toBe("Lewat 2 hari");
});

test("tanggal tidak sah atau soonDays bukan bulat non-negatif → RangeError", () => {
  expect(() => expiryStage("2026-02-30", "2026-11-02", 30)).toThrow(RangeError);
  expect(() => expiryWhenText("2026-11-02", "02/11/2026")).toThrow(RangeError);
  expect(() => expiryStage("2026-11-02", "2026-11-02", -1)).toThrow(RangeError);
  expect(() => expiryStage("2026-11-02", "2026-11-02", 1.5)).toThrow(
    RangeError,
  );
});

test("teks selisih & jumlah dikeluarkan", () => {
  expect(diffBadgeText(-7, 1, "pcs")).toBe("Kurang 7 pcs");
  expect(diffBadgeText(4, 1, "pcs")).toBe("Lebih 4 pcs");
  expect(diffBadgeText(-1500, 1000, "kg")).toBe("Kurang 1,5 kg");
  expect(removedText(6, 1, "pcs", false)).toBe("6");
  expect(removedText(1500, 1000, "kg", true)).toBe("1,5 kg");
});

test("teks selisih memakai pengelompokan ribuan formatQty", () =>
  expect(diffBadgeText(1200, 1, "pcs")).toBe("Lebih 1.200 pcs"));

test("selisih nol bukan selisih → RangeError", () =>
  expect(() => diffBadgeText(0, 1, "pcs")).toThrow(RangeError));

test("jumlah dikeluarkan bukan curah: angka tanpa satuan, ribuan dikelompokkan", () =>
  expect(removedText(1200, 1, "bungkus", false)).toBe("1.200"));

test.each([0, -3, 1.5])("jumlah dikeluarkan %s → RangeError", (qty) =>
  expect(() => removedText(qty, 1, "pcs", false)).toThrow(RangeError),
);

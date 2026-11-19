import { expect, test } from "vitest";
import { type ChunkGraphInfo, sharedChunkName } from "./chunk-names";

const ROOT = "D:/web/src";
const ENTRY = "D:/web/index.html";

/** Graf mini: `importers` statis per modul; akar app = target `import()` dari rute (di entri). */
function graph(importers: Record<string, string[]>) {
  const dynamicRoots = new Set([
    `${ROOT}/features/owner/index.ts`,
    `${ROOT}/features/owner/toko/index.ts`,
    `${ROOT}/features/owner/laporan/index.ts`,
    `${ROOT}/features/kasir/index.ts`,
    `${ROOT}/features/staff/index.ts`,
    `${ROOT}/features/owner/products/import/read-xlsx.ts`,
  ]);
  return (id: string): ChunkGraphInfo | null => {
    if (id === ENTRY)
      return { isEntry: true, importers: [], dynamicImporters: [] };
    if (!(id in importers) && !dynamicRoots.has(id)) return null;
    return {
      isEntry: false,
      importers: importers[id] ?? [],
      dynamicImporters: dynamicRoots.has(id) ? [`${ROOT}/app/routes.tsx`] : [],
    };
  };
}

const OWNER = `${ROOT}/features/owner/index.ts`;
const TOKO = `${ROOT}/features/owner/toko/index.ts`;
const LAPORAN = `${ROOT}/features/owner/laporan/index.ts`;
const KASIR = `${ROOT}/features/kasir/index.ts`;
const STAFF = `${ROOT}/features/staff/index.ts`;

test("modul yang terjangkau statis dari entri utama tetap di index", () => {
  const get = graph({
    "m.ts": [OWNER, "main.tsx"],
    "main.tsx": [ENTRY],
  });
  expect(sharedChunkName("m.ts", get)).toBeNull();
});

test("modul yang hanya dipakai satu app tetap di chunk app itu", () => {
  const get = graph({ "m.ts": ["page.tsx"], "page.tsx": [KASIR] });
  expect(sharedChunkName("m.ts", get)).toBeNull();
});

test("nama = app pemakai urut abjad, tidak bergantung urutan import", () => {
  const get = graph({ "m.ts": [STAFF, "k.tsx"], "k.tsx": [KASIR] });
  expect(sharedChunkName("m.ts", get)).toBe("bersama-kasir-staff");
});

test("toko dan laporan ikut pemilik: chunknya dimuat setelah chunk pemilik", () => {
  const get = graph({
    "a.ts": [OWNER, TOKO],
    "b.ts": [LAPORAN, "c.ts"],
    "c.ts": [OWNER, KASIR],
  });
  expect(sharedChunkName("a.ts", get)).toBe("bersama-pemilik");
  expect(sharedChunkName("b.ts", get)).toBe("bersama-kasir-pemilik");
});

test("tanpa pemilik, toko dan laporan tetap disebut (tidak masuk unduhan awal pemilik)", () => {
  const get = graph({ "m.ts": [TOKO, LAPORAN] });
  expect(sharedChunkName("m.ts", get)).toBe("bersama-laporan-toko");
});

test("target import() lain dinamai menurut berkasnya; siklus import aman", () => {
  const read = `${ROOT}/features/owner/products/import/read-xlsx.ts`;
  const get = graph({
    "m.ts": [read, "x.ts"],
    "x.ts": ["y.ts", STAFF],
    "y.ts": ["x.ts"],
  });
  expect(sharedChunkName("m.ts", get)).toBe("bersama-read-xlsx-staff");
});

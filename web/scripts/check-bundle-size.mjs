// Gagal bila ukuran gzip chunk JS hasil `vite build` melewati anggaran.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1024;
const budgets = [
  { label: "utama", prefix: "index-", max: 130 * KB },
  { label: "kasir", prefix: "kasir-", max: 50 * KB },
  { label: "owner", prefix: "owner-", max: 50 * KB },
  { label: "bersama", prefix: "bersama-", max: 35 * KB },
  { label: "laporan", prefix: "laporan-", max: 30 * KB },
  { label: "toko", prefix: "toko-", max: 30 * KB },
  { label: "staff", prefix: "staff-", max: 50 * KB },
  { label: "problem", prefix: "problem-", max: 30 * KB },
];
const OTHER_MAX = 25 * KB;
// Tiga app terpisah; satu pengguna hanya memuat utama + satu app (K15).
const TOTAL_MAX = 280 * KB;
// Unduhan awal app pemilik = Σ gzip chunk yang dimuat statis saat /owner dibuka
// (graf import statis dari index- dan owner-). Anggaran = nilai graf yang sama diukur
// pada baseline 932a227 (2026-11-19): 210,4 KB. Tidak boleh naik (S9); layar baru harus lazy.
const PEMILIK_AWAL_MAX = 210.4 * KB;

const dir = join(import.meta.dirname, "..", "dist", "assets");
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
if (files.length === 0) {
  console.error(
    "Tidak ada chunk JS di dist/assets — jalankan `npm run build` dulu.",
  );
  process.exit(1);
}

/** Chunk yang ikut dimuat statis oleh `root` (import statis, bukan `import(...)` dinamis). */
function staticDeps(root, seen = new Set()) {
  if (seen.has(root)) return seen;
  seen.add(root);
  const code = readFileSync(join(dir, root), "utf8");
  for (const m of code.matchAll(
    /(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g,
  )) {
    if (files.includes(m[1])) staticDeps(m[1], seen);
  }
  return seen;
}

const sizes = new Map();
let total = 0;
const failures = [];
for (const file of files) {
  const size = gzipSync(readFileSync(join(dir, file))).length;
  sizes.set(file, size);
  total += size;
  const budget = budgets.find((b) => file.startsWith(b.prefix));
  const max = budget?.max ?? OTHER_MAX;
  const status = size > max ? "MELEBIHI" : "ok";
  console.log(
    `${status.padEnd(8)} ${file.padEnd(48)} ${(size / KB).toFixed(1)} / ${(max / KB).toFixed(0)} KB`,
  );
  if (size > max) failures.push(file);
}
const roots = files.filter(
  (f) => f.startsWith("index-") || f.startsWith("owner-"),
);
const pemilik = new Set();
for (const root of roots) staticDeps(root, pemilik);
const pemilikAwal = [...pemilik].reduce((n, f) => n + sizes.get(f), 0);
console.log(
  `pemilik-awal ${(pemilikAwal / KB).toFixed(1)} / ${(PEMILIK_AWAL_MAX / KB).toFixed(1)} KB (${[...pemilik].join(", ")})`,
);
if (pemilikAwal > PEMILIK_AWAL_MAX) failures.push("pemilik-awal");
console.log(
  `total    ${(total / KB).toFixed(1)} / ${(TOTAL_MAX / KB).toFixed(0)} KB`,
);
if (total > TOTAL_MAX) failures.push("total");

if (failures.length > 0) {
  console.error(`Anggaran ukuran bundle terlampaui: ${failures.join(", ")}`);
  process.exit(1);
}

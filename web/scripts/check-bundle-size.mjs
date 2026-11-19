// Gagal bila ukuran gzip chunk JS hasil `vite build` melewati anggaran.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1024;
// Anggaran per nama chunk (nama berkas tanpa `-<hash 8>.js`), dalam KB gzip.
const budgets = [
  { name: "index", label: "utama", max: 130 },
  { name: "kasir", max: 50 },
  { name: "owner", max: 50 },
  { name: "staff", max: 50 },
  { name: "laporan", max: 30 },
  { name: "toko", max: 30 },
  // Chunk bersama: modul yang dimuat statis oleh ≥ 2 app lazy, dinamai menurut app pemakainya
  // (src/app/chunk-names.ts lewat vite.config.ts). Nama baru muncul bila ada modul yang dipakai
  // bersama oleh kombinasi app yang baru — beri anggaran di sini dengan sengaja.
  { name: "bersama-kasir-pemilik-staff", max: 35 },
  { name: "bersama-pemilik", max: 15 },
  { name: "bersama-pemilik-staff", max: 15 },
  { name: "bersama-kasir-pemilik", max: 5 },
  { name: "bersama-kasir-staff", max: 5 },
];
// Chunk lain (pustaka pihak ketiga yang dipecah otomatis lewat barrel lucide-react/radix-ui/
// @tanstack, read-xlsx, workbox): masing-masing ≤ 25 KB.
const OTHER_MAX = 25;
// Tiga app terpisah; satu pengguna hanya memuat utama + satu app (K15).
// 280 → 300 KB (keputusan pemilik S9, F3c-2a, 19 Nov 2026): total terukur 280,6 KB setelah
// layar kas kasir; anggaran per app tetap, layar baru lazy, dan pemilik-awal tidak bertambah.
const TOTAL_MAX = 300 * KB;
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

const failures = [];
/** Nama chunk dari nama berkas `<nama>-<hash 8 karakter>.js`. */
function chunkName(file) {
  const match = /^(.+)-[\w-]{8}\.js$/.exec(file);
  if (match === null) {
    console.error(`Nama berkas chunk tidak dikenali: ${file}`);
    failures.push(`nama-${file}`);
    return file;
  }
  return match[1];
}
const names = new Map(files.map((f) => [f, chunkName(f)]));

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
for (const file of files) {
  const size = gzipSync(readFileSync(join(dir, file))).length;
  sizes.set(file, size);
  total += size;
  const name = names.get(file);
  const budget = budgets.find((b) => b.name === name);
  if (budget === undefined && name.startsWith("bersama-")) {
    console.error(
      `Chunk bersama "${name}" belum punya anggaran — tambahkan di budgets.`,
    );
    failures.push(`${name}-tanpa-anggaran`);
  }
  const max = (budget?.max ?? OTHER_MAX) * KB;
  const status = size > max ? "MELEBIHI" : "ok";
  console.log(
    `${status.padEnd(8)} ${file.padEnd(48)} ${(size / KB).toFixed(1)} / ${(max / KB).toFixed(0)} KB`,
  );
  if (size > max) failures.push(file);
}
// Anggaran bernama harus punya tepat satu chunk; tanpa itu penamaan/pemisahan berubah diam-diam.
for (const b of budgets) {
  const count = files.filter((f) => names.get(f) === b.name).length;
  if (count !== 1) {
    console.error(
      `Chunk "${b.name}" (anggaran ${b.label ?? b.name}) ada ${count}, seharusnya 1.`,
    );
    failures.push(`${b.name}-${count === 0 ? "hilang" : "ganda"}`);
  }
}
const roots = files.filter((f) => ["index", "owner"].includes(names.get(f)));
for (const name of ["index", "owner"]) {
  if (!roots.some((f) => names.get(f) === name)) {
    console.error(`Chunk akar pemilik-awal "${name}" tidak ditemukan.`);
    failures.push(`pemilik-awal-akar-${name}`);
  }
}
const pemilik = new Set();
for (const root of roots) staticDeps(root, pemilik);
if (pemilik.size <= roots.length) {
  console.error(
    "pemilik-awal: tidak ada chunk yang di-import statis oleh index-/owner- — format import berubah? Perbarui regex staticDeps.",
  );
  failures.push("pemilik-awal-graf");
}
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

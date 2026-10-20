// Gagal bila ukuran gzip chunk JS hasil `vite build` melewati anggaran.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1024;
const budgets = [
  { label: "utama", prefix: "index-", max: 130 * KB },
  { label: "kasir", prefix: "kasir-", max: 50 * KB },
  { label: "owner", prefix: "owner-", max: 50 * KB },
];
const OTHER_MAX = 25 * KB;
const TOTAL_MAX = 220 * KB;

const dir = join(import.meta.dirname, "..", "dist", "assets");
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
if (files.length === 0) {
  console.error(
    "Tidak ada chunk JS di dist/assets — jalankan `npm run build` dulu.",
  );
  process.exit(1);
}

let total = 0;
const failures = [];
for (const file of files) {
  const size = gzipSync(readFileSync(join(dir, file))).length;
  total += size;
  const budget = budgets.find((b) => file.startsWith(b.prefix));
  const max = budget?.max ?? OTHER_MAX;
  const status = size > max ? "MELEBIHI" : "ok";
  console.log(
    `${status.padEnd(8)} ${file.padEnd(48)} ${(size / KB).toFixed(1)} / ${(max / KB).toFixed(0)} KB`,
  );
  if (size > max) failures.push(file);
}
console.log(
  `total    ${(total / KB).toFixed(1)} / ${(TOTAL_MAX / KB).toFixed(0)} KB`,
);
if (total > TOTAL_MAX) failures.push("total");

if (failures.length > 0) {
  console.error(`Anggaran ukuran bundle terlampaui: ${failures.join(", ")}`);
  process.exit(1);
}

// Penamaan chunk bersama untuk vite.config.ts (`build.rolldownOptions.output.codeSplitting`).
// Nama diturunkan dari app yang memuat modul secara statis, bukan dari modul yang kebetulan
// dipilih Rolldown sebagai nama chunk, sehingga stabil antar-build dan tiap chunk bersama
// punya anggaran bernama di scripts/check-bundle-size.mjs.

/** Akar app lazy (target `import()` di rute) → label app di nama chunk. */
const APP_ROOTS: ReadonlyArray<readonly [suffix: string, label: string]> = [
  ["/src/features/owner/index.ts", "pemilik"],
  ["/src/features/owner/toko/index.ts", "toko"],
  ["/src/features/owner/laporan/index.ts", "laporan"],
  ["/src/features/kasir/index.ts", "kasir"],
  ["/src/features/staff/index.ts", "staff"],
];

/**
 * App yang rutenya anak OwnerLayout: saat chunknya dimuat, chunk pemilik selalu sudah dimuat.
 * Modul yang dipakai pemilik dan salah satu app ini cukup ikut chunk bersama milik pemilik.
 */
const INSIDE_OWNER: ReadonlySet<string> = new Set(["toko", "laporan"]);

/** Subset `ModuleInfo` Rolldown yang dibutuhkan untuk menelusuri graf import. */
export interface ChunkGraphInfo {
  readonly isEntry: boolean;
  readonly importers: readonly string[];
  readonly dynamicImporters: readonly string[];
}

function appLabel(id: string): string {
  const path = id.replaceAll("\\", "/").split("?")[0] ?? id;
  const known = APP_ROOTS.find(([suffix]) => path.endsWith(suffix));
  if (known) return known[1];
  // Target `import()` lain (mis. read-xlsx): label = nama berkas, tetap stabil.
  const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  return base.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
}

type GetInfo = (moduleId: string) => ChunkGraphInfo | null;

/** App lazy yang memuat `id` lewat import statis; `null` bila entri utama ikut memuatnya. */
function appsLoading(id: string, getInfo: GetInfo): Set<string> | null {
  const apps = new Set<string>();
  const seen = new Set([id]);
  const stack = [id];
  for (let m = stack.pop(); m !== undefined; m = stack.pop()) {
    const info = getInfo(m);
    if (!info) continue;
    if (info.isEntry) return null;
    if (info.dynamicImporters.length > 0) apps.add(appLabel(m));
    const next = info.importers.filter((importer) => !seen.has(importer));
    for (const importer of next) seen.add(importer);
    stack.push(...next);
  }
  return apps;
}

/**
 * Nama chunk bersama untuk modul `id`: `bersama-<app…>` (urut abjad) bila modul dimuat statis
 * oleh ≥ 2 app lazy, atau `null` (biarkan di chunk entri/app-nya) bila modul terjangkau statis
 * dari entri utama atau hanya dipakai satu app.
 */
export function sharedChunkName(id: string, getInfo: GetInfo): string | null {
  const apps = appsLoading(id, getInfo);
  if (apps === null || apps.size < 2) return null;
  if (apps.has("pemilik")) for (const app of INSIDE_OWNER) apps.delete(app);
  return `bersama-${[...apps].sort().join("-")}`;
}

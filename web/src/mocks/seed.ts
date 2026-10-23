const SEED = 20261017;

/** PRNG deterministik mulberry32; tanpa argumen memakai seed tetap proyek. */
export function rng(seed: number = SEED): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jenis ID: bagian waktu UUIDv7 tetap per jenis, jadi urut dan stabil antar-run. */
export const KIND = {
  store: 0,
  user: 1,
  product: 2,
  unit: 3,
  customer: 4,
  credit: 5,
} as const;

export function makeId(kind: number, n: number): string {
  const ts = (0x01900000 + kind).toString(16).padStart(8, "0");
  return `${ts}-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

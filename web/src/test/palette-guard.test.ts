import { expect, test } from "vitest";
import styles from "@/app/styles.css?raw";

// `--color-*: initial` membuang palet bawaan Tailwind: kelas seperti `bg-gray-100` atau
// `text-red-600` tidak menghasilkan CSS apa pun dan gagal diam-diam. Penjaga ini menolak
// kelas warna yang namanya bukan token di app/styles.css.

const TOKENS = new Set([
  ...[...styles.matchAll(/--color-([a-z][a-z0-9-]*)\s*:/g)].map((m) => m[1]),
  "transparent",
  "current",
  "inherit",
]);

/** Nilai utilitas berawalan sama yang bukan warna (ukuran teks, perataan, gaya garis, sisi border, gradien). */
const NOT_A_COLOUR =
  /^(xs|sm|base|md|lg|xl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|none|solid|dashed|dotted|double|hidden|collapse|separate|inset|inner|auto|fixed|cover|contain|repeat|no-repeat|offset(-\d+)?|linear-(\d+|to-[a-z]+)|[xytblrse](-\d+)?)$/;

const COLOUR_CLASS =
  /(?<![\w./-])(?:bg|text|border(?:-[xytblrse])?|ring(?:-offset)?|outline|divide|fill|stroke|from|via|to|shadow|decoration|accent|caret|placeholder)-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\/[\w.[\]]+)?(?![\w-])/g;

/** Kelas warna di `text` yang namanya bukan token, sebagai `baris kelas`. */
function offenders(text: string): string[] {
  const out: string[] = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(COLOUR_CLASS)) {
      const name = m[1] ?? "";
      if (!TOKENS.has(name) && !NOT_A_COLOUR.test(name)) {
        out.push(`${i + 1} ${m[0]}`);
      }
    }
  });
  return out;
}

// Test tidak ikut dipindai: isinya tidak menjadi CSS (mis. atribut SVG `text-anchor`).
const sources = import.meta.glob<string>(
  ["/src/**/*.tsx", "!/src/**/*.test.tsx", "!/src/shared/api/gen/**"],
  { query: "?raw", import: "default", eager: true },
);

test("penjaga mengenali kelas palet bawaan dan meloloskan token serta utilitas bukan warna", () => {
  expect(TOKENS.has("primary")).toBe(true);
  expect(TOKENS.has("chart-1-now")).toBe(true);
  expect(
    offenders(
      'className="bg-gray-100 hover:text-red-600 border-blue-500/50 ring-primay"',
    ),
  ).toEqual([
    "1 bg-gray-100",
    "1 text-red-600",
    "1 border-blue-500/50",
    "1 ring-primay",
  ]);
  expect(
    offenders(
      'className="text-sm text-right bg-primary/10 border-t border-border outline-none outline-offset-2 divide-y shadow-sm bg-linear-to-t from-bg to-transparent text-white/80 placeholder:text-muted/70"',
    ),
  ).toEqual([]);
  // Path impor bukan kelas: `../drafts/to-input` pernah terbaca sebagai `to-input`.
  expect(
    offenders(
      'import { x } from "../drafts/to-input"; import "./bg-tile.css";',
    ),
  ).toEqual([]);
});

/** Nilai hex token `--color-{name}` pertama di styles.css (blok @theme). */
function tokenHex(name: string): string {
  const m = styles.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!m?.[1]) throw new Error(`token ${name} tanpa hex`);
  return m[1];
}

/** Rasio kontras WCAG 2 dua warna hex. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Palet grafik dicek validator dataviz (lightness, chroma, ΔE CVD, kontras); penjaga ini mengunci
// kontras batang agar token tidak diganti diam-diam. Batang yang tepinya menyentuh kartu putih
// langsung (omzet/hari ini, bucket berjalan) wajib ≥ 3:1 terhadap putih.
test.each(["chart-1", "chart-1-now"])(
  "batang %s kontras ≥ 3:1 terhadap kartu",
  (name) => {
    expect(
      contrast(tokenHex(name), tokenHex("surface")),
    ).toBeGreaterThanOrEqual(3);
  },
);

// Laba kotor (keputusan pemilik 18 Nov, opsi B+): isi hijau muda chart-3 sengaja hanya 1,54:1
// terhadap putih, jadi batasnya dipikul garis tepi 1,5 px chart-1 di tiap batang laba dan kotak
// legenda. Aturan yang dikunci: garis tepi chart-1 vs putih 5,32:1 (≥ 3) dan isi chart-3 vs
// chart-1 3,46:1 (≥ 3) — isi terbaca terhadap garis tepinya sendiri dan terhadap batang omzet di
// atasnya. Catatan: terhadap batang omzet berjalan (chart-1-now) isi hanya 2,31:1.
test("laba kotor: isi chart-3 lembut, batas dipikul garis tepi chart-1", () => {
  const fill = tokenHex("chart-3");
  const outline = tokenHex("chart-1");
  expect(contrast(fill, tokenHex("surface"))).toBeCloseTo(1.54, 2);
  expect(contrast(outline, tokenHex("surface"))).toBeCloseTo(5.32, 2);
  expect(contrast(outline, tokenHex("surface"))).toBeGreaterThanOrEqual(3);
  expect(contrast(fill, outline)).toBeCloseTo(3.46, 2);
  expect(contrast(fill, outline)).toBeGreaterThanOrEqual(3);
});

test("kelas warna Tailwind di src/**/*.tsx hanya memakai token dari app/styles.css", () => {
  expect(Object.keys(sources).length).toBeGreaterThan(50);
  const found = Object.entries(sources).flatMap(([file, text]) =>
    offenders(text).map((o) => `${file}:${o}`),
  );
  expect(found).toEqual([]);
});

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
  /(?<![\w-])(?:bg|text|border(?:-[xytblrse])?|ring(?:-offset)?|outline|divide|fill|stroke|from|via|to|shadow|decoration|accent|caret|placeholder)-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\/[\w.[\]]+)?(?![\w-])/g;

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
});

test("kelas warna Tailwind di src/**/*.tsx hanya memakai token dari app/styles.css", () => {
  expect(Object.keys(sources).length).toBeGreaterThan(50);
  const found = Object.entries(sources).flatMap(([file, text]) =>
    offenders(text).map((o) => `${file}:${o}`),
  );
  expect(found).toEqual([]);
});

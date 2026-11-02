/** Lebar karakter dalam em (angka tebal font tampilan); tak dikenal = lebar digit. */
const DIGIT_EM = 0.64;
const CHAR_EM: Record<string, number> = {
  R: 0.68,
  p: 0.64,
  ".": 0.28,
  ",": 0.28,
  "-": 0.42,
  "−": 0.42,
  " ": 0.28,
};

function textEm(text: string): number {
  let em = 0;
  for (const ch of text) em += CHAR_EM[ch] ?? DIGIT_EM;
  return em;
}

/**
 * Ukuran huruf (px) terbesar yang membuat `text` muat satu baris di `availablePx`,
 * dijepit ke `range`. Belum terukur (<= 0) = `max`.
 */
export function fitFontSize(
  text: string,
  availablePx: number,
  range: { max: number; min: number },
): number {
  if (availablePx <= 0) return range.max;
  const fit = Math.floor(availablePx / textEm(text));
  return Math.min(range.max, Math.max(range.min, fit));
}

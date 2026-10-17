function assertNonNegativeInteger(n: number, name: string): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${name} harus bilangan bulat non-negatif: ${n}`);
  }
}

function safeProduct(a: number, b: number): number {
  const p = a * b;
  if (!Number.isSafeInteger(p)) {
    throw new RangeError(`Hasil perkalian di luar batas aman: ${a} x ${b}`);
  }
  return p;
}

/** Pembagian bulat, setengah ke atas, untuk bilangan non-negatif. */
export function roundHalfUp(numerator: number, denominator: number): number {
  assertNonNegativeInteger(numerator, "Pembilang");
  assertNonNegativeInteger(denominator, "Penyebut");
  if (denominator === 0) throw new RangeError("Penyebut tidak boleh nol");
  const x = 2 * numerator + denominator;
  const y = 2 * denominator;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new RangeError("Hasil di luar batas aman");
  }
  // floor(x / y) dengan koreksi galat pembulatan floating point.
  let q = Math.floor(x / y);
  if (q * y > x) q -= 1;
  else if ((q + 1) * y <= x) q += 1;
  return q;
}

/** kg -> gram. Desimal `,` atau `.`, maks 3 desimal, harus > 0. */
export function parseKg(input: string): number | null {
  const m = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(input.trim());
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(3, "0"));
  const gram = whole * 1000 + frac;
  if (!Number.isSafeInteger(gram) || gram <= 0) return null;
  return gram;
}

function kgText(gram: number): string {
  assertNonNegativeInteger(gram, "Gram");
  const whole = Math.floor(gram / 1000);
  const frac = String(gram % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return frac ? `${whole},${frac}` : String(whole);
}

export function formatGram(gram: number, unit: "kg" | "L" = "kg"): string {
  return `${kgText(gram)} ${unit}`;
}

export function formatApproxKg(gram: number, unit: "kg" | "L" = "kg"): string {
  return `≈ ${formatGram(gram, unit)}`;
}

/** Subtotal baris: `roundHalfUp(price x qtyBase, unitSize)`. */
export function lineSubtotal(
  price: number,
  qtyBase: number,
  unitSize: number,
): number {
  return roundHalfUp(safeProduct(price, qtyBase), unitSize);
}

/** Kuantitas dasar dari nominal uang: `roundHalfUp(amount x unitSize, price)`. */
export function qtyBaseFromAmount(
  amount: number,
  price: number,
  unitSize: number,
): number {
  return roundHalfUp(safeProduct(amount, unitSize), price);
}

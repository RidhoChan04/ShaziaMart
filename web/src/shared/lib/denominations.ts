const SMALL_STEPS = [5000, 10000, 20000, 50000, 100000];
const LARGE_STEPS = [10000, 50000, 100000];
const BIG_STEP = 100000;
const MAX_OPTIONS = 3;

function ceilTo(n: number, step: number): number {
  return Math.ceil(n / step) * step;
}

/** Uang pas, lalu maksimal 3 nominal lebih besar (naik, unik). `total <= 0` -> `[]`. */
export function quickCashOptions(total: number): number[] {
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Total harus bilangan bulat aman: ${total}`);
  }
  if (total <= 0) return [];

  const steps = total < 50000 ? SMALL_STEPS : LARGE_STEPS;
  const larger = [...new Set(steps.map((s) => ceilTo(total, s)))]
    .filter((v) => v > total)
    .sort((a, b) => a - b)
    .slice(0, MAX_OPTIONS);

  if (total >= 50000) {
    let next = (larger.at(-1) ?? ceilTo(total, BIG_STEP)) + BIG_STEP;
    while (larger.length < MAX_OPTIONS) {
      larger.push(next);
      next += BIG_STEP;
    }
  }
  return [total, ...larger];
}

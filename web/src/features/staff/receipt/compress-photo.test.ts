import { afterEach, expect, test, vi } from "vitest";
import {
  compressPhoto,
  FIRST_ATTEMPT,
  nextAttempt,
  PHOTO_MAX_BYTES,
} from "./compress-photo";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test.each([
  [{ longSide: 1600, quality: 0.8 }, 250_000, null],
  [{ longSide: 1600, quality: 0.8 }, 400_000, { longSide: 1600, quality: 0.7 }],
  [{ longSide: 1600, quality: 0.5 }, 400_000, { longSide: 1600, quality: 0.4 }],
  [{ longSide: 1600, quality: 0.4 }, 400_000, { longSide: 1280, quality: 0.8 }],
  [{ longSide: 819, quality: 0.4 }, 400_000, null],
])("nextAttempt %j dengan %i byte → %j", (attempt, bytes, expected) => {
  expect(nextAttempt(attempt, bytes)).toEqual(expected);
});

test("ambang 300 KB: tepat 300 KB diterima", () => {
  expect(nextAttempt(FIRST_ATTEMPT, PHOTO_MAX_BYTES)).toBeNull();
  expect(nextAttempt(FIRST_ATTEMPT, PHOTO_MAX_BYTES + 1)).not.toBeNull();
});

/** Kanvas palsu: ukuran hasil JPEG bergantung pada sisi terpanjang dan mutu. */
function stubCanvas(
  width: number,
  height: number,
  bytesAt: (q: number, side: number) => number,
) {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width, height, close })),
  );
  const drawn: { w: number; h: number }[] = [];
  const qualities: number[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) =>
        drawn.push({ w, h }),
    }),
    toBlob(cb: (b: Blob | null) => void, type: string, q: number) {
      qualities.push(q);
      cb(
        new Blob(
          [new Uint8Array(bytesAt(q, Math.max(this.width, this.height)))],
          {
            type,
          },
        ),
      );
    },
  };
  const real = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "canvas" ? (canvas as unknown as HTMLCanvasElement) : real(tag),
  );
  return { close, drawn, qualities, canvas };
}

test("foto kecil: satu percobaan 1600/0.8, hasil JPEG, bitmap ditutup", async () => {
  const s = stubCanvas(4000, 3000, () => 200_000);
  const out = await compressPhoto(new Blob(["x"], { type: "image/png" }));
  expect(out.bytes).toBe(200_000);
  expect(out.blob.type).toBe("image/jpeg");
  expect(s.qualities).toEqual([0.8]);
  expect(s.canvas.width).toBe(1600);
  expect(s.canvas.height).toBe(1200);
  expect(s.close).toHaveBeenCalled();
  expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), {
    imageOrientation: "from-image",
  });
});

test("tidak diperbesar bila foto lebih kecil dari 1600 px", async () => {
  const s = stubCanvas(800, 600, () => 100_000);
  await compressPhoto(new Blob(["x"]));
  expect(s.canvas.width).toBe(800);
  expect(s.canvas.height).toBe(600);
});

test("terlalu besar → mutu turun bertahap sampai ≤ 300 KB", async () => {
  const s = stubCanvas(4000, 3000, (q) => Math.round(q * 500_000));
  const out = await compressPhoto(new Blob(["x"]));
  // 0.8→400k, 0.7→350k, 0.6→300k (diterima)
  expect(s.qualities).toEqual([0.8, 0.7, 0.6]);
  expect(out.bytes).toBe(300_000);
});

test("tetap besar → sisi dikecilkan, akhirnya diterima apa adanya", async () => {
  const s = stubCanvas(4000, 3000, () => 900_000);
  const out = await compressPhoto(new Blob(["x"]));
  expect(out.bytes).toBe(900_000);
  expect(s.canvas.width).toBeLessThan(1600);
  expect(Math.max(...s.drawn.map((d) => d.w))).toBe(1600);
});

test("berkas bukan gambar → galat jelas", async () => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => {
      throw new Error("bad");
    }),
  );
  await expect(compressPhoto(new Blob(["x"]))).rejects.toThrow(
    "Foto tidak bisa dibaca",
  );
});

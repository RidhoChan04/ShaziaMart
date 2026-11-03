import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { stubWidth } from "@/test/resize-observer";
import { FitAmount } from "./fit-amount";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("FitAmount: RO palsu lebar 132 → 'Rp12.345.678' font-size 18px, tanpa kelas truncate", () => {
  stubWidth(132);
  render(
    <div>
      <FitAmount text="Rp12.345.678" max={21} min={13} />
    </div>,
  );
  const el = screen.getByText("Rp12.345.678");
  expect(el.style.fontSize).toBe("18px");
  expect(el).not.toHaveClass("truncate");
  expect(el).toHaveClass("whitespace-nowrap");
});

test("FitAmount: tanpa ResizeObserver memakai ukuran max", () => {
  vi.stubGlobal("ResizeObserver", undefined);
  render(
    <div>
      <FitAmount text="Rp12.345.678" max={21} min={13} />
    </div>,
  );
  expect(screen.getByText("Rp12.345.678").style.fontSize).toBe("21px");
});

test("FitAmount: di ukuran min teks boleh membungkus, tidak pernah dipotong", () => {
  stubWidth(50);
  render(
    <div>
      <FitAmount text="-Rp123.456.789.012" max={21} min={13} className="num" />
    </div>,
  );
  const el = screen.getByText("-Rp123.456.789.012");
  expect(el.style.fontSize).toBe("13px");
  expect(el).toHaveClass("num", "[overflow-wrap:anywhere]");
  expect(el).not.toHaveClass("truncate");
  expect(el).not.toHaveClass("whitespace-nowrap");
});

test("FitAmount: width dari pemanggil dipakai tanpa membuat ResizeObserver", () => {
  const created = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor() {
        created();
      }
      observe() {}
      disconnect() {}
    },
  );
  render(
    <div>
      <FitAmount text="Rp12.345.678" max={21} min={13} width={132} />
    </div>,
  );
  expect(screen.getByText("Rp12.345.678").style.fontSize).toBe("18px");
  expect(created).not.toHaveBeenCalled();
});

import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { beep } from "@/shared/lib/beep";
import { renderWithQuery } from "@/test/render-app";
import { useCart } from "../cart/cart-store";
import { ScanBox, useScanFocus } from "./scan-box";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

function Harness({ onCurah }: { onCurah: (m: CatalogMatch) => void }) {
  const focus = useScanFocus();
  return <ScanBox focus={focus} onCurah={onCurah} />;
}

function setup(options: Parameters<typeof userEvent.setup>[0] = {}) {
  const onCurah = vi.fn();
  const utils = renderWithQuery(<Harness onCurah={onCurah} />);
  const user = userEvent.setup(options);
  const input = screen.getByRole("combobox", {
    name: "Scan barcode / ketik nama atau kode",
  });
  return { ...utils, user, input, onCurah };
}

beforeEach(() => {
  useCart.getState().completeSale(0);
  vi.mocked(beep).mockClear();
});

test("terfokus otomatis", () => {
  const { input } = setup();
  expect(input).toHaveFocus();
});

test("Enter kode 089686010947 → baris Indomie pcs bertambah", async () => {
  const { user, input } = setup();
  await user.type(input, "089686010947{Enter}");
  await waitFor(() => expect(useCart.getState().lines).toHaveLength(1));
  const line = useCart.getState().lines[0];
  expect(line?.productName).toBe("Indomie Goreng");
  expect(line?.unitName).toBe("pcs");
  expect(beep).toHaveBeenCalledWith("ok");
  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
});

test("Enter kode 2001 → onCurah dipanggil, keranjang tidak berubah", async () => {
  const { user, input, onCurah } = setup();
  await user.type(input, "2001{Enter}");
  await waitFor(() => expect(onCurah).toHaveBeenCalledTimes(1));
  expect(onCurah.mock.calls[0]?.[0].product.isCurah).toBe(true);
  expect(useCart.getState().lines).toHaveLength(0);
  expect(input).toHaveValue("");
});

test("kode tidak dikenal → toast 'Barang tidak ditemukan'", async () => {
  const { user, input } = setup();
  await user.type(input, "999999999999{Enter}");
  expect(await screen.findByText("Barang tidak ditemukan")).toBeInTheDocument();
  expect(beep).toHaveBeenCalledWith("error");
  expect(useCart.getState().lines).toHaveLength(0);
  expect(input).toHaveValue("");
});

test("ketik 'kopi' → daftar hasil, ↓ Enter menambah", async () => {
  const { user, input } = setup();
  await user.type(input, "kopi");
  const list = await screen.findByRole("listbox");
  const options = await screen.findAllByRole("option");
  expect(list).toBeInTheDocument();
  expect(options.length).toBeGreaterThan(0);
  expect(options.length).toBeLessThanOrEqual(8);
  expect(input).toHaveAttribute("aria-expanded", "true");
  await user.keyboard("{ArrowDown}");
  expect(input).toHaveAttribute("aria-activedescendant", options[0]?.id);
  expect(options[0]).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(useCart.getState().lines).toHaveLength(1));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(input).toHaveValue("");
});

test("Esc menutup daftar", async () => {
  const { user, input } = setup();
  await user.type(input, "kopi");
  await screen.findByRole("listbox");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(input).toHaveAttribute("aria-expanded", "false");
});

test("pencarian tanpa hasil → 'Tidak ada hasil'", async () => {
  const { user, input } = setup();
  await user.type(input, "zzzqqq");
  expect(await screen.findByText("Tidak ada hasil")).toBeInTheDocument();
});

test("Delete dengan input kosong menghapus baris terpilih; dengan input berisi tidak", async () => {
  const { user, input } = setup();
  await user.type(input, "089686010947{Enter}");
  await waitFor(() => expect(useCart.getState().lines).toHaveLength(1));
  act(() => useCart.getState().selectNext());
  await user.type(input, "ab");
  await user.keyboard("{Delete}");
  expect(useCart.getState().lines).toHaveLength(1);
  await user.clear(input);
  await user.keyboard("{Delete}");
  expect(useCart.getState().lines).toHaveLength(0);
});

test("↑/↓ saat daftar tertutup menggeser pilihan keranjang", async () => {
  const { user, input } = setup();
  await user.type(input, "089686010947{Enter}");
  await user.type(input, "165");
  await user.clear(input);
  await waitFor(() => expect(useCart.getState().lines).toHaveLength(1));
  await user.keyboard("{ArrowDown}");
  expect(useCart.getState().selectedLineId).toBe(
    useCart.getState().lines[0]?.lineId,
  );
});

test("Enter saat daftar terbuka tanpa sorotan menambah hasil pertama", async () => {
  const { user, input } = setup();
  await user.type(input, "kopi");
  const options = await screen.findAllByRole("option");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(useCart.getState().lines).toHaveLength(1));
  const name = useCart.getState().lines[0]?.productName ?? "";
  expect(options[0]).toHaveTextContent(name);
  expect(input).toHaveValue("");
});

test("scan beruntun cepat: kolom kosong seketika, kode tidak menyatu", async () => {
  // delay null: tidak ada jeda antar tombol, lookup pertama belum selesai saat kode kedua masuk.
  const { user, input } = setup({ delay: null });
  await user.type(input, "8991002101012{Enter}8992696404441{Enter}");
  expect(input).toHaveValue("");
  await waitFor(() => expect(useCart.getState().lines).toHaveLength(2));
  expect(useCart.getState().lines.map((l) => l.productName)).toEqual([
    "Beras Pandan Wangi 5 kg",
    "Minyak Goreng Bimoli 2 L",
  ]);
  expect(beep).not.toHaveBeenCalledWith("error");
});

test("scan ulang kode sama saat lookup pertama masih lambat → qty 2, dua lookup", async () => {
  const lookups: string[] = [];
  server.use(
    http.get("/api/catalog/lookup", async ({ request }) => {
      lookups.push(request.url);
      await delay(100);
    }),
  );
  const { user, input } = setup({ delay: null });
  await user.type(input, "089686010947{Enter}089686010947{Enter}");
  expect(input).toHaveValue("");
  await waitFor(() => expect(useCart.getState().lines[0]?.qtyBase).toBe(2));
  expect(useCart.getState().lines).toHaveLength(1);
  expect(lookups).toHaveLength(2);
});

test("Enter sebelum pencarian menyusul teks terbaru → hasil teks terbaru, bukan hasil lama", async () => {
  const { user, input } = setup({ delay: null });
  await user.type(input, "gula");
  expect((await screen.findAllByRole("option"))[0]).toHaveTextContent(/^Gula/);
  await user.clear(input);
  await user.type(input, "kopi{Enter}");
  await waitFor(() => expect(useCart.getState().lines).toHaveLength(1));
  expect(useCart.getState().lines[0]?.productName).toMatch(/^Kopi /);
  expect(input).toHaveValue("");
});

test("Enter pada nama tanpa hasil (pencarian belum menyusul) → toast 'Barang tidak ditemukan'", async () => {
  const { user, input } = setup({ delay: null });
  await user.type(input, "zzzqqq{Enter}");
  expect(await screen.findByText("Barang tidak ditemukan")).toBeInTheDocument();
  expect(beep).toHaveBeenCalledWith("error");
  expect(useCart.getState().lines).toHaveLength(0);
});

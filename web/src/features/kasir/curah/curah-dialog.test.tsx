import { act, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { createSeedState } from "@/mocks/seed-data";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderWithQuery } from "@/test/render-app";
import { humanTyping, scannerTyping } from "@/test/typing";
import { useCart } from "../cart/cart-store";
import { cartLineView } from "../cart/cart-view";
import { CurahDialog } from "./curah-dialog";

function matchOf(storeCode: string): CatalogMatch {
  const product = createSeedState().products.find(
    (p) => p.storeCode === storeCode,
  );
  const unit = product?.units[0];
  if (!product || !unit) throw new Error("seed curah tidak ada");
  return { product, unitId: unit.id } as CatalogMatch;
}

const gula = () => matchOf("2001");
const minyak = () => matchOf("2004");

function setup(match: CatalogMatch = gula()) {
  const onClose = vi.fn();
  renderWithQuery(<CurahDialog match={match} onClose={onClose} />);
  return { user: humanTyping(), onClose };
}

const masukkan = () => screen.getByRole("button", { name: "Masukkan" });
const weight = () => screen.getByRole("textbox", { name: "Berat (kg)" });

beforeEach(() => {
  useCart.getState().completeSale(0);
});

test("ketik 1,5 → HARGA Rp27.000; Masukkan → baris 1,5 kg", async () => {
  const { user, onClose } = setup();
  expect(screen.getByText("Rp18.000 / kg")).toBeInTheDocument();
  expect(weight()).toHaveFocus();
  expect(screen.getByText("HARGA").parentElement).toHaveTextContent("—");
  expect(masukkan()).toBeDisabled();
  await user.type(weight(), "1,5");
  expect(screen.getByText("HARGA").parentElement).toHaveTextContent("Rp27.000");
  await user.click(masukkan());
  const line = useCart.getState().lines[0];
  expect(line?.qtyBase).toBe(1500);
  expect(line && cartLineView(line, 0).subtotal).toBe(27000);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("tombol 1½ mengisi 1,5", async () => {
  const { user } = setup();
  await user.click(await screen.findByRole("button", { name: "1,5 kg" }));
  expect(weight()).toHaveValue("1,5");
  expect(screen.getByRole("button", { name: "1,5 kg" })).toHaveTextContent(
    "1½",
  );
  expect(screen.getByRole("button", { name: "0,25 kg" })).toHaveTextContent(
    "¼",
  );
  expect(masukkan()).toBeEnabled();
});

test("mode Nominal 20.000 → '≈ 1,111 kg', subtotal Rp20.000", async () => {
  const { user } = setup();
  await user.click(screen.getByRole("tab", { name: "Nominal (Rp)" }));
  await user.type(
    screen.getByRole("textbox", { name: "Nominal (Rp)" }),
    "20000",
  );
  expect(screen.getByText("≈ 1,111 kg")).toBeInTheDocument();
  expect(screen.getByText("HARGA").parentElement).toHaveTextContent("Rp20.000");
  await user.click(masukkan());
  const line = useCart.getState().lines[0];
  expect(line && cartLineView(line, 0).subtotal).toBe(20000);
  expect(line?.qtyBase).toBe(1111);
});

test("Minyak curah memakai label 'Berat (L)' dan '≈ … L'", async () => {
  const { user } = setup(minyak());
  expect(screen.getByRole("tab", { name: "Berat (L)" })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Nominal (Rp)" }));
  await user.type(
    screen.getByRole("textbox", { name: "Nominal (Rp)" }),
    "17000",
  );
  expect(screen.getByText("≈ 1 L")).toBeInTheDocument();
});

test.each(["0", "", "1,2345", "abc"])(
  "nilai %j → Masukkan nonaktif",
  async (value) => {
    const { user } = setup();
    if (value) await user.type(weight(), value);
    expect(masukkan()).toBeDisabled();
    expect(screen.getByText("HARGA").parentElement).toHaveTextContent("—");
  },
);

test("Enter memasukkan, Esc menutup tanpa menambah", async () => {
  const first = setup();
  await first.user.type(weight(), "2{Enter}");
  expect(useCart.getState().lines).toHaveLength(1);
  expect(first.onClose).toHaveBeenCalledTimes(1);
});

test("Enter pada nilai tidak valid tidak menambah; Esc menutup", async () => {
  const { user, onClose } = setup();
  await user.type(weight(), "0{Enter}");
  expect(useCart.getState().lines).toHaveLength(0);
  expect(onClose).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(useCart.getState().lines).toHaveLength(0);
  expect(within(document.body).queryByText("HARGA")).not.toBeNull();
});

test("ganti barang saat dialog terbuka → isian & tab direset", async () => {
  const user = humanTyping();
  let swap: () => void = () => {};
  function Swap() {
    const [m, setM] = useState(gula());
    swap = () => setM(minyak());
    return <CurahDialog match={m} onClose={vi.fn()} />;
  }
  renderWithQuery(<Swap />);
  await user.click(screen.getByRole("tab", { name: "Nominal (Rp)" }));
  await user.type(screen.getByRole("textbox", { name: "Nominal (Rp)" }), "500");
  act(() => swap());
  expect(screen.getByRole("tab", { name: "Berat (L)" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("textbox", { name: "Berat (L)" })).toHaveValue("");
  await user.click(screen.getByRole("tab", { name: "Nominal (Rp)" }));
  expect(screen.getByRole("textbox", { name: "Nominal (Rp)" })).toHaveValue("");
});

test("nominal Rp1 (0 g) → Masukkan nonaktif, Enter tidak menambah", async () => {
  const { user } = setup();
  await user.click(screen.getByRole("tab", { name: "Nominal (Rp)" }));
  await user.type(
    screen.getByRole("textbox", { name: "Nominal (Rp)" }),
    "1{Enter}",
  );
  expect(masukkan()).toBeDisabled();
  expect(screen.getByText("HARGA").parentElement).toHaveTextContent("—");
  expect(useCart.getState().lines).toHaveLength(0);
});

test.each([
  ["Berat (kg)", "1,5"],
  ["Nominal (Rp)", "20000"],
])(
  "scan di %s: rentetan dibuang, Enter penutupnya tidak memasukkan",
  async (name, value) => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole("tab", { name }));
    const field = screen.getByRole("textbox", { name });
    await user.type(field, value);
    await scannerTyping().type(field, "8992761111014{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Itu barcode, bukan angka",
    );
    expect(field).toHaveValue(value);
    expect(useCart.getState().lines).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    await user.type(field, "{Enter}");
    expect(useCart.getState().lines).toHaveLength(1);
  },
);

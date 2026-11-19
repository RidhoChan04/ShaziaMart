import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import type {
  OpeningSuggestion,
  Shift,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";
import { humanTyping, scannerTyping } from "@/test/typing";
import { useCart } from "../cart/cart-store";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

beforeEach(() => {
  useCart.setState(useCart.getInitialState(), true);
});

const SUGGEST = (
  patch: Partial<OpeningSuggestion> = {},
): OpeningSuggestion => ({
  suggestedCash: 250_000,
  lastKasirName: "Budi",
  lastClosedAt: Date.now() - 60 * 60_000,
  lastCountedCash: 350_000,
  ownerTakes: 100_000,
  ...patch,
});
const serveSuggestion = (body: () => OpeningSuggestion) =>
  server.use(
    http.get("/api/shifts/opening-suggestion", () => HttpResponse.json(body())),
  );

async function toModalStep() {
  const user = humanTyping();
  renderApp("/kasir");
  await user.click(await screen.findByRole("button", { name: "Rina" }));
  await humanTyping().type(screen.getByLabelText("PIN"), "123456");
  const field = await screen.findByRole("textbox", {
    name: "Modal awal di laci",
  });
  return { user, field };
}
const reasonBox = () =>
  screen.queryByRole("textbox", { name: "Alasan modal berbeda" });
const openBtn = () => screen.getByRole("button", { name: "Buka shift" });

test("saran 250.000 → isian terisi 250.000, keterangan hitungan + diambil pemilik, tanpa alasan", async () => {
  serveSuggestion(() => SUGGEST());
  const { field } = await toModalStep();
  expect(field).toHaveValue("250.000");
  expect(
    screen.getByText(
      /^Hitungan tutup shift Budi .*pukul \d{2}\.\d{2}: Rp350\.000$/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Diambil pemilik setelahnya: -Rp100.000"),
  ).toBeInTheDocument();
  expect(reasonBox()).toBeNull();
  expect(openBtn()).toBeEnabled();
});

test("ubah ke 240.000 → 'Kurang Rp10.000 dari hitungan sebelumnya' + alasan wajib; tombol nonaktif sampai diisi; terkirim dengan openingNote", async () => {
  serveSuggestion(() => SUGGEST());
  let sent: unknown = null;
  server.use(
    http.post("/api/shifts", async ({ request }) => {
      sent = await request.json();
      const shift: Shift = {
        id: "s1",
        kasirId: "k",
        kasirName: "Rina",
        openedAt: Date.now(),
        openingCash: 240_000,
      };
      return HttpResponse.json(shift, { status: 201 });
    }),
  );
  const { user, field } = await toModalStep();
  await user.clear(field);
  await user.type(field, "240.000");
  expect(
    screen.getByText("Kurang Rp10.000 dari hitungan sebelumnya"),
  ).toBeInTheDocument();
  expect(reasonBox()).not.toBeNull();
  expect(openBtn()).toBeDisabled();
  await user.type(reasonBox() as HTMLElement, "Hitung ulang");
  expect(openBtn()).toBeEnabled();
  await user.click(openBtn());
  await waitFor(() =>
    expect(sent).toEqual({ openingCash: 240_000, openingNote: "Hitung ulang" }),
  );
});

test("lebih dari saran → 'Lebih Rp…'; kembali ke saran → alasan hilang", async () => {
  serveSuggestion(() => SUGGEST());
  const { user, field } = await toModalStep();
  await user.clear(field);
  await user.type(field, "260.000");
  expect(
    screen.getByText("Lebih Rp10.000 dari hitungan sebelumnya"),
  ).toBeInTheDocument();
  await user.clear(field);
  await user.type(field, "250.000");
  expect(reasonBox()).toBeNull();
});

test("baris R11 muncul di bawah isian alasan (nomor dari Pengaturan kasir)", async () => {
  serveSuggestion(() => SUGGEST());
  const { user, field } = await toModalStep();
  await user.clear(field);
  await user.type(field, "240.000");
  expect(
    await screen.findByText("Ragu? Telepon pemilik: 0812-3456-7890"),
  ).toBeInTheDocument();
});

test("tanpa saran (belum ada shift tutup) → tanpa keterangan, tanpa alasan, isian kosong", async () => {
  serveSuggestion(() =>
    SUGGEST({
      suggestedCash: null,
      lastKasirName: null,
      lastClosedAt: null,
      lastCountedCash: null,
      ownerTakes: 0,
    }),
  );
  const { user, field } = await toModalStep();
  expect(field).toHaveValue("");
  await user.type(field, "123.000");
  expect(screen.queryByText(/Hitungan tutup shift/)).toBeNull();
  expect(reasonBox()).toBeNull();
  expect(openBtn()).toBeEnabled();
});

test("422 OPENING_MISMATCH → pesan memakai suggestedCash dari problem, saran dimuat ulang, alasan muncul", async () => {
  let suggested = 250_000;
  serveSuggestion(() => SUGGEST({ suggestedCash: suggested }));
  server.use(
    http.post("/api/shifts", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Tidak valid",
          status: 422,
          code: "OPENING_MISMATCH",
          detail: "Isi alasan bila modal berbeda dari Rp150.000",
          suggestedCash: 150_000,
        },
        {
          status: 422,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
  );
  const { user, field } = await toModalStep();
  suggested = 150_000; // pemilik mengambil uang saat layar terbuka
  await user.click(openBtn());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Isi alasan bila modal berbeda dari Rp150.000",
  );
  expect(field).toHaveValue("250.000");
  expect(
    await screen.findByText("Lebih Rp100.000 dari hitungan sebelumnya"),
  ).toBeInTheDocument();
  expect(reasonBox()).not.toBeNull();
  expect(openBtn()).toBeDisabled();
});

test("rentetan scanner + Enter di isian alasan tidak menjadi alasan dan tidak mengirim", async () => {
  serveSuggestion(() => SUGGEST());
  const posts = vi.fn();
  server.use(
    http.post("/api/shifts", () => {
      posts();
      return HttpResponse.json({}, { status: 500 });
    }),
  );
  const { user, field } = await toModalStep();
  await user.clear(field);
  await user.type(field, "240.000");
  const reason = reasonBox() as HTMLElement;
  reason.focus();
  await scannerTyping().keyboard("8999999{Enter}");
  expect(reason).toHaveValue("");
  expect(
    await screen.findByText("Itu hasil scan barcode, bukan alasan"),
  ).toBeInTheDocument();
  expect(posts).not.toHaveBeenCalled();
});

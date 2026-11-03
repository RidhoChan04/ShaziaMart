import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  json,
  loginWithShift,
  ownerLogin,
  post,
} from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type { SupplierDebtList } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";
import { DEBT_NOW, seedDebts } from "@/test/seed-debts";

const DETAIL = "/owner/lainnya/utang/nota-a";
const TITLE = "Toko Grosir Makmur · nota 20 Okt 2026";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DEBT_NOW);
  await seedDebts();
  await ownerLogin();
});

afterEach(() => vi.useRealTimers());

async function openPaySheet() {
  const user = userEvent.setup();
  const utils = renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  const trigger = screen.getByRole("button", { name: "Tandai lunas" });
  await user.click(trigger);
  const sheet = await screen.findByRole("dialog", { name: "Tandai lunas" });
  return { user, trigger, sheet, ...utils };
}

const submit = (user: ReturnType<typeof userEvent.setup>, sheet: HTMLElement) =>
  user.click(within(sheet).getByRole("button", { name: "Tandai lunas" }));

const debtsNow = async () =>
  (await json<SupplierDebtList>(await fetch("/api/owner/supplier-debts")))
    .debts;

test("detail: nominal, pencatat, jatuh tempo, dan tombol kembali 'Utang'", async () => {
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  expect(screen.getByText("Rp1.275.000")).toBeInTheDocument();
  expect(screen.getByText("Dicatat Rina · Hari ini 10.00")).toBeInTheDocument();
  expect(screen.getByText("Jatuh tempo")).toBeInTheDocument();
  expect(screen.getByText("30 Okt 2026")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Utang/ })).toHaveAttribute(
    "href",
    "/owner/lainnya/utang",
  );
});

test("foto nota: thumbnail membuka dialog 'Foto nota', fokus kembali ke baris", async () => {
  const user = userEvent.setup();
  mockDb.update((s) => {
    const r = s.receipts.find((x) => x.id === "nota-a");
    if (r) r.photoId = "foto-1";
  });
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  const row = screen.getByRole("button", { name: /Foto nota/ });
  expect(row.querySelector("img")).toHaveAttribute(
    "src",
    "/api/owner/receipt-photos/foto-1",
  );
  await user.click(row);
  const dialog = await screen.findByRole("dialog", { name: "Foto nota" });
  expect(
    within(dialog).getByRole("img", { name: "Foto nota" }),
  ).toHaveAttribute("src", "/api/owner/receipt-photos/foto-1");
  await user.click(within(dialog).getByRole("button", { name: "Tutup" }));
  await waitFor(() => expect(row).toHaveFocus());
});

test("nota tanpa foto: baris statis 'Tanpa foto'", async () => {
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  expect(screen.getByText("Tanpa foto")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Foto nota/ })).toBeNull();
});

test("Tandai lunas (shift Rina buka): Tunai + Dari laci kasir → POST laci, kembali ke daftar, nota pindah ke 'Sudah lunas'", async () => {
  await loginWithShift();
  await ownerLogin();
  const bodies: unknown[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.url.endsWith("/nota-a/pay")) {
      bodies.push(await request.clone().json());
    }
  });
  const { user, sheet } = await openPaySheet();
  expect(within(sheet).getByText("Nominal")).toBeInTheDocument();
  expect(within(sheet).getByText("Rp1.275.000")).toBeInTheDocument();
  await user.click(within(sheet).getByLabelText("Tunai"));
  await user.click(within(sheet).getByLabelText("Dari laci kasir"));
  expect(
    within(sheet).getByText(/dicatat sebagai uang keluar di shift/),
  ).toBeInTheDocument();
  await submit(user, sheet);

  await screen.findByRole("heading", { level: 1, name: "Utang supplier" });
  expect(bodies).toEqual([{ method: "tunai", cashSource: "laci" }]);
  const lunas = await screen.findByRole("region", { name: "Sudah lunas" });
  expect(lunas).toHaveTextContent("Nota 20 Okt 2026");
  expect(lunas).toHaveTextContent("Tunai · Dari laci kasir");
  expect(screen.getByText("Rp2.812.000")).toBeInTheDocument();
});

test("tanpa shift: tidak ada 'Dari laci kasir'; tunai → uang pemilik; Transfer → baris 'Uang dari' hilang", async () => {
  const bodies: unknown[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.url.endsWith("/nota-a/pay")) {
      bodies.push(await request.clone().json());
    }
  });
  const { user, sheet } = await openPaySheet();
  expect(within(sheet).queryByLabelText("Dari laci kasir")).toBeNull();
  expect(within(sheet).queryByText("Uang dari")).toBeNull();
  await user.click(within(sheet).getByLabelText("Transfer"));
  expect(within(sheet).queryByText("Uang dari")).toBeNull();
  await submit(user, sheet);
  await screen.findByRole("heading", { level: 1, name: "Utang supplier" });
  expect(bodies).toEqual([{ method: "transfer", cashSource: null }]);
  expect(
    (await debtsNow()).find((d) => d.receiptId === "nota-a")?.paid?.method,
  ).toBe("transfer");
});

test("tunai tanpa shift → cashSource 'pemilik'", async () => {
  const bodies: unknown[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.url.endsWith("/nota-a/pay")) {
      bodies.push(await request.clone().json());
    }
  });
  const { user, sheet } = await openPaySheet();
  await submit(user, sheet);
  await screen.findByRole("heading", { level: 1, name: "Utang supplier" });
  expect(bodies).toEqual([{ method: "tunai", cashSource: "pemilik" }]);
});

test("Batal menutup lembar dan fokus kembali ke 'Tandai lunas'", async () => {
  const { user, trigger, sheet } = await openPaySheet();
  await user.click(within(sheet).getByRole("button", { name: "Batal" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("409 DEBT_ALREADY_PAID → 'Utang ini sudah lunas' di lembar", async () => {
  const { user, sheet } = await openPaySheet();
  await post("/api/owner/supplier-debts/nota-a/pay", {
    method: "transfer",
    cashSource: null,
  });
  await submit(user, sheet);
  expect(await within(sheet).findByRole("alert")).toHaveTextContent(
    "Utang ini sudah lunas",
  );
});

test("shift tertutup saat membayar dari laci: pesan server, pilihan laci tetap terlihat dan tidak diganti diam-diam", async () => {
  await loginWithShift();
  await ownerLogin();
  const { user, sheet } = await openPaySheet();
  // Shift ditutup setelah lembar dibuka.
  mockDb.update((s) => {
    s.shift = null;
  });
  await submit(user, sheet);
  expect(await within(sheet).findByRole("alert")).toHaveTextContent(
    "Tidak ada shift kasir yang buka",
  );
  await waitFor(() =>
    expect(within(sheet).getByLabelText("Dari laci kasir")).toBeDisabled(),
  );
  expect(within(sheet).getByLabelText("Dari laci kasir")).toBeChecked();
  expect(
    within(sheet).getByRole("button", { name: "Tandai lunas" }),
  ).toBeDisabled();
  await user.click(within(sheet).getByLabelText("Uang pemilik"));
  await submit(user, sheet);
  await screen.findByRole("heading", { level: 1, name: "Utang supplier" });
});

test("galat jaringan saat bayar → pesan di lembar, lembar tetap terbuka", async () => {
  const { user, sheet } = await openPaySheet();
  server.use(
    http.post("/api/owner/supplier-debts/:id/pay", () => HttpResponse.error()),
  );
  await submit(user, sheet);
  expect(await within(sheet).findByRole("alert")).toHaveTextContent(
    "Server tidak tersambung",
  );
});

test("nota sudah lunas: tanpa tombol, tampil cara bayar", async () => {
  mockDb.update((s) => {
    const r = s.receipts.find((x) => x.id === "nota-a");
    if (r) {
      r.paid = {
        at: DEBT_NOW,
        method: "transfer",
        cashSource: null,
        byName: "Pak Ahmad",
      };
    }
  });
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  expect(screen.queryByRole("button", { name: "Tandai lunas" })).toBeNull();
  expect(screen.getByText("Lunas")).toBeInTheDocument();
  expect(screen.getByText(/Transfer/)).toBeInTheDocument();
});

test("nota tidak ada → 'Utang tidak ditemukan' dengan tautan ke daftar", async () => {
  renderApp("/owner/lainnya/utang/tidak-ada");
  expect(await screen.findByText("Utang tidak ditemukan")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Kembali ke utang supplier" }),
  ).toHaveAttribute("href", "/owner/lainnya/utang");
});

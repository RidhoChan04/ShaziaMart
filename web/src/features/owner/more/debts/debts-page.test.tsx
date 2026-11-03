import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { renderApp } from "@/test/render-app";
import { DEBT_NOW, nanti, seedDebts } from "@/test/seed-debts";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DEBT_NOW);
  await seedDebts();
  await ownerLogin();
});

afterEach(() => vi.useRealTimers());

const rowOf = (text: string) => {
  const li = screen
    .getAllByRole("listitem")
    .find((el) => el.textContent?.includes(text));
  if (!li) throw new Error(`baris ${text} tidak ada`);
  return li;
};

test("ringkasan, grup supplier, dan tanda jatuh tempo", async () => {
  renderApp("/owner/lainnya/utang");
  await screen.findByRole("heading", { level: 1, name: "Utang supplier" });
  await screen.findByText("Rp4.087.000");
  expect(screen.getByText("Senin, 2 Nov")).toBeInTheDocument();
  expect(screen.getByText("Belum dibayar")).toBeInTheDocument();
  expect(screen.getByText("Rp4.087.000")).toBeInTheDocument();
  expect(screen.getByText("3 nota · 2 supplier")).toBeInTheDocument();
  expect(screen.getByText("1 lewat jatuh tempo")).toBeInTheDocument();
  expect(
    within(screen.getByRole("main")).getByRole("link", { name: /Lainnya/ }),
  ).toHaveAttribute("href", "/owner/lainnya");

  const makmur = screen.getByRole("region", { name: /Toko Grosir Makmur/ });
  expect(within(makmur).getByText("Rp2.645.000")).toBeInTheDocument();
  const rows = within(makmur).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("Nota 20 Okt 2026");
  expect(rows[0]).toHaveTextContent("Rp1.275.000");
  expect(rows[0]).toHaveTextContent("Jatuh tempo 30 Okt");
  expect(rows[0]).toHaveTextContent("Lewat jatuh tempo");
  expect(rows[1]).toHaveTextContent("Jatuh tempo 11 Nov · 9 hari lagi");
  const sumber = screen.getByRole("region", { name: /CV Sumber Rejeki/ });
  // Satu nota: total grup dan nominal nota sama-sama Rp1.442.000.
  expect(within(sumber).getAllByText("Rp1.442.000")).toHaveLength(2);
  expect(sumber).toHaveTextContent("Jatuh tempo 16 Nov · 14 hari lagi");
  expect(screen.queryByText("Segera jatuh tempo")).not.toBeInTheDocument();
  expect(screen.queryByText("Sudah lunas")).not.toBeInTheDocument();
});

test("baris menaut ke detail", async () => {
  renderApp("/owner/lainnya/utang");
  await screen.findByText("Rp4.087.000");
  expect(within(rowOf("Nota 20 Okt 2026")).getByRole("link")).toHaveAttribute(
    "href",
    "/owner/lainnya/utang/nota-a",
  );
});

test("jatuh tempo 5 Nov → '3 hari lagi' + 'Segera jatuh tempo'", async () => {
  mockDb.update((s) => {
    const r = s.receipts.find((x) => x.id === "nota-b");
    if (r) r.payment = nanti("2026-11-05");
  });
  renderApp("/owner/lainnya/utang");
  await screen.findByText("Rp4.087.000");
  const row = rowOf("Nota 28 Okt 2026");
  expect(row).toHaveTextContent("Jatuh tempo 5 Nov · 3 hari lagi");
  expect(row).toHaveTextContent("Segera jatuh tempo");
});

test("bagian 'Sudah lunas' (R31): 'Nota {tanggal nota}' / 'Lunas {tanggal lunas WIB} · {cara bayar}'", async () => {
  mockDb.update((s) => {
    const r = s.receipts.find((x) => x.id === "nota-a");
    if (r) {
      r.paid = {
        // 2 Nov 01.00 WIB = 1 Nov UTC: tanggal lunas mengikuti kalender Jakarta.
        at: Date.UTC(2026, 10, 1, 18),
        method: "tunai",
        cashSource: "pemilik",
        byName: "Pak Ahmad",
      };
    }
  });
  renderApp("/owner/lainnya/utang");
  await screen.findByText("Rp2.812.000");
  expect(screen.getByText("2 nota · 2 supplier")).toBeInTheDocument();
  expect(screen.queryByText(/lewat jatuh tempo/)).not.toBeInTheDocument();
  const lunas = screen.getByRole("region", { name: "Sudah lunas" });
  const [row] = within(lunas).getAllByRole("listitem");
  expect(
    within(row as HTMLElement).getByText("Nota 20 Okt 2026"),
  ).toBeVisible();
  expect(
    within(row as HTMLElement).getByText(
      "Lunas 2 Nov 2026 · Tunai · Uang pemilik",
    ),
  ).toBeVisible();
  expect(row).toHaveTextContent("Rp1.275.000");
});

test("tanpa utang: 'Tidak ada utang supplier'", async () => {
  mockDb.update((s) => {
    s.receipts = [];
  });
  renderApp("/owner/lainnya/utang");
  expect(await screen.findByText("Tidak ada utang supplier")).toBeVisible();
  expect(screen.getByText("Rp0")).toBeInTheDocument();
});

test("galat memuat → pesan + Coba lagi", async () => {
  server.use(
    http.get("/api/owner/supplier-debts", () =>
      HttpResponse.json(
        { code: "INTERNAL", title: "x", status: 500 },
        { status: 500 },
      ),
    ),
  );
  renderApp("/owner/lainnya/utang");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Terjadi kesalahan di server",
  );
  server.resetHandlers();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(await screen.findByText("Rp4.087.000")).toBeInTheDocument();
});

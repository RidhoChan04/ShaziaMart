import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { renderApp } from "@/test/render-app";
import {
  BERAS5,
  countOf,
  seedOpname,
  submitCount,
  T,
} from "@/test/seed-opname";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  await seedOpname();
  await ownerLogin();
  vi.setSystemTime(T("14.05"));
});

afterEach(() => vi.useRealTimers());

test("daftar: lingkup, waktu · nama, total, dan tanda menunggu / selisih besar", async () => {
  renderApp("/owner/lainnya/opname");
  await screen.findByRole("heading", { level: 1, name: "Hasil opname" });
  const link = await screen.findByRole("link", { name: /Mi Instan/ });
  expect(link).toHaveAttribute("href", "/owner/lainnya/opname/A");
  expect(link).toHaveTextContent("5 Nov 2026 10.00 · Rina");
  expect(link).toHaveTextContent("Rp260.000");
  expect(within(link).getByText("2 menunggu persetujuan")).toBeVisible();
  expect(within(link).getByText("Selisih besar")).toBeVisible();
  expect(within(link).queryByText("Belum diberi alasan")).toBeNull();
  expect(
    within(screen.getByRole("main")).getByRole("link", { name: /Lainnya/ }),
  ).toHaveAttribute("href", "/owner/lainnya");
});

test("sesi yang alasannya belum disimpan: 'Belum diberi alasan'", async () => {
  vi.setSystemTime(T("11.00"));
  await submitCount("B", { kind: "kategori", category: "Beras" }, [
    countOf(BERAS5, 8, "11.00"),
  ]);
  renderApp("/owner/lainnya/opname");
  const link = await screen.findByRole("link", { name: /Beras/ });
  expect(within(link).getByText("Belum diberi alasan")).toBeVisible();
  expect(within(link).queryByText(/menunggu persetujuan/)).toBeNull();
});

test("setelah ditinjau, 'Selisih besar' hilang", async () => {
  mockDb.update((s) => {
    const a = s.opnameSessions.find((x) => x.id === "A");
    if (a) a.reviewedAt = T("12.00");
  });
  renderApp("/owner/lainnya/opname");
  const link = await screen.findByRole("link", { name: /Mi Instan/ });
  expect(within(link).queryByText("Selisih besar")).toBeNull();
  expect(within(link).getByText("2 menunggu persetujuan")).toBeVisible();
});

test("kosong: 'Belum ada hasil opname'", async () => {
  mockDb.update((s) => {
    s.opnameSessions = [];
  });
  renderApp("/owner/lainnya/opname");
  expect(await screen.findByText("Belum ada hasil opname")).toBeVisible();
});

test("galat memuat -> pesan + Coba lagi", async () => {
  server.use(
    http.get("/api/owner/opname-sessions", () =>
      HttpResponse.json(
        { code: "INTERNAL", title: "x", status: 500 },
        { status: 500 },
      ),
    ),
  );
  renderApp("/owner/lainnya/opname");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Terjadi kesalahan di server",
  );
  server.resetHandlers();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(await screen.findByRole("link", { name: /Mi Instan/ })).toBeVisible();
});

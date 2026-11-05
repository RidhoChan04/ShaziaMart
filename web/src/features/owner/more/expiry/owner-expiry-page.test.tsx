import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { ownerExpiryList } from "@/mocks/stock/expiry";
import { applySampleStock } from "@/mocks/stock/sample";
import { getGetOwnerTodaySummaryQueryKey } from "@/shared/api/gen/owner/owner";
import { renderApp } from "@/test/render-app";

/** Senin 2 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 2, 3);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockDb.update((s) => applySampleStock(s, NOW));
  await ownerLogin();
});
afterEach(() => vi.useRealTimers());

const rowOf = (name: string): HTMLElement => {
  const el = screen.getByText(name).closest("li");
  if (!el) throw new Error(`baris ${name} tidak ada`);
  return el;
};

test("kartu 'Perkiraan kerugian' = Σ grup lewat; kanan tiap baris Rp; kembali ke Lainnya", async () => {
  renderApp("/owner/lainnya/kedaluwarsa");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Kedaluwarsa" }),
  ).toBeVisible();
  const card = (await screen.findByText("Perkiraan kerugian")).parentElement;
  // Sari Roti Tawar: 3 x Rp15.000.
  expect(card).toHaveTextContent("Rp45.000");
  expect(rowOf("Sari Roti Tawar")).toHaveTextContent("Rp45.000");
  expect(rowOf("Sari Roti Sobek Coklat")).toHaveTextContent("Rp62.500");
  // Tombol kembali di header + tab Lainnya sama-sama menuju menu Lainnya.
  const links = screen.getAllByRole("link", { name: /Lainnya/ });
  expect(links.length).toBeGreaterThanOrEqual(2);
  for (const l of links) expect(l).toHaveAttribute("href", "/owner/lainnya");
});

test("M1: teks hari memakai 'today' dari server, bukan tanggal HP", async () => {
  server.use(
    http.get("/api/owner/expiry", () =>
      HttpResponse.json({
        ...ownerExpiryList(mockDb.get(), Date.now()),
        today: "2026-11-03",
      }),
    ),
  );
  renderApp("/owner/lainnya/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  expect(
    within(rowOf("Sari Roti Tawar")).getByText("Lewat 3 hari"),
  ).toBeVisible();
  expect(
    within(rowOf("Sari Roti Sobek Coklat")).getByText("1 hari lagi"),
  ).toBeVisible();
});

test("tanpa HPP: baris menulis 'HPP belum ada'", async () => {
  mockDb.update((s) => {
    for (const p of s.products) {
      if (p.name === "Sari Roti Sobek Coklat") p.cost = null;
    }
  });
  renderApp("/owner/lainnya/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  expect(rowOf("Sari Roti Sobek Coklat")).toHaveTextContent("HPP belum ada");
});

test("keluarkan seperti staf: log memuat nama pemilik dan nilai Rp", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  await user.click(
    within(rowOf("Sari Roti Tawar")).getByRole("button", { name: "Pilihan" }),
  );
  const menu = await screen.findByRole("dialog");
  expect(
    within(menu).getByText(
      "Alasan: kedaluwarsa · tercatat atas nama Pak Ahmad",
    ),
  ).toBeVisible();
  await user.click(
    within(menu).getByRole("button", { name: /Keluarkan dari stok/ }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Keluarkan dari stok",
  });
  await user.click(
    within(dialog).getByRole("button", { name: "Kurangi Bungkus" }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Keluarkan 2" }));
  expect(
    await screen.findByText("2 Sari Roti Tawar dikeluarkan"),
  ).toBeVisible();
  const log = (
    await screen.findByText("Pak Ahmad mengeluarkan 2 Sari Roti Tawar")
  ).closest("li");
  expect(log).toHaveTextContent("Rp30.000");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(rowOf("Sari Roti Tawar")).toHaveTextContent("±1 bungkus");
});

test("setelah keluarkan, ringkasan hari ini dimuat ulang (butir perhatian & Lainnya)", async () => {
  const user = userEvent.setup();
  const { queryClient } = renderApp("/owner/lainnya/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  const spy = vi.spyOn(queryClient, "invalidateQueries");
  await user.click(
    within(rowOf("Sari Roti Tawar")).getByRole("button", { name: "Pilihan" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Keluarkan dari stok/ }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Keluarkan dari stok",
  });
  await user.click(within(dialog).getByRole("button", { name: "Keluarkan 3" }));
  await screen.findByText("3 Sari Roti Tawar dikeluarkan");
  expect(spy).toHaveBeenCalledWith({
    queryKey: getGetOwnerTodaySummaryQueryKey(),
  });
});

test("ubah tanggal ED seperti staf: toast dan log ubah ED tanpa Rp", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  await user.click(
    within(rowOf("Sari Roti Tawar")).getByRole("button", { name: "Pilihan" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Ubah tanggal ED/ }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Ubah tanggal ED" });
  fireEvent.change(within(dialog).getByLabelText("Tanggal kedaluwarsa"), {
    target: { value: "2026-12-15" },
  });
  await user.click(
    within(dialog).getByRole("button", { name: "Simpan tanggal" }),
  );
  expect(await screen.findByText("Tanggal ED diperbarui")).toBeVisible();
  const log = (
    await screen.findByText("Pak Ahmad membetulkan ED Sari Roti Tawar")
  ).closest("li");
  expect(log).not.toHaveTextContent("Rp");
});

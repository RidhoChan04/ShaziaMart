import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { staffLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import { applySampleStock } from "@/mocks/stock/sample";
import { getGetHealthQueryKey } from "@/shared/api/gen/system/system";
import { renderApp } from "@/test/render-app";

/** Senin 2 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 2, 3);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockDb.update((s) => applySampleStock(s, NOW));
  await staffLogin("Rina");
});
afterEach(() => vi.useRealTimers());

const rowOf = (name: string): HTMLElement => {
  const el = screen.getByText(name).closest("li");
  if (!el) throw new Error(`baris ${name} tidak ada`);
  return el;
};

test("grup 'Sudah lewat' sebelum '≤ 30 hari'; baris ±3 bungkus · ED 31 Okt 2026 + 'Lewat 2 hari'; hari lagi", async () => {
  renderApp("/staff/kedaluwarsa");
  expect(
    await screen.findByText(
      "Jumlah adalah perkiraan: barang lama dianggap terjual lebih dulu.",
    ),
  ).toBeVisible();
  const headings = await screen.findAllByRole("heading", { level: 2 });
  expect(headings.map((h) => h.textContent)).toEqual([
    "Sudah lewat,1",
    "≤ 30 hari,3",
  ]);
  const roti = rowOf("Sari Roti Tawar");
  expect(roti).toHaveTextContent("±3 bungkus · ED 31 Okt 2026");
  expect(within(roti).getByText("Lewat 2 hari")).toBeVisible();
  expect(rowOf("Sari Roti Sobek Coklat")).toHaveTextContent(
    "±5 bungkus · ED 4 Nov 2026",
  );
  expect(
    within(rowOf("Sari Roti Sobek Coklat")).getByText("2 hari lagi"),
  ).toBeVisible();
  expect(
    within(rowOf("Susu Kental Manis Frisian Flag 370 g")).getByText(
      "13 hari lagi",
    ),
  ).toBeVisible();
  // Judul besar kerangka tetap satu-satunya h1.
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
});

test("⋯ → lembar pilihan dengan kepala supplier; Batal mengembalikan fokus ke tombol ⋯", async () => {
  const user = userEvent.setup();
  renderApp("/staff/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  const more = within(rowOf("Susu Kental Manis Frisian Flag 370 g")).getByRole(
    "button",
    { name: "Pilihan" },
  );
  await user.click(more);
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText("Susu Kental Manis Frisian Flag 370 g"),
  ).toBeVisible();
  expect(
    within(dialog).getByText(
      /±6 pcs · ED 15 Nov 2026 · CV Sumber Rejeki, \d+ \w+/,
    ),
  ).toBeVisible();
  expect(
    within(dialog).getByText("Alasan: kedaluwarsa · tercatat atas nama Rina"),
  ).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "Batal" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(more).toHaveFocus();
});

test("Keluarkan dari stok: default perkiraan, ubah ke 2, 'Keluarkan 2' → toast dan log 'Rina mengeluarkan 2 Sari Roti Tawar'", async () => {
  const user = userEvent.setup();
  renderApp("/staff/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  await user.click(
    within(rowOf("Sari Roti Tawar")).getByRole("button", { name: "Pilihan" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Keluarkan dari stok/ }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Keluarkan dari stok",
  });
  expect(
    within(dialog).getByRole("button", { name: "Keluarkan 3" }),
  ).toBeVisible();
  await user.click(
    within(dialog).getByRole("button", { name: "Kurangi Bungkus" }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Keluarkan 2" }));
  expect(
    await screen.findByText("2 Sari Roti Tawar dikeluarkan"),
  ).toBeVisible();
  expect(
    await screen.findByText("Rina mengeluarkan 2 Sari Roti Tawar"),
  ).toBeVisible();
  expect(screen.getByText(/^Kedaluwarsa · Hari ini 10\.00$/)).toBeVisible();
  expect(
    screen.getByRole("heading", { level: 2, name: "Baru dikeluarkan" }),
  ).toBeVisible();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // Sisa perkiraan 1 bungkus.
  expect(rowOf("Sari Roti Tawar")).toHaveTextContent("±1 bungkus");
});

test("Ubah tanggal ED → Simpan tanggal → toast 'Tanggal ED diperbarui', baris pindah dan log ubah ED", async () => {
  const user = userEvent.setup();
  renderApp("/staff/kedaluwarsa");
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
  expect(
    await screen.findByText("Rina membetulkan ED Sari Roti Tawar"),
  ).toBeVisible();
  expect(
    screen.getByText(/31 Okt 2026 → 15 Des 2026 · Hari ini 10\.00/),
  ).toBeVisible();
  // ED 15 Des lebih dari 30 hari: baris hilang dari daftar.
  await waitFor(() =>
    expect(
      screen
        .queryAllByText("Sari Roti Tawar")
        .filter((e) => e.closest("li")?.textContent?.includes("±")),
    ).toHaveLength(0),
  );
});

test("offline: tombol pilihan di lembar nonaktif + 'Perlu tersambung ke toko'", async () => {
  const user = userEvent.setup();
  const { queryClient } = renderApp("/staff/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  setScenario("server-mati");
  await act(() =>
    queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() }),
  );
  await screen.findByText("Rina · Tidak tersambung ke toko");
  await user.click(
    within(rowOf("Sari Roti Tawar")).getByRole("button", { name: "Pilihan" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("button", { name: /Ubah tanggal ED/ }),
  ).toBeDisabled();
  expect(
    within(dialog).getByRole("button", { name: /Keluarkan dari stok/ }),
  ).toBeDisabled();
  expect(within(dialog).getByText("Perlu tersambung ke toko")).toBeVisible();
});

test("422 dari server (melebihi kiriman) → pesan server tampil di lembar, lembar tetap terbuka", async () => {
  const user = userEvent.setup();
  renderApp("/staff/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  await user.click(
    within(rowOf("Sari Roti Tawar")).getByRole("button", { name: "Pilihan" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Keluarkan dari stok/ }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Keluarkan dari stok",
  });
  const input = within(dialog).getByLabelText("Jumlah Bungkus");
  await user.clear(input);
  await user.type(input, "99");
  await user.click(
    within(dialog).getByRole("button", { name: "Keluarkan 99" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    /Jumlah melebihi kiriman ini/,
  );
  expect(
    screen.getByRole("dialog", { name: "Keluarkan dari stok" }),
  ).toBeVisible();
});

test("422 pesan 'detail' dari server ditampilkan apa adanya di lembar ubah ED", async () => {
  server.use(
    http.put("/api/staff/receipts/:receiptId/lines/:lineId/expiry", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Data tidak valid",
          status: 422,
          code: "VALIDATION",
          detail: "Tanggal kedaluwarsa tidak valid",
        },
        {
          status: 422,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
  );
  const user = userEvent.setup();
  renderApp("/staff/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  await user.click(
    within(rowOf("Sari Roti Tawar")).getByRole("button", { name: "Pilihan" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Ubah tanggal ED/ }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Ubah tanggal ED" });
  await user.click(
    within(dialog).getByRole("button", { name: "Simpan tanggal" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Tanggal kedaluwarsa tidak valid",
  );
});

test("daftar kosong → teks kosong", async () => {
  server.use(
    http.get("/api/staff/expiry", () =>
      HttpResponse.json({ soonDays: 30, lots: [], recent: [] }),
    ),
  );
  renderApp("/staff/kedaluwarsa");
  expect(
    await screen.findByText("Tidak ada barang yang mendekati kedaluwarsa"),
  ).toBeVisible();
  expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
});

test("berhasil mengeluarkan semua → baris hilang, fokus tidak jatuh ke body", async () => {
  const user = userEvent.setup();
  renderApp("/staff/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
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
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: /Sudah lewat/ })).toBeNull(),
  );
  await waitFor(() => expect(document.body).not.toHaveFocus());
});

test("ubah ED: isian tanggal kosong menonaktifkan 'Simpan tanggal'", async () => {
  const user = userEvent.setup();
  renderApp("/staff/kedaluwarsa");
  await screen.findByText("Sari Roti Tawar");
  await user.click(
    within(rowOf("Sari Roti Tawar")).getByRole("button", { name: "Pilihan" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Ubah tanggal ED/ }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Ubah tanggal ED" });
  fireEvent.change(within(dialog).getByLabelText("Tanggal kedaluwarsa"), {
    target: { value: "" },
  });
  expect(
    within(dialog).getByRole("button", { name: "Simpan tanggal" }),
  ).toBeDisabled();
});

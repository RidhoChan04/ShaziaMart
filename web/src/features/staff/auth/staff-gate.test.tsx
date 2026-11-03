import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { expect, test } from "vitest";
import { mockDb } from "@/mocks/db";
import { problem } from "@/mocks/handlers/respond";
import { staffLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import {
  getGetOwnerTodaySummaryQueryKey,
  getOwnerTodaySummary,
} from "@/shared/api/gen/owner/owner";
import {
  getGetStaffShiftQueryKey,
  getStaffShift,
} from "@/shared/api/gen/staff/staff";
import { renderApp } from "@/test/render-app";

const brand = () =>
  screen.findByRole("heading", { level: 1, name: "ShaziaMart · Stok" });
const title = (name: string) =>
  screen.findByRole("heading", { level: 1, name });

/** Ketik PIN lewat tombol layar. */
async function typePin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  for (const digit of pin) {
    await user.click(screen.getByRole("button", { name: digit }));
  }
}

test("/staff tanpa sesi → 'ShaziaMart · Stok', 'Masuk dengan akun kasir', tombol Rina & Budi (tanpa Pak Ahmad), 'Hanya bisa dipakai di Wi-Fi toko'", async () => {
  renderApp("/staff");
  expect(await brand()).toBeInTheDocument();
  expect(screen.getByText("Masuk dengan akun kasir")).toBeInTheDocument();
  const rina = await screen.findByRole("button", { name: "Rina" });
  // Nama pertama terpilih sejak awal.
  expect(rina).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Budi" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.queryByRole("button", { name: "Pak Ahmad" })).toBeNull();
  expect(screen.getByText("Masukkan PIN Rina")).toBeInTheDocument();
  expect(screen.getByLabelText("PIN")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hapus" })).toBeInTheDocument();
  expect(
    screen.getByText("Hanya bisa dipakai di Wi-Fi toko"),
  ).toBeInTheDocument();
  // Belum masuk: kerangka (navigasi) belum tampil.
  expect(screen.queryByRole("navigation")).toBeNull();
});

test("pilih Budi → 'Masukkan PIN Budi'; PIN 654321 → judul 'Stok', 'Budi · Wi-Fi toko', nav 'Navigasi orang toko' berisi 5 tab", async () => {
  const user = userEvent.setup();
  renderApp("/staff");
  await user.click(await screen.findByRole("button", { name: "Budi" }));
  expect(screen.getByRole("button", { name: "Budi" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Rina" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByText("Masukkan PIN Budi")).toBeInTheDocument();
  // Setelah memilih nama, fokus kembali ke isian PIN agar keyboard fisik langsung bisa dipakai.
  await waitFor(() => expect(screen.getByLabelText("PIN")).toHaveFocus());

  await typePin(user, "654321");
  expect(await title("Stok")).toBeInTheDocument();
  expect(await screen.findByText("Budi · Wi-Fi toko")).toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "Navigasi orang toko" });
  expect(
    within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent),
  ).toEqual(["Beranda", "Masuk", "Opname", "Kedaluwarsa", "Lainnya"]);
  expect(mockDb.get().staffSession?.userId).toBe(
    mockDb.get().users.find((u) => u.name === "Budi")?.id,
  );
});

test("PIN salah → 'PIN salah'; login 403 STAFF_LAN_ONLY (server.use) → 'Hanya bisa dipakai di Wi-Fi toko'", async () => {
  const user = userEvent.setup();
  renderApp("/staff");
  await screen.findByRole("button", { name: "Rina" });
  await typePin(user, "000000");
  expect(await screen.findByRole("alert")).toHaveTextContent("PIN salah");
  expect(
    screen.getByRole("heading", { name: "ShaziaMart · Stok" }),
  ).toBeVisible();

  server.use(
    http.post("/api/staff/login", () =>
      problem(403, "STAFF_LAN_ONLY", "Hanya bisa dipakai di Wi-Fi toko"),
    ),
  );
  await typePin(user, "123456");
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Hanya bisa dipakai di Wi-Fi toko",
    ),
  );
  expect(mockDb.get().staffSession).toBeNull();
});

test("ganti nama menghapus pesan galat PIN sebelumnya", async () => {
  const user = userEvent.setup();
  renderApp("/staff");
  await screen.findByRole("button", { name: "Rina" });
  await typePin(user, "000000");
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Budi" }));
  expect(screen.queryByRole("alert")).toBeNull();
});

test("kunci PIN realm staf (423) memakai pesan sendiri dan tidak mengunci PIN kasir di PC (R9)", async () => {
  const user = userEvent.setup();
  for (let i = 0; i < 4; i += 1) await staffLogin("Rina", "000000");
  renderApp("/staff");
  await screen.findByRole("button", { name: "Rina" });
  await typePin(user, "000000");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Terlalu banyak PIN salah — coba lagi dalam 5 menit",
  );
  // Penghitung PIN kasir di PC tidak ikut bertambah.
  expect(mockDb.get().pinFailures).toEqual({});
  expect(mockDb.get().session).toBeNull();
});

test("daftar nama gagal dimuat lewat terowongan (403) → pesan Wi-Fi toko + Coba lagi", async () => {
  const user = userEvent.setup();
  server.use(
    http.get("/api/staff/users", () =>
      problem(403, "STAFF_LAN_ONLY", "Hanya bisa dipakai di Wi-Fi toko"),
    ),
  );
  renderApp("/staff");
  await brand();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Hanya bisa dipakai di Wi-Fi toko",
  );
  expect(screen.queryByLabelText("PIN")).toBeNull();
  server.resetHandlers();
  await user.click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(await screen.findByRole("button", { name: "Rina" })).toBeVisible();
});

test("sesi tidak bisa diperiksa (403 STAFF_LAN_ONLY) → layar penolakan, bukan kerangka", async () => {
  server.use(
    http.get("/api/staff/session", () =>
      problem(403, "STAFF_LAN_ONLY", "Hanya bisa dipakai di Wi-Fi toko"),
    ),
  );
  renderApp("/staff");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Hanya bisa dipakai di Wi-Fi toko",
  );
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.getByRole("button", { name: "Coba lagi" })).toBeVisible();
});

test("server mati sebelum sesi diperiksa → 'Server tidak tersambung — coba lagi'; pulih → login", async () => {
  const user = userEvent.setup();
  setScenario("server-mati");
  renderApp("/staff");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Server tidak tersambung — coba lagi",
  );
  setScenario("normal");
  await user.click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(await screen.findByRole("button", { name: "Rina" })).toBeVisible();
});

test("login staf tidak membuat sesi kasir: /kasir tetap meminta Buka shift; /owner tetap menampilkan login pemilik", async () => {
  const user = userEvent.setup();
  const { router } = renderApp("/staff");
  await screen.findByRole("button", { name: "Rina" });
  await typePin(user, "123456");
  expect(await title("Stok")).toBeInTheDocument();
  expect(mockDb.get().staffSession).not.toBeNull();
  expect(mockDb.get().session).toBeNull();
  expect(mockDb.get().ownerSession).toBeNull();

  await act(() => router.navigate({ to: "/kasir" }));
  expect(
    await screen.findByRole("heading", { name: "Buka shift" }),
  ).toBeInTheDocument();

  await act(() => router.navigate({ to: "/owner" }));
  expect(
    await screen.findByRole("heading", { level: 1, name: "Masuk pemilik" }),
  ).toBeInTheDocument();
  expect(mockDb.get().staffSession).not.toBeNull();
});

test("401 dari query /api/staff/* → kembali ke login; 401 dari /api/owner/* tidak mengeluarkan staf", async () => {
  await staffLogin("Rina");
  const { queryClient } = renderApp("/staff");
  expect(await title("Stok")).toBeInTheDocument();

  // 401 realm pemilik (tidak ada sesi pemilik) diabaikan oleh gerbang staf.
  await act(() =>
    queryClient
      .fetchQuery({
        queryKey: getGetOwnerTodaySummaryQueryKey(),
        queryFn: () => getOwnerTodaySummary(),
      })
      .catch(() => undefined),
  );
  expect(screen.getByRole("heading", { name: "Stok" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Rina" })).toBeNull();

  // Sesi staf habis di server; query staf berikutnya mendapat 401.
  mockDb.update((s) => {
    s.staffSession = null;
  });
  await act(() =>
    queryClient
      .fetchQuery({
        queryKey: getGetStaffShiftQueryKey(),
        queryFn: () => getStaffShift(),
      })
      .catch(() => undefined),
  );
  expect(await brand()).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).toBeNull();
  // Data staf lain dibuang agar tidak terlihat oleh orang yang masuk berikutnya.
  expect(queryClient.getQueryData(getGetStaffShiftQueryKey())).toBeUndefined();
});

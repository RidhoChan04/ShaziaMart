import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { mockDb } from "@/mocks/db";
import { login, staffLogin } from "@/mocks/handlers/test-helpers";
import { setScenario } from "@/mocks/scenarios";
import { getGetHealthQueryKey } from "@/shared/api/gen/system/system";
import { renderApp } from "@/test/render-app";

const title = (name: string) =>
  screen.findByRole("heading", { level: 1, name });
const nav = () =>
  screen.getByRole("navigation", { name: "Navigasi orang toko" });

test("tab Opname & Kedaluwarsa → 'Segera hadir'; Lainnya → 'Masuk sebagai Rina' → Keluar → layar login", async () => {
  await staffLogin("Rina");
  // Sesi kasir di PC harus tetap utuh saat orang toko keluar.
  expect((await login("123456")).status).toBe(200);
  const user = userEvent.setup();
  renderApp("/staff");
  await title("Stok");

  await user.click(within(nav()).getByRole("link", { name: "Opname" }));
  expect(await title("Stok opname")).toBeInTheDocument();
  expect(screen.getByText("Segera hadir")).toBeInTheDocument();

  await user.click(within(nav()).getByRole("link", { name: "Kedaluwarsa" }));
  expect(await title("Kedaluwarsa")).toBeInTheDocument();
  expect(screen.getByText("Segera hadir")).toBeInTheDocument();

  await user.click(within(nav()).getByRole("link", { name: "Masuk" }));
  expect(await title("Barang masuk")).toBeInTheDocument();

  await user.click(within(nav()).getByRole("link", { name: "Lainnya" }));
  expect(await title("Lainnya")).toBeInTheDocument();
  expect(screen.getByText("Masuk sebagai Rina")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Keluar" }));
  expect(
    await screen.findByRole("heading", { level: 1, name: "ShaziaMart · Stok" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(mockDb.get().staffSession).toBeNull();
  expect(mockDb.get().session).not.toBeNull();
});

test("Keluar gagal → pesan galat, tetap masuk", async () => {
  await staffLogin("Rina");
  const user = userEvent.setup();
  renderApp("/staff/lainnya");
  const keluar = await screen.findByRole("button", { name: "Keluar" });
  setScenario("server-mati");
  await user.click(keluar);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Server tidak tersambung — coba lagi",
  );
  expect(screen.getByRole("heading", { name: "Lainnya" })).toBeInTheDocument();
});

test("html[data-app='staff'] saat di /staff, hilang setelah pindah ke /kasir", async () => {
  const { router } = renderApp("/staff");
  await screen.findByRole("heading", { level: 1, name: "ShaziaMart · Stok" });
  expect(document.documentElement.dataset.app).toBe("staff");
  await act(() => router.navigate({ to: "/kasir" }));
  await screen.findByRole("heading", { name: "Buka shift" });
  expect(document.documentElement.dataset.app).toBeUndefined();
});

test("offline (health gagal) → 'Rina · Tidak tersambung ke toko'", async () => {
  await staffLogin("Rina");
  const { queryClient } = renderApp("/staff");
  await title("Stok");
  const status = await screen.findByText("Rina · Wi-Fi toko");
  expect(status.closest("[role=status]")).not.toBeNull();

  setScenario("server-mati");
  await act(() =>
    queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() }),
  );
  expect(
    await screen.findByText("Rina · Tidak tersambung ke toko"),
  ).toBeInTheDocument();
  // Halaman tetap terpasang; sesi yang sudah dimuat tetap dipakai.
  expect(screen.getByRole("heading", { name: "Stok" })).toBeInTheDocument();

  setScenario("normal");
  await act(() =>
    queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() }),
  );
  expect(await screen.findByText("Rina · Wi-Fi toko")).toBeInTheDocument();
});

test("Beranda: kartu Barang masuk → /staff/masuk/baru; tombol Akun → Lainnya", async () => {
  await staffLogin("Rina");
  const user = userEvent.setup();
  const { router } = renderApp("/staff");
  await title("Stok");
  const card = screen.getByRole("link", { name: /Barang masuk/ });
  expect(card).toHaveTextContent("Catat nota supplier");
  await user.click(card);
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk/baru"),
  );
  // Sub-halaman: judul besar kerangka tidak tampil; tab Masuk tetap aktif.
  expect(screen.queryByRole("heading", { name: "Barang masuk" })).toBeNull();
  expect(within(nav()).getByRole("link", { name: "Masuk" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await act(() => router.navigate({ to: "/staff" }));
  await title("Stok");
  await user.click(screen.getByRole("link", { name: "Akun" }));
  expect(await title("Lainnya")).toBeInTheDocument();
});

test("judul besar = satu-satunya h1; tombol Akun hanya di Beranda", async () => {
  await staffLogin("Rina");
  const { router } = renderApp("/staff");
  await title("Stok");
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Akun" })).toBeInTheDocument();

  await act(() => router.navigate({ to: "/staff/kedaluwarsa" }));
  await title("Kedaluwarsa");
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "Akun" })).toBeNull();
});

test("nav orang toko memakai kapsul kaca yang sama dengan pemilik; aktif ditandai aria-current", async () => {
  await staffLogin("Rina");
  renderApp("/staff/opname");
  await title("Stok opname");
  expect(screen.getAllByRole("navigation")).toHaveLength(1);
  expect(nav()).toHaveClass("glass", "fixed", "rounded-full");
  const links = within(nav()).getAllByRole("link");
  for (const link of links) expect(link).toHaveClass("min-h-12");
  expect(within(nav()).getByRole("link", { name: "Opname" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const name of ["Beranda", "Masuk", "Kedaluwarsa", "Lainnya"]) {
    expect(within(nav()).getByRole("link", { name })).not.toHaveAttribute(
      "aria-current",
    );
  }
  expect(screen.getByRole("main")).toHaveClass(
    "pb-[calc(7rem+env(safe-area-inset-bottom))]",
  );
});

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { setScenario } from "@/mocks/scenarios";
import { getGetHealthQueryKey } from "@/shared/api/gen/system/system";
import { renderApp } from "@/test/render-app";

const OFFLINE_TEXT =
  "Tidak bisa terhubung ke toko — pastikan PC kasir menyala dan online";
const BANNER = "Tidak terhubung ke toko — data terakhir ditampilkan";

beforeEach(async () => {
  // Hanya Date yang dipalsukan agar MSW dan React Query tetap memakai timer asli.
  vi.useFakeTimers({ toFake: ["Date"] });
  // Sabtu 17 Okt 2026, 09.00 WIB
  vi.setSystemTime(Date.UTC(2026, 9, 17, 2, 0));
  await ownerLogin();
});

afterEach(() => {
  vi.useRealTimers();
});

test("owner: 5 item navigasi dan aria-current pada halaman aktif", async () => {
  renderApp("/owner/laporan");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Laporan" }),
  ).toBeInTheDocument();

  expect(screen.getAllByRole("navigation")).toHaveLength(1);
  const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
  const links = within(nav).getAllByRole("link");
  expect(links.map((l) => l.textContent)).toEqual([
    "Beranda",
    "Barang",
    "Laporan",
    "Kasbon",
    "Lainnya",
  ]);
  expect(within(nav).getByRole("link", { name: "Laporan" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const name of ["Beranda", "Barang", "Kasbon", "Lainnya"]) {
    expect(within(nav).getByRole("link", { name })).not.toHaveAttribute(
      "aria-current",
    );
  }
});

test("owner: /owner adalah Beranda dan navigasi berpindah halaman", async () => {
  const user = userEvent.setup();
  renderApp("/owner");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Beranda" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Beranda" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await user.click(screen.getByRole("link", { name: "Kasbon" }));
  expect(
    await screen.findByRole("heading", { level: 1, name: "Kasbon" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Kasbon" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "Beranda" })).not.toHaveAttribute(
    "aria-current",
  );
});

test("owner: header menampilkan tanggal hari bisnis, judul halaman, dan status toko", async () => {
  renderApp("/owner");
  const header = within(await screen.findByRole("banner"));
  expect(header.getByText("Sabtu, 17 Okt")).toBeInTheDocument();
  expect(
    header.getByRole("heading", { level: 1, name: "Beranda" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(header.getByRole("status")).toHaveTextContent("Toko online"),
  );
});

test("judul halaman = tab aktif", async () => {
  renderApp("/owner/kasbon");
  const header = within(await screen.findByRole("banner"));
  expect(
    await header.findByRole("heading", { level: 1, name: "Kasbon" }),
  ).toBeInTheDocument();
  await screen.findByText("Segera hadir");
  // Judul besar di kerangka adalah satu-satunya h1 halaman.
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
});

test("header tidak lagi menampilkan ShaziaMart; halaman sementara menampilkan Segera hadir", async () => {
  renderApp("/owner/barang");
  expect(await screen.findByText("Segera hadir")).toBeInTheDocument();
  expect(screen.queryByText("ShaziaMart")).not.toBeInTheDocument();
});

test("Beranda: h1 hanya dari kerangka (tanpa h1 sr-only di halaman)", async () => {
  renderApp("/owner");
  await screen.findByRole("heading", { name: "Omzet per jam" });
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
});

test("offline setelah data dimuat → halaman tetap + banner; pulih → banner hilang", async () => {
  const { queryClient } = renderApp("/owner/barang");
  const page = await screen.findByText("Segera hadir");
  await screen.findByText("Toko online");
  const pollHealth = () =>
    act(() => queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() }));

  setScenario("server-mati");
  await pollHealth();
  const banner = await screen.findByText(BANNER);
  expect(banner).toHaveAttribute("role", "status");
  // Halaman yang sama tetap terpasang (bukan dipasang ulang).
  expect(page).toBeInTheDocument();
  expect(screen.queryByText(OFFLINE_TEXT)).not.toBeInTheDocument();
  expect(screen.getByText("Toko offline")).toBeInTheDocument();

  setScenario("normal");
  await pollHealth();
  await waitFor(() => expect(screen.queryByText(BANNER)).toBeNull());
  expect(page).toBeInTheDocument();
  expect(screen.getByText("Toko online")).toBeInTheDocument();
});

test("offline sebelum data apa pun dimuat → layar penuh tidak bisa terhubung + Coba lagi", async () => {
  const user = userEvent.setup();
  setScenario("server-mati");
  renderApp("/owner/barang");
  expect(await screen.findByText(OFFLINE_TEXT)).toBeInTheDocument();
  // Halaman belum dipasang; judul besar kerangka tetap satu-satunya h1.
  expect(screen.queryByText("Segera hadir")).not.toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  // navigasi tetap tersedia saat offline
  expect(
    screen.getByRole("navigation", { name: "Navigasi utama" }),
  ).toBeInTheDocument();

  setScenario("normal");
  await user.click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(await screen.findByText("Segera hadir")).toBeInTheDocument();
  expect(screen.queryByText(OFFLINE_TEXT)).not.toBeInTheDocument();
});

test("OwnerLayout memasang data-app=owner dan melepasnya saat unmount", async () => {
  const { unmount } = renderApp("/owner");
  await screen.findByRole("heading", { name: "Beranda" });
  expect(document.documentElement.dataset.app).toBe("owner");
  unmount();
  expect(document.documentElement.dataset.app).toBeUndefined();
});

test("nav: kapsul kaca, 5 tautan dengan target sentuh >= 48px, aktif ditandai", async () => {
  renderApp("/owner/kasbon");
  await screen.findByRole("heading", { level: 1, name: "Kasbon" });
  const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
  expect(nav).toHaveClass("glass", "fixed", "rounded-full");
  const links = within(nav).getAllByRole("link");
  expect(links).toHaveLength(5);
  for (const link of links) expect(link).toHaveClass("min-h-12");
  const active = within(nav).getByRole("link", { name: "Kasbon" });
  expect(active).toHaveAttribute("aria-current", "page");
  expect(active).toHaveClass("data-[status=active]:bg-primary-soft");
});

test("fokus keyboard pada tautan tab terlihat (kelas focus-visible ada)", async () => {
  const user = userEvent.setup();
  renderApp("/owner");
  await screen.findByRole("heading", { level: 1, name: "Beranda" });
  const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
  const link = within(nav).getByRole("link", { name: "Kasbon" });
  for (const l of within(nav).getAllByRole("link")) {
    expect(l.className).toMatch(/focus-visible:outline/);
  }
  await user.tab();
  const first = within(nav).getAllByRole("link")[0];
  if (first) await waitFor(() => expect(first).toHaveFocus());
  expect(link).toBeInTheDocument();
});

test("main memberi ruang bawah untuk kapsul tab bar, termasuk jarak aman bawah", async () => {
  renderApp("/owner");
  await screen.findByRole("heading", { level: 1, name: "Beranda" });
  // Kapsul digeser sebesar safe-area-inset-bottom; ruang bawah konten ikut bertambah.
  expect(screen.getByRole("main")).toHaveClass(
    "pb-[calc(7rem+env(safe-area-inset-bottom))]",
    "lg:pb-6",
  );
});

test("isi halaman memakai kolom max-w-6xl yang sejajar dengan header", async () => {
  renderApp("/owner/barang");
  const placeholder = await screen.findByText("Segera hadir");
  expect(placeholder.parentElement).toHaveClass("mx-auto", "max-w-6xl");
});

test("kapsul tab dan kerangka menghormati jarak aman kiri-kanan (viewport-fit=cover)", async () => {
  const { container } = renderApp("/owner");
  const nav = await screen.findByRole("navigation", {
    name: "Navigasi utama",
  });
  expect(nav).toHaveClass(
    "left-[calc(12px+env(safe-area-inset-left))]",
    "right-[calc(12px+env(safe-area-inset-right))]",
    "lg:left-auto",
    "lg:right-auto",
  );
  expect(container.querySelector(".min-h-dvh")).toHaveClass(
    "pl-[env(safe-area-inset-left)]",
    "pr-[env(safe-area-inset-right)]",
  );
});

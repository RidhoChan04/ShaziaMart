import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setScenario } from "@/mocks/scenarios";
import { renderApp } from "@/test/render-app";

const OFFLINE_TEXT =
  "Tidak bisa terhubung ke toko — pastikan PC kasir menyala dan online";

beforeEach(() => {
  // Hanya Date yang dipalsukan agar MSW dan React Query tetap memakai timer asli.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 17, 9, 0));
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

test("owner: header menampilkan tanggal hari ini format Indonesia dan nama toko", async () => {
  renderApp("/owner");
  const header = await screen.findByRole("banner");
  expect(within(header).getByText("Sabtu, 17 Okt")).toBeInTheDocument();
  expect(within(header).getByText("ShaziaMart")).toBeInTheDocument();
});

test("owner offline menampilkan layar tidak bisa terhubung + Coba lagi", async () => {
  const user = userEvent.setup();
  setScenario("server-mati");
  renderApp("/owner/barang");
  expect(await screen.findByText(OFFLINE_TEXT)).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { level: 1, name: "Barang" }),
  ).not.toBeInTheDocument();
  // navigasi tetap tersedia saat offline
  expect(
    screen.getByRole("navigation", { name: "Navigasi utama" }),
  ).toBeInTheDocument();

  setScenario("normal");
  await user.click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(
    await screen.findByRole("heading", { level: 1, name: "Barang" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(OFFLINE_TEXT)).not.toBeInTheDocument();
});

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

test("owner: header menampilkan tanggal hari bisnis, nama toko, dan status toko", async () => {
  renderApp("/owner");
  const header = within(await screen.findByRole("banner"));
  expect(header.getByText("Sabtu, 17 Okt")).toBeInTheDocument();
  expect(header.getByText("ShaziaMart")).toBeInTheDocument();
  const status = await header.findByText("● toko online");
  expect(status).toHaveAttribute("role", "status");
  expect(status).toHaveClass("text-primary");
});

test("offline setelah data dimuat → halaman tetap + banner; pulih → banner hilang", async () => {
  const { queryClient } = renderApp("/owner/barang");
  const heading = await screen.findByRole("heading", {
    level: 1,
    name: "Barang",
  });
  await screen.findByText("● toko online");
  const pollHealth = () =>
    act(() => queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() }));

  setScenario("server-mati");
  await pollHealth();
  const banner = await screen.findByText(BANNER);
  expect(banner).toHaveAttribute("role", "status");
  // Halaman yang sama tetap terpasang (bukan dipasang ulang).
  expect(heading).toBeInTheDocument();
  expect(screen.queryByText(OFFLINE_TEXT)).not.toBeInTheDocument();
  const status = screen.getByText("● toko offline");
  expect(status).toHaveClass("text-danger");

  setScenario("normal");
  await pollHealth();
  await waitFor(() => expect(screen.queryByText(BANNER)).toBeNull());
  expect(heading).toBeInTheDocument();
  expect(screen.getByText("● toko online")).toBeInTheDocument();
});

test("offline sebelum data apa pun dimuat → layar penuh tidak bisa terhubung + Coba lagi", async () => {
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

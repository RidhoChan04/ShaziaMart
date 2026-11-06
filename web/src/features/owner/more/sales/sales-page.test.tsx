import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cashSale,
  loginWithShift,
  ownerLogin,
} from "@/mocks/handlers/test-helpers";
import { renderApp } from "@/test/render-app";
import { EXC_NOW, kasirVoid, sell } from "@/test/seed-exceptions";

const dayGroup = () => screen.getByRole("region", { name: "Hari" });
const PAGE = "/owner/lainnya/transaksi";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EXC_NOW);
  await loginWithShift();
});

afterEach(() => vi.useRealTimers());

async function seedToday() {
  const first = await sell(cashSale());
  vi.setSystemTime(EXC_NOW + 3_600_000);
  const second = await sell(cashSale(2));
  vi.setSystemTime(EXC_NOW + 7_200_000);
  const third = await sell(cashSale());
  await kasirVoid(second, "Salah scan");
  await ownerLogin();
  return { first, second, third };
}

test("hari ini terbaru dulu: '{nomor} · {jam}' / '{metode} · {kasir}' / total; 'Dibatalkan' bertanda; eyebrow tanggal; kembali ke Lainnya", async () => {
  const { first, second, third } = await seedToday();
  renderApp(PAGE);
  expect(
    await screen.findByRole("heading", { level: 1, name: "Transaksi" }),
  ).toBeInTheDocument();
  expect(dayGroup()).toHaveTextContent("Kamis, 5 Nov 2026");
  const rows = await screen.findAllByRole("link", { name: /· Rina/ });
  const numbers = rows
    .map((r) => /\d{8}-\d{4}/.exec(r.textContent ?? "")?.[0])
    .filter(Boolean);
  expect(numbers).toEqual([third.number, second.number, first.number]);
  const [newest, voided, oldest] = rows;
  expect(newest).toHaveTextContent(`${third.number} · 16.00`);
  expect(newest).toHaveTextContent("Tunai · Rina");
  expect(newest).toHaveTextContent("Rp36.000");
  expect(newest).toHaveAttribute(
    "href",
    `/owner/lainnya/transaksi/${third.id}`,
  );
  expect(within(voided as HTMLElement).getByText("Dibatalkan")).toBeVisible();
  expect(within(newest as HTMLElement).queryByText("Dibatalkan")).toBeNull();
  expect(oldest).toHaveTextContent(`${first.number} · 14.00`);
  expect(
    within(screen.getByRole("main")).getByRole("link", { name: /Lainnya/ }),
  ).toHaveAttribute("href", "/owner/lainnya");
});

test("navigator hari: 'Hari sebelumnya' memuat kemarin dari riwayat seed; 'Hari berikutnya' nonaktif di hari ini", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await seedToday();
  renderApp(PAGE);
  await screen.findByRole("region", { name: "Hari" });
  expect(
    screen.getByRole("button", { name: "Hari berikutnya" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("link", { name: "Hari sebelumnya" }));
  await waitFor(() => expect(dayGroup()).toHaveTextContent("Rabu, 4 Nov 2026"));
  const rows = await screen.findAllByRole("link", { name: /20261104-/ });
  expect(rows.length).toBeGreaterThanOrEqual(20);
  expect(screen.getByRole("link", { name: "Hari berikutnya" })).toHaveAttribute(
    "href",
    PAGE,
  );
});

test("cari nomor struk: sebagian nomor menyaring hari ini; tidak ada yang cocok → pesan", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const { second } = await seedToday();
  renderApp(PAGE);
  const box = await screen.findByRole("searchbox", {
    name: "Cari nomor struk",
  });
  await user.type(box, second.number.slice(-4));
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: /· Rina/ })).toHaveLength(1),
  );
  expect(screen.getByRole("link", { name: /· Rina/ })).toHaveTextContent(
    second.number,
  );
  await user.clear(box);
  await user.type(box, "9999");
  expect(
    await screen.findByText("Tidak ada transaksi yang cocok"),
  ).toBeInTheDocument();
});

test("nomor struk lengkap dari hari lain dicari di harinya (tanggal di navigator mengikuti)", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await seedToday();
  renderApp(PAGE);
  const box = await screen.findByRole("searchbox", {
    name: "Cari nomor struk",
  });
  await user.type(box, "20261104-0003");
  await waitFor(() => expect(dayGroup()).toHaveTextContent("Rabu, 4 Nov 2026"));
  const rows = await screen.findAllByRole("link", { name: /20261104-0003/ });
  expect(rows).toHaveLength(1);
});

test("hari tanpa transaksi: 'Tidak ada transaksi'", async () => {
  await ownerLogin();
  renderApp(`${PAGE}?tanggal=2025-01-01`);
  expect(await screen.findByText("Tidak ada transaksi")).toBeInTheDocument();
  expect(dayGroup()).toHaveTextContent("Rabu, 1 Jan 2025");
});

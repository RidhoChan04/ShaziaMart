import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { setScenario } from "@/mocks/scenarios";
import { renderApp } from "@/test/render-app";

test("/ redirect ke /kasir", async () => {
  const { router } = renderApp("/");
  const header = await screen.findByRole("banner");
  expect(within(header).getByText("ShaziaMart")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/kasir");
});

test("layout kasir: status server; Riwayat/Kunci hanya saat sesi + shift", async () => {
  renderApp("/kasir");
  expect(await screen.findByText("● Server tersambung")).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Buka shift" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Riwayat" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Kunci" })).toBeNull();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("layout kasir menampilkan ServerDownBar saat offline", async () => {
  setScenario("server-mati");
  renderApp("/kasir");
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    "Server tidak tersambung — transaksi belum bisa disimpan",
  );
});

test("halaman tak dikenal menampilkan pesan Indonesia", async () => {
  renderApp("/ngawur");
  expect(
    await screen.findByText("Halaman tidak ditemukan"),
  ).toBeInTheDocument();
});

test("start_url PWA /owner/ (garis miring di akhir) membuka Beranda", async () => {
  renderApp("/owner/");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Beranda" }),
  ).toBeInTheDocument();
});

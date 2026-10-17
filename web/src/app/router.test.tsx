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

test("layout kasir: status server dan tombol Riwayat/Kunci nonaktif", async () => {
  renderApp("/kasir");
  expect(await screen.findByText("● Server tersambung")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Riwayat" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Kunci" })).toBeDisabled();
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

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "@/test/render-app";
import { mockDb } from "./db";
import { getScenario, scenarios } from "./scenarios";

test("DevPanel: pilihan berlabel Skenario memuat semua skenario", async () => {
  renderApp("/kasir");
  const select = await screen.findByLabelText("Skenario");
  if (!(select instanceof HTMLSelectElement)) throw new Error("bukan select");
  expect(Array.from(select.options, (o) => o.value)).toEqual([...scenarios]);
  expect(select).toHaveValue("normal");
});

test("DevPanel: ganti skenario menyimpan dan memuat ulang data", async () => {
  const user = userEvent.setup();
  renderApp("/kasir");
  expect(await screen.findByText("● Server tersambung")).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Skenario"), "server-mati");
  expect(getScenario()).toBe("server-mati");
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByText("● Server tidak tersambung")).toBeInTheDocument();
});

test("DevPanel: ?skenario= di URL tampil dan tetap bisa diganti lewat panel", async () => {
  const user = userEvent.setup();
  history.replaceState(null, "", "/kasir?skenario=server-mati");
  renderApp("/kasir");
  const select = await screen.findByLabelText("Skenario");
  expect(select).toHaveValue("server-mati");
  expect(await screen.findByRole("alert")).toBeInTheDocument();

  await user.selectOptions(select, "normal");
  expect(getScenario()).toBe("normal");
  expect(await screen.findByText("● Server tersambung")).toBeInTheDocument();
});

test("DevPanel: Reset data mengembalikan data mock ke awal", async () => {
  const user = userEvent.setup();
  renderApp("/kasir");
  mockDb.update((s) => {
    s.store.name = "Toko Lain";
  });
  await user.click(await screen.findByRole("button", { name: "Reset data" }));
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

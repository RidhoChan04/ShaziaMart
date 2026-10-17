import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./app";

test("App merender nama toko", async () => {
  render(<App />);
  expect(await screen.findByText("ShaziaMart")).toBeInTheDocument();
});

test("render pertama tidak bocor ke test berikutnya", async () => {
  render(<App />);
  await screen.findByText("ShaziaMart");
});

test("DOM dibersihkan antar test", async () => {
  render(<App />);
  expect(await screen.findAllByText("ShaziaMart")).toHaveLength(1);
});

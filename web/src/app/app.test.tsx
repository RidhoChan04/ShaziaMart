import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./app";

test("App merender nama toko", () => {
  render(<App />);
  expect(screen.getByText("ShaziaMart")).toBeInTheDocument();
});

test("render pertama tidak bocor ke test berikutnya", () => {
  render(<App />);
});

test("DOM dibersihkan antar test", () => {
  render(<App />);
  expect(screen.getAllByText("ShaziaMart")).toHaveLength(1);
});

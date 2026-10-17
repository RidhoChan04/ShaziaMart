import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./app";

test("App merender nama toko", () => {
  render(<App />);
  expect(screen.getByText("ShaziaMart")).toBeInTheDocument();
});

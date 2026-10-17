import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Toaster } from "./sonner";

test("Toaster: label region berbahasa Indonesia", () => {
  render(<Toaster />);
  expect(
    screen.getByRole("region", { name: /Notifikasi/ }),
  ).toBeInTheDocument();
});

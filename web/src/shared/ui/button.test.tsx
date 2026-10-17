import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Button } from "@/shared/ui/button";

test("Button md tinggi 44px dan bisa difokus", async () => {
  render(<Button>Bayar</Button>);
  const b = screen.getByRole("button", { name: "Bayar" });
  expect(b.className).toContain("h-11");
  await userEvent.tab();
  expect(b).toHaveFocus();
});

test("Button lg tinggi 56px", () => {
  render(<Button size="lg">Bayar</Button>);
  expect(screen.getByRole("button").className).toContain("h-14");
});

test("Button varian primary memakai token primary", () => {
  render(<Button variant="primary">Bayar</Button>);
  expect(screen.getByRole("button").className).toContain("bg-primary");
});

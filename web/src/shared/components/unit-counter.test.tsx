import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { type CounterUnit, UnitCounter } from "./unit-counter";

const UNITS: CounterUnit[] = [
  { id: "u-dus", name: "dus", unitSize: 40 },
  { id: "u-pcs", name: "pcs", unitSize: 1 },
];

function Harness({
  units = UNITS,
  baseUnitName = "pcs",
  isCurah = false,
  initial = 0,
  spy,
}: {
  units?: CounterUnit[];
  baseUnitName?: string;
  isCurah?: boolean;
  initial?: number;
  spy: (v: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <UnitCounter
      units={units}
      baseUnitName={baseUnitName}
      isCurah={isCurah}
      value={value}
      onChange={(v) => {
        spy(v);
        setValue(v);
      }}
    />
  );
}

test("3 dus (isi 40) + 5 pcs → onChange(125) dan ringkasan '= 125 pcs'; label besar dulu", async () => {
  const spy = vi.fn();
  const user = userEvent.setup();
  render(<Harness spy={spy} />);
  expect(screen.getByText("isi 40 pcs")).toBeInTheDocument();
  expect(screen.getByText("lepasan")).toBeInTheDocument();
  expect(screen.getByText("Jumlah fisik")).toBeInTheDocument();
  expect(screen.getByText("= 0 pcs")).toBeInTheDocument();

  for (let i = 0; i < 3; i++) {
    await user.click(screen.getByRole("button", { name: "Tambah Dus" }));
  }
  for (let i = 0; i < 5; i++) {
    await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  }
  expect(spy).toHaveBeenLastCalledWith(125);
  expect(screen.getByText("= 125 pcs")).toBeInTheDocument();
  expect(screen.getByLabelText("Jumlah Dus")).toHaveValue("3");
  expect(screen.getByLabelText("Jumlah Pcs")).toHaveValue("5");
});

test("tombol 'Kurangi Dus' nonaktif di 0 dan aktif setelah ditambah; ketik angka menghitung ulang", async () => {
  const spy = vi.fn();
  const user = userEvent.setup();
  render(<Harness spy={spy} />);
  const minus = screen.getByRole("button", { name: "Kurangi Dus" });
  expect(minus).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Tambah Dus" }));
  expect(minus).toBeEnabled();
  await user.click(minus);
  expect(minus).toBeDisabled();
  expect(spy).toHaveBeenLastCalledWith(0);

  await user.type(screen.getByLabelText("Jumlah Pcs"), "45");
  expect(spy).toHaveBeenLastCalledWith(45);
  // Angka yang diketik tidak dipaksa jadi dus saat masih diketik.
  expect(screen.getByLabelText("Jumlah Pcs")).toHaveValue("45");
});

test("nilai dari luar dipecah besar dulu (125 → 3 dus + 5 pcs); tombol ≥ 44px", () => {
  render(<Harness spy={vi.fn()} initial={125} />);
  expect(screen.getByLabelText("Jumlah Dus")).toHaveValue("3");
  expect(screen.getByLabelText("Jumlah Pcs")).toHaveValue("5");
  for (const b of screen.getAllByRole("button")) {
    expect(b).toHaveClass("size-11");
  }
});

test("curah: ketik '1,5' → onChange(1500); ringkasan '= 1,5 kg'; isian tidak sah tidak mengubah nilai", async () => {
  const spy = vi.fn();
  const user = userEvent.setup();
  render(
    <Harness
      spy={spy}
      units={[{ id: "u-kg", name: "kg", unitSize: 1000 }]}
      baseUnitName="gram"
      isCurah
    />,
  );
  const input = screen.getByLabelText("Berat (kg)");
  await user.type(input, "1,5");
  expect(spy).toHaveBeenLastCalledWith(1500);
  expect(screen.getByText("= 1,5 kg")).toBeInTheDocument();
  spy.mockClear();
  await user.type(input, "x");
  expect(spy).not.toHaveBeenCalled();
  await user.clear(input);
  expect(spy).toHaveBeenLastCalledWith(0);
});

test("curah cair: label 'Isi (liter)'", () => {
  render(
    <Harness
      spy={vi.fn()}
      units={[{ id: "u-l", name: "L", unitSize: 1000 }]}
      baseUnitName="ml"
      isCurah
      initial={2500}
    />,
  );
  expect(screen.getByLabelText("Isi (liter)")).toHaveValue("2,5");
  expect(screen.getByText("= 2,5 L")).toBeInTheDocument();
});

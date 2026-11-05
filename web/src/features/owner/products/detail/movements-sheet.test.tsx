import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { StockMovement } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaTime } from "@/shared/lib/business-day";
import { MovementRow } from "./movements-sheet";

const NOW = Date.UTC(2026, 10, 5, 5, 0);
const AT = NOW - 60 * 60_000;
const PCS = { name: "pcs", size: 1 };

function row(movement: Partial<StockMovement>) {
  render(
    <ul>
      <MovementRow
        movement={{
          id: "m1",
          at: AT,
          kind: "opname",
          qtyBase: -7,
          kasirName: "Rina",
          reason: null,
          ...movement,
        }}
        unit={PCS}
        now={NOW}
      />
    </ul>,
  );
  return screen.getByRole("listitem");
}

test.each([
  [
    { kind: "opname", reason: "hilang", qtyBase: -7 },
    "Opname · Hilang 7 pcs",
    "−7",
  ],
  [
    { kind: "opname", reason: "salah_input", qtyBase: 3 },
    "Opname · Salah input sebelumnya 3 pcs",
    "+3",
  ],
  [{ kind: "opname", reason: null, qtyBase: -2 }, "Opname 2 pcs", "−2"],
  [{ kind: "stok_awal", qtyBase: 24 }, "Stok awal (opname) 24 pcs", "+24"],
  [
    { kind: "keluar_kedaluwarsa", qtyBase: -3 },
    "Dikeluarkan — kedaluwarsa 3 pcs",
    "−3",
  ],
] as const)("riwayat stok %o → %s", (movement, label, signed) => {
  const li = row(movement);
  expect(li).toHaveTextContent(label);
  expect(li).toHaveTextContent(`Hari ini ${jakartaTime(AT)} · Rina`);
  expect(li).toHaveTextContent(signed);
});

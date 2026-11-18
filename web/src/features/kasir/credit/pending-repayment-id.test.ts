import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, test } from "vitest";
import type { Shift } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { setSession, setShift } from "../shift/gate-state";
import {
  clearPendingRepaymentId,
  pendingRepaymentId,
} from "./pending-repayment-id";

const scope = { userId: "kasir-1", shiftId: "shift-1" };
const SHIFT: Shift = {
  id: "shift-1",
  kasirId: "kasir-1",
  kasirName: "Rina",
  openedAt: 0,
  openingCash: 0,
};
const ask = () => pendingRepaymentId(scope, "c1", 50_000, "tunai", 1_000);

beforeEach(() => clearPendingRepaymentId());

test("isian sama dipakai ulang sampai dilepas", () => {
  const first = ask();
  expect(first.reused).toBe(false);
  expect(ask()).toEqual({ id: first.id, reused: true });
  clearPendingRepaymentId();
  expect(ask().reused).toBe(false);
});

test("(fix final 1) lepas per id: hanya bila id cocok", () => {
  const first = ask();
  clearPendingRepaymentId("id-lain");
  expect(ask()).toEqual({ id: first.id, reused: true });
  clearPendingRepaymentId(first.id);
  expect(ask().reused).toBe(false);
});

test("(fix final 6) setShift (buka/tutup shift) melepas id tertunda", () => {
  const client = new QueryClient();
  for (const shift of [SHIFT, null]) {
    ask();
    expect(ask().reused).toBe(true);
    setShift(client, shift);
    expect(ask().reused).toBe(false);
    clearPendingRepaymentId();
  }
});

test("setSession (kunci/ganti kasir) melepas id tertunda", () => {
  ask();
  setSession(new QueryClient(), null);
  expect(ask().reused).toBe(false);
});

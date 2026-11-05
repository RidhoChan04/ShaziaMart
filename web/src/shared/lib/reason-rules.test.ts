import { expect, test } from "vitest";
import { cleanReason, REASON_MAX } from "./reason-rules";

test("REASON_MAX 200 (kontrak VoidRequest, CancelCreditPaymentInput, creditLimitReason)", () => {
  expect(REASON_MAX).toBe(200);
});

test("cleanReason: trim 1..200 karakter; selain string, kosong, atau terlalu panjang → null", () => {
  expect(cleanReason("  salah input ")).toBe("salah input");
  expect(cleanReason("x".repeat(200))).toBe("x".repeat(200));
  expect(cleanReason(` ${"x".repeat(200)} `)).toBe("x".repeat(200));
  for (const bad of ["", "   ", "x".repeat(201), undefined, null, 5, {}]) {
    expect(cleanReason(bad)).toBeNull();
  }
});

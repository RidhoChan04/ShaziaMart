import { act } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import type { Sale, SaleRequest } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { fillSpecCart, seedMatch } from "@/test/spec-cart";
import { useCart } from "../cart/cart-store";
import {
  buildSaleRequest,
  type PaymentDraft,
  paymentState,
  saleMatchesRequest,
} from "./payment-model";

const unitId = (name: string) => seedMatch(name).unitId;

beforeEach(() => {
  useCart.setState(useCart.getInitialState(), true);
});

describe("buildSaleRequest", () => {
  test("tunai contoh spec: total 361500, diterima 400000", () => {
    fillSpecCart();
    const cart = useCart.getState();
    const body = buildSaleRequest(
      cart,
      { kind: "tunai", received: 400000 },
      true,
    );
    expect(body).toEqual({
      saleId: cart.saleId,
      items: [
        {
          unitId: unitId("Beras Pandan Wangi 5 kg"),
          qtyBase: 1,
          expectedUnitPrice: 78000,
        },
        {
          unitId: unitId("Minyak Goreng Bimoli 2 L"),
          qtyBase: 2,
          expectedUnitPrice: 36000,
        },
        {
          unitId: unitId("Gula Pasir"),
          qtyBase: 1500,
          expectedUnitPrice: 18000,
        },
        {
          unitId: unitId("Telur Ayam"),
          qtyBase: 1000,
          expectedUnitPrice: 29000,
        },
        {
          unitId: unitId("Indomie Goreng"),
          qtyBase: 40,
          expectedUnitPrice: 2800,
        },
        {
          unitId: unitId("Kopi Kapal Api 165 g"),
          qtyBase: 3,
          expectedUnitPrice: 14500,
        },
      ],
      payments: [{ method: "cash", amount: 361500 }],
      cashReceived: 400000,
      print: true,
    });
  });

  test("curah per nominal mengirim amount, bukan qtyBase", () => {
    act(() =>
      useCart.getState().addCurah(seedMatch("Beras"), { amount: 20000 }),
    );
    const body = buildSaleRequest(useCart.getState(), { kind: "qris" }, false);
    expect(body.items).toEqual([
      { unitId: unitId("Beras"), amount: 20000, expectedUnitPrice: 14000 },
    ]);
    expect(body.payments).toEqual([{ method: "qris", amount: 20000 }]);
    expect(body).not.toHaveProperty("cashReceived");
    expect(body).not.toHaveProperty("customerId");
    expect(body).not.toHaveProperty("ownerPin");
  });

  test("kasbon dengan PIN pemilik", () => {
    fillSpecCart();
    const body = buildSaleRequest(
      useCart.getState(),
      { kind: "kasbon", customerId: "c1" },
      false,
      "999999",
    );
    expect(body.payments).toEqual([{ method: "credit", amount: 361500 }]);
    expect(body.customerId).toBe("c1");
    expect(body.ownerPin).toBe("999999");
    expect(body).not.toHaveProperty("cashReceived");
  });

  test("campuran tunai + kasbon, dan QRIS + kasbon", () => {
    fillSpecCart();
    const cart = useCart.getState();
    const cash = buildSaleRequest(
      cart,
      {
        kind: "campuran",
        firstMethod: "cash",
        firstAmount: 200000,
        received: 250000,
        customerId: "c2",
      },
      true,
    );
    expect(cash.payments).toEqual([
      { method: "cash", amount: 200000 },
      { method: "credit", amount: 161500 },
    ]);
    expect(cash.cashReceived).toBe(250000);
    expect(cash.customerId).toBe("c2");

    const qris = buildSaleRequest(
      cart,
      {
        kind: "campuran",
        firstMethod: "qris",
        firstAmount: 100000,
        received: null,
        customerId: "c2",
      },
      true,
    );
    expect(qris.payments).toEqual([
      { method: "qris", amount: 100000 },
      { method: "credit", amount: 261500 },
    ]);
    expect(qris).not.toHaveProperty("cashReceived");
  });
});

describe("paymentState", () => {
  const tunai = (received: string): PaymentDraft => ({
    kind: "tunai",
    received,
  });

  test("tunai: 400.000 → change 38500; 350000 → shortage 11500; kosong → tidak bisa", () => {
    expect(paymentState(361500, tunai("400.000"))).toEqual({
      canSubmit: true,
      change: 38500,
      shortage: null,
      choice: { kind: "tunai", received: 400000 },
    });
    expect(paymentState(361500, tunai("400000")).change).toBe(38500);
    expect(paymentState(361500, tunai("Rp361.500"))).toMatchObject({
      canSubmit: true,
      change: 0,
    });
    expect(paymentState(361500, tunai("350000"))).toEqual({
      canSubmit: false,
      change: null,
      shortage: 11500,
      choice: null,
    });
    for (const text of ["", "   ", "abc", "40.00", "-5000", "1,5"]) {
      expect(paymentState(361500, tunai(text))).toEqual({
        canSubmit: false,
        change: null,
        shortage: null,
        choice: null,
      });
    }
  });

  test("qris dan kasbon", () => {
    expect(paymentState(36000, { kind: "qris" })).toMatchObject({
      canSubmit: true,
      change: null,
    });
    expect(
      paymentState(36000, { kind: "kasbon", customerId: null }).canSubmit,
    ).toBe(false);
    expect(
      paymentState(36000, { kind: "kasbon", customerId: "c1" }),
    ).toMatchObject({
      canSubmit: true,
      choice: { kind: "kasbon", customerId: "c1" },
    });
  });

  test("total 0 tidak bisa dibayar", () => {
    expect(paymentState(0, tunai("0")).canSubmit).toBe(false);
    expect(paymentState(0, { kind: "qris" }).canSubmit).toBe(false);
    expect(
      paymentState(0, { kind: "kasbon", customerId: "c1" }).canSubmit,
    ).toBe(false);
  });

  describe("campuran", () => {
    const campuran = (
      firstAmount: string,
      over: Partial<Extract<PaymentDraft, { kind: "campuran" }>> = {},
    ): PaymentDraft => ({
      kind: "campuran",
      firstMethod: "qris",
      firstAmount,
      received: "",
      customerId: "c2",
      ...over,
    });

    test("firstAmount ≥ total atau ≤ 0 → canSubmit false", () => {
      for (const amount of ["361.500", "400000", "0", "", "abc"]) {
        expect(paymentState(361500, campuran(amount)).canSubmit).toBe(false);
      }
      expect(paymentState(361500, campuran("361.499")).canSubmit).toBe(true);
      expect(paymentState(361500, campuran("1")).canSubmit).toBe(true);
    });

    test("tanpa pelanggan → canSubmit false", () => {
      expect(
        paymentState(361500, campuran("200000", { customerId: null }))
          .canSubmit,
      ).toBe(false);
    });

    test("bagian tunai butuh uang diterima ≥ nominal tunai", () => {
      const cash = (received: string) =>
        paymentState(
          361500,
          campuran("200.000", { firstMethod: "cash", received }),
        );
      expect(cash("")).toMatchObject({
        canSubmit: false,
        shortage: null,
        change: null,
      });
      expect(cash("150.000")).toMatchObject({
        canSubmit: false,
        shortage: 50000,
      });
      expect(cash("250.000")).toEqual({
        canSubmit: true,
        change: 50000,
        shortage: null,
        choice: {
          kind: "campuran",
          firstMethod: "cash",
          firstAmount: 200000,
          received: 250000,
          customerId: "c2",
        },
      });
      expect(paymentState(361500, campuran("200.000")).choice).toEqual({
        kind: "campuran",
        firstMethod: "qris",
        firstAmount: 200000,
        received: null,
        customerId: "c2",
      });
    });
  });
});

describe("saleMatchesRequest", () => {
  const request: Pick<SaleRequest, "payments"> = {
    payments: [
      { method: "cash", amount: 20000 },
      { method: "credit", amount: 16000 },
    ],
  };
  const sale = (patch: Partial<Sale>): Pick<Sale, "total" | "payments"> => ({
    total: 36000,
    payments: request.payments,
    ...patch,
  });

  test.each([
    ["sama persis", sale({}), true],
    [
      "urutan pembayaran beda",
      sale({ payments: [...request.payments].reverse() }),
      true,
    ],
    ["total beda", sale({ total: 39100 }), false],
    [
      "nominal beda",
      sale({
        payments: [
          { method: "cash", amount: 23100 },
          { method: "credit", amount: 16000 },
        ],
      }),
      false,
    ],
    [
      "metode beda",
      sale({ payments: [{ method: "qris", amount: 36000 }] }),
      false,
    ],
  ])("%s → %s", (_name, stored, expected) => {
    expect(saleMatchesRequest(stored, request)).toBe(expected);
  });
});

import type {
  PaymentInput,
  Sale,
  SaleItemInput,
  SaleRequest,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { parseRupiah } from "@/shared/lib/money";
import type { CartState } from "../cart/cart-store";
import { cartLineView, cartSummary } from "../cart/cart-view";

export type FirstMethod = "cash" | "qris";

/** Pembayaran yang sudah valid dan siap dikirim. */
export type PaymentChoice =
  | { kind: "tunai"; received: number }
  | { kind: "qris" }
  | { kind: "kasbon"; customerId: string }
  | {
      kind: "campuran";
      firstMethod: FirstMethod;
      firstAmount: number;
      received: number | null;
      customerId: string;
    };

/** Isian jendela bayar apa adanya (teks yang diketik kasir). */
export type PaymentDraft =
  | { kind: "tunai"; received: string }
  | { kind: "qris" }
  | { kind: "kasbon"; customerId: string | null }
  | {
      kind: "campuran";
      firstMethod: FirstMethod;
      firstAmount: string;
      received: string;
      customerId: string | null;
    };

export type PaymentState = {
  canSubmit: boolean;
  change: number | null;
  shortage: number | null;
  choice: PaymentChoice | null;
};

const BLOCKED: PaymentState = {
  canSubmit: false,
  change: null,
  shortage: null,
  choice: null,
};

const ready = (choice: PaymentChoice, change: number | null): PaymentState => ({
  canSubmit: true,
  change,
  shortage: null,
  choice,
});

/** Uang diterima untuk tagihan `due`: kembalian, kekurangan, atau belum terisi. */
function cashFor(due: number, text: string) {
  const received = parseRupiah(text);
  if (received === null) return null;
  return received < due
    ? { received, shortage: due - received }
    : { received, change: received - due };
}

function campuranState(
  total: number,
  draft: Extract<PaymentDraft, { kind: "campuran" }>,
): PaymentState {
  const firstAmount = parseRupiah(draft.firstAmount);
  const { customerId, firstMethod } = draft;
  if (firstAmount === null || firstAmount <= 0 || firstAmount >= total) {
    return BLOCKED;
  }
  if (firstMethod === "qris") {
    return customerId === null
      ? BLOCKED
      : ready(
          {
            kind: "campuran",
            firstMethod,
            firstAmount,
            received: null,
            customerId,
          },
          null,
        );
  }
  const cash = cashFor(firstAmount, draft.received);
  if (cash === null) return BLOCKED;
  if ("shortage" in cash) return { ...BLOCKED, shortage: cash.shortage };
  if (customerId === null) return { ...BLOCKED, change: cash.change };
  return ready(
    {
      kind: "campuran",
      firstMethod,
      firstAmount,
      received: cash.received,
      customerId,
    },
    cash.change,
  );
}

/** Validasi isian terhadap total keranjang; `choice` terisi hanya bila bisa dikirim. */
export function paymentState(total: number, draft: PaymentDraft): PaymentState {
  if (!Number.isSafeInteger(total) || total <= 0) return BLOCKED;
  switch (draft.kind) {
    case "tunai": {
      const cash = cashFor(total, draft.received);
      if (cash === null) return BLOCKED;
      if ("shortage" in cash) return { ...BLOCKED, shortage: cash.shortage };
      return ready({ kind: "tunai", received: cash.received }, cash.change);
    }
    case "qris":
      return ready({ kind: "qris" }, null);
    case "kasbon":
      return draft.customerId === null
        ? BLOCKED
        : ready({ kind: "kasbon", customerId: draft.customerId }, null);
    case "campuran":
      return campuranState(total, draft);
  }
}

function paymentsFor(
  choice: PaymentChoice,
  total: number,
): Pick<SaleRequest, "payments" | "cashReceived" | "customerId"> {
  switch (choice.kind) {
    case "tunai":
      return {
        payments: [{ method: "cash", amount: total }],
        cashReceived: choice.received,
      };
    case "qris":
      return { payments: [{ method: "qris", amount: total }] };
    case "kasbon":
      return {
        payments: [{ method: "credit", amount: total }],
        customerId: choice.customerId,
      };
    case "campuran": {
      const payments: PaymentInput[] = [
        { method: choice.firstMethod, amount: choice.firstAmount },
        { method: "credit", amount: total - choice.firstAmount },
      ];
      return {
        payments,
        customerId: choice.customerId,
        ...(choice.firstMethod === "cash" && choice.received !== null
          ? { cashReceived: choice.received }
          : {}),
      };
    }
  }
}

/** Body createSale dari keranjang; harga yang dilihat kasir dikirim sebagai `expectedUnitPrice`. */
export function buildSaleRequest(
  cart: Pick<CartState, "saleId" | "lines">,
  choice: PaymentChoice,
  print: boolean,
  ownerPin?: string,
): SaleRequest {
  const items = cart.lines.map((line, i): SaleItemInput => {
    const { unitPrice } = cartLineView(line, i);
    return line.amount === null
      ? {
          unitId: line.unitId,
          qtyBase: line.qtyBase,
          expectedUnitPrice: unitPrice,
        }
      : {
          unitId: line.unitId,
          amount: line.amount,
          expectedUnitPrice: unitPrice,
        };
  });
  const { total } = cartSummary(cart.lines);
  return {
    saleId: cart.saleId,
    items,
    ...paymentsFor(choice, total),
    print,
    ...(ownerPin === undefined ? {} : { ownerPin }),
  };
}

const paymentKey = (payments: readonly PaymentInput[]) =>
  payments
    .map((p) => `${p.method}:${p.amount}`)
    .sort()
    .join(",");

/** Penjualan yang dikembalikan server sama dengan yang dikirim (total & pembayaran). */
export function saleMatchesRequest(
  sale: Pick<Sale, "total" | "payments">,
  request: Pick<SaleRequest, "payments">,
): boolean {
  const requested = request.payments.reduce((sum, p) => sum + p.amount, 0);
  return (
    sale.total === requested &&
    paymentKey(sale.payments) === paymentKey(request.payments)
  );
}

// zod/mini: bisa di-tree-shake, menjaga chunk kasir dalam anggaran ukuran.
import { z } from "zod/mini";
import { ApiError } from "./fetcher";
import {
  type CreditLimitProblem,
  type OpnameProblem,
  OpnameProblemCode,
  type PriceChangedProblem,
  ProductField,
  type ProductValidationProblem,
  ProductValidationProblemCode,
  ReceiptField,
  type ReceiptProblem,
  ReceiptProblemCode,
} from "./gen/shaziaMartAPI.schemas";

/** Baca body problem+json dari ApiError sesuai skema; null bila bukan ApiError atau body tak cocok. */
export function readProblem<T>(
  error: unknown,
  schema: z.core.$ZodType<T>,
): T | null {
  if (!(error instanceof ApiError)) return null;
  const parsed = z.safeParse(schema, error.body);
  return parsed.success ? parsed.data : null;
}

export const priceChangedProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.literal("PRICE_CHANGED"),
  detail: z.exactOptional(z.string()),
  changes: z.array(
    z.object({
      unitId: z.string(),
      oldUnitPrice: z.number(),
      newUnitPrice: z.number(),
      newNormalPrice: z.number(),
      newWholesaleTiers: z.array(
        z.object({ minQty: z.number(), price: z.number() }),
      ),
    }),
  ),
}) satisfies z.core.$ZodType<PriceChangedProblem>;

export const creditLimitProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.literal("CREDIT_LIMIT"),
  detail: z.exactOptional(z.string()),
  balance: z.number(),
  creditLimit: z.number(),
  attempted: z.number(),
}) satisfies z.core.$ZodType<CreditLimitProblem>;

const PRODUCT_FIELDS = Object.values(ProductField) as [
  ProductField,
  ...ProductField[],
];

/** 422 `VALIDATION` dari form barang: pesan per field (nama field dari kontrak). */
export const productValidationProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.literal(ProductValidationProblemCode.VALIDATION),
  detail: z.exactOptional(z.string()),
  errors: z.array(
    z.object({ field: z.enum(PRODUCT_FIELDS), message: z.string() }),
  ),
}) satisfies z.core.$ZodType<ProductValidationProblem>;

const RECEIPT_FIELDS = Object.values(ReceiptField) as [
  ReceiptField,
  ...ReceiptField[],
];

/** 422 `VALIDATION` dari nota barang masuk: galat per baris (`lineId`) atau tingkat nota (`null`). */
export const receiptProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.literal(ReceiptProblemCode.VALIDATION),
  detail: z.exactOptional(z.string()),
  errors: z.array(
    z.object({
      lineId: z.nullable(z.string()),
      field: z.enum(RECEIPT_FIELDS),
      message: z.string(),
    }),
  ),
}) satisfies z.core.$ZodType<ReceiptProblem>;

/** 422 `VALIDATION` dari opname: galat per barang (`productId`) atau tingkat sesi (`null`). */
export const opnameProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.literal(OpnameProblemCode.VALIDATION),
  detail: z.exactOptional(z.string()),
  errors: z.array(
    z.object({ productId: z.nullable(z.string()), message: z.string() }),
  ),
}) satisfies z.core.$ZodType<OpnameProblem>;

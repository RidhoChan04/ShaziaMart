// zod/mini: bisa di-tree-shake, menjaga chunk kasir dalam anggaran ukuran.
import { z } from "zod/mini";
import { ApiError } from "./fetcher";
import type {
  CreditLimitProblem,
  PriceChangedProblem,
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

import { z } from "zod";
import { ApiError } from "./fetcher";
import type {
  CreditLimitProblem,
  PriceChangedProblem,
} from "./gen/shaziaMartAPI.schemas";

/** Baca body problem+json dari ApiError sesuai skema; null bila bukan ApiError atau body tak cocok. */
export function readProblem<T>(error: unknown, schema: z.ZodType<T>): T | null {
  if (!(error instanceof ApiError)) return null;
  const parsed = schema.safeParse(error.body);
  return parsed.success ? parsed.data : null;
}

export const priceChangedProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.literal("PRICE_CHANGED"),
  detail: z.string().exactOptional(),
  changes: z.array(
    z.object({
      unitId: z.string(),
      oldUnitPrice: z.number(),
      newUnitPrice: z.number(),
    }),
  ),
}) satisfies z.ZodType<PriceChangedProblem>;

export const creditLimitProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.literal("CREDIT_LIMIT"),
  detail: z.string().exactOptional(),
  balance: z.number(),
  creditLimit: z.number(),
  attempted: z.number(),
}) satisfies z.ZodType<CreditLimitProblem>;

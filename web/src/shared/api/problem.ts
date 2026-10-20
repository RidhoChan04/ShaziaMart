import type { z } from "zod";
import { ApiError } from "./fetcher";

/** Baca body problem+json dari ApiError sesuai skema; null bila bukan ApiError atau body tak cocok. */
export function readProblem<T>(error: unknown, schema: z.ZodType<T>): T | null {
  if (!(error instanceof ApiError)) return null;
  const parsed = schema.safeParse(error.body);
  return parsed.success ? parsed.data : null;
}

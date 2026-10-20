import { afterEach, expect, expectTypeOf, test, vi } from "vitest";
import { ApiError, customFetch } from "./fetcher";
import type { Health } from "./gen/shaziaMartAPI.schemas";
import { useGetHealth } from "./gen/system/system";

function mockFetch(status: number, body: unknown, contentType: string) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(text, { status, headers: { "Content-Type": contentType } }),
    );
}

function mockFetchReject(error: unknown) {
  return vi.spyOn(globalThis, "fetch").mockRejectedValue(error);
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("problem+json menjadi ApiError dengan code", async () => {
  mockFetch(
    409,
    {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      code: "PRICE_CHANGED",
      detail: "Harga berubah",
    },
    "application/problem+json",
  );
  const err = await customFetch("/api/x", {}).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({
    status: 409,
    code: "PRICE_CHANGED",
    detail: "Harga berubah",
  });
});

test("gagal jaringan menjadi NETWORK", async () => {
  mockFetchReject(new TypeError("Failed to fetch"));
  await expect(customFetch("/api/x", {})).rejects.toMatchObject({
    status: 0,
    code: "NETWORK",
  });
});

test("500 non-problem menjadi INTERNAL", async () => {
  mockFetch(500, "oops", "text/plain");
  await expect(customFetch("/api/x", {})).rejects.toMatchObject({
    status: 500,
    code: "INTERNAL",
  });
});

test("503 health (application/json) menjadi INTERNAL", async () => {
  mockFetch(
    503,
    { status: "degraded", version: "1", db: "error" },
    "application/json",
  );
  await expect(customFetch("/api/health", {})).rejects.toMatchObject({
    status: 503,
    code: "INTERNAL",
  });
});

test("problem+json dengan code tak dikenal menjadi INTERNAL", async () => {
  mockFetch(
    400,
    { type: "x", title: "x", status: 400, code: "WAT" },
    "application/problem+json",
  );
  await expect(customFetch("/api/x", {})).rejects.toMatchObject({
    status: 400,
    code: "INTERNAL",
  });
});

test("200 mengembalikan body langsung", async () => {
  mockFetch(200, { ok: true }, "application/json");
  await expect(customFetch("/api/x", {})).resolves.toEqual({ ok: true });
});

test("204 mengembalikan undefined", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 204 }),
  );
  await expect(customFetch("/api/x", {})).resolves.toBeUndefined();
});

test("data hook yang dihasilkan bertipe body", () => {
  const useIt = () => useGetHealth();
  expectTypeOf<ReturnType<typeof useIt>["data"]>().toEqualTypeOf<
    Health | undefined
  >();
});

test("error hook yang dihasilkan bertipe ApiError", () => {
  const useIt = () => useGetHealth();
  expectTypeOf<
    ReturnType<typeof useIt>["error"]
  >().toEqualTypeOf<ApiError | null>();
});

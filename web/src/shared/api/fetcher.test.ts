import { afterEach, expect, test, vi } from "vitest";
import { ApiError, customFetch } from "./fetcher";

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

test("200 mengembalikan envelope orval dengan body", async () => {
  mockFetch(200, { ok: true }, "application/json");
  await expect(customFetch("/api/x", {})).resolves.toMatchObject({
    status: 200,
    data: { ok: true },
  });
});

test("204 tanpa body mengembalikan data undefined", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 204 }),
  );
  await expect(customFetch("/api/x", {})).resolves.toMatchObject({
    status: 204,
    data: undefined,
  });
});

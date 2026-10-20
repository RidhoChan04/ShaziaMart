import { describe, expect, test } from "vitest";
import { newId } from "./id";

describe("newId", () => {
  test("berbentuk UUIDv7 dan urut menurut waktu", () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(a < b).toBe(true);
  });
});

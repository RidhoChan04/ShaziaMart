import { HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getScenario, setScenario, withScenario } from "./scenarios";

afterEach(() => {
  vi.useRealTimers();
});

describe("skenario", () => {
  test("default skenario normal; ?skenario menang atas localStorage", () => {
    expect(getScenario()).toBe("normal");
    localStorage.setItem("mock.skenario", "lambat");
    history.replaceState(null, "", "/?skenario=server-mati");
    expect(getScenario()).toBe("server-mati");
  });

  test("skenario tak dikenal jatuh ke normal", () => {
    history.replaceState(null, "", "/?skenario=ngawur");
    expect(getScenario()).toBe("normal");
  });

  test("health normal 200, server-mati gagal jaringan", async () => {
    setScenario("normal");
    await expect(fetch("/api/health").then((r) => r.status)).resolves.toBe(200);
    setScenario("server-mati");
    await expect(fetch("/api/health")).rejects.toThrow();
  });

  test("lambat menunda >= 1500 ms", async () => {
    setScenario("lambat");
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const resolver = vi.fn(() => HttpResponse.json({ ok: true }));
    const wrapped = withScenario(resolver);
    let done = false;
    const pending = Promise.resolve(wrapped({} as never)).then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).toBe(false);
    expect(resolver).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  test("skenario lain meneruskan resolver tanpa perubahan", async () => {
    setScenario("harga-berubah");
    const resolver = vi.fn(() => HttpResponse.json({ ok: true }));
    await withScenario(resolver)({} as never);
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});

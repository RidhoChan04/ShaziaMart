import { delay, HttpResponse, type HttpResponseResolver } from "msw";

export const scenarios = [
  "normal",
  "server-mati",
  "lambat",
  "harga-berubah",
  "printer-gagal",
  "stok-minus",
] as const;

export type Scenario = (typeof scenarios)[number];

const STORAGE_KEY = "mock.skenario";
const SLOW_DELAY_MS = 1500;

function isScenario(value: unknown): value is Scenario {
  return (
    typeof value === "string" &&
    (scenarios as readonly string[]).includes(value)
  );
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Query `?skenario=` menang atas localStorage; nilai tak dikenal jatuh ke "normal". */
export function getScenario(): Scenario {
  const fromQuery = new URLSearchParams(window.location.search).get("skenario");
  if (fromQuery !== null) return isScenario(fromQuery) ? fromQuery : "normal";
  const stored = readStorage();
  return isScenario(stored) ? stored : "normal";
}

export function setScenario(s: Scenario): void {
  try {
    localStorage.setItem(STORAGE_KEY, s);
  } catch {
    // penyimpanan tidak tersedia; skenario tetap normal
  }
}

/** Skenario dibaca saat request, bukan saat modul dimuat. */
export function withScenario(
  resolver: HttpResponseResolver,
): HttpResponseResolver {
  return async (info) => {
    const scenario = getScenario();
    if (scenario === "server-mati") return HttpResponse.error();
    if (scenario === "lambat") await delay(SLOW_DELAY_MS);
    return resolver(info);
  };
}

import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { type ChangeEvent, useEffect, useId, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { mockDb } from "./db";
import {
  getScenario,
  type Scenario,
  scenarios,
  setScenario,
} from "./scenarios";

function isScenario(value: string): value is Scenario {
  return (scenarios as readonly string[]).includes(value);
}

/**
 * `?skenario=` di URL menang atas localStorage. Agar panel tetap bisa mengganti
 * skenario (dan skenario bertahan setelah pindah halaman), nilai dari URL
 * disimpan lalu parameter itu dibuang dari URL.
 */
function adoptScenarioFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("skenario")) return;
  setScenario(getScenario());
  url.searchParams.delete("skenario");
  window.history.replaceState(window.history.state, "", url);
}

/** Panel pengembang; hanya dirender saat backend palsu (MSW) aktif. */
export function DevPanel() {
  const queryClient = useQueryClient();
  const selectId = useId();
  const [scenario, setLocalScenario] = useState<Scenario>(getScenario);
  const onOwner = useLocation({
    select: (l) => l.pathname.startsWith("/owner"),
  });

  useEffect(() => {
    adoptScenarioFromUrl();
  }, []);

  function onScenarioChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (!isScenario(next)) return;
    setScenario(next);
    setLocalScenario(next);
    void queryClient.invalidateQueries();
  }

  function onReset() {
    mockDb.reset();
    void queryClient.invalidateQueries();
  }

  return (
    <aside
      aria-label="Panel pengembang"
      className={cn(
        "fixed right-3 z-50 flex items-center gap-2 rounded-md border border-border bg-surface p-2 text-xs text-text shadow-md",
        // Di owner (HP) jangan menutupi tab bawah.
        onOwner
          ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-3"
          : "bottom-3",
      )}
    >
      <label htmlFor={selectId} className="font-medium">
        Skenario
      </label>
      <select
        id={selectId}
        value={scenario}
        onChange={onScenarioChange}
        className="h-8 rounded-md border border-border bg-surface px-2"
      >
        {scenarios.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onReset}
        className="h-8 rounded-md border border-border bg-surface px-2 font-medium hover:bg-primary-soft"
      >
        Reset data
      </button>
    </aside>
  );
}

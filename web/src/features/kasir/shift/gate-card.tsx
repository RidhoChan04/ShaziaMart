import type { ReactNode } from "react";

/** Kartu di tengah area konten untuk layar gerbang (buka shift, kunci). */
export function GateCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center overflow-auto p-6">
      <div className="grid w-full max-w-sm gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-center text-2xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

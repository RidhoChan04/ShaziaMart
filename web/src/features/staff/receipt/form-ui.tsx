import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export function SectionHeading({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mt-5 mb-1.5 flex items-baseline justify-between px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
      <h2>{children}</h2>
      {aside && <span className="normal-case">{aside}</span>}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border rounded-lg bg-surface shadow-sm">
      {children}
    </div>
  );
}

export function FieldError({
  id,
  messages,
}: {
  id?: string;
  messages: readonly string[];
}) {
  if (messages.length === 0) return null;
  return (
    <div id={id} role="alert" className="px-4 pb-2.5">
      {messages.map((m) => (
        <p key={m} className="text-[13px] font-medium text-danger">
          {m}
        </p>
      ))}
    </div>
  );
}

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

/** Pilihan satu dari beberapa (radio) berupa tombol segmen; `value` null = belum ada yang dipilih. */
export function Segmented<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  note,
}: {
  name: string;
  label: string;
  options: readonly SegmentOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  note?: string | undefined;
}) {
  const labelId = `${name}-label`;
  return (
    <div className="grid gap-1.5 px-4 py-3">
      <span id={labelId} className="text-[13px] font-medium text-muted">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex gap-1 rounded-lg bg-bg p-1"
      >
        {options.map((o) => (
          <label key={o.value} className="min-w-0 flex-1">
            <input
              type="radio"
              name={name}
              checked={o.value === value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-11 items-center justify-center rounded-md px-2 text-center text-[15px] font-medium peer-checked:bg-surface peer-checked:text-primary peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
                o.disabled && "text-muted/60",
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {note && <p className="text-[13px] text-muted">{note}</p>}
    </div>
  );
}

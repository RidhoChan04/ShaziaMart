import { useServerHealth } from "@/shared/hooks/use-server-health";
import { cn } from "@/shared/lib/cn";

export function ServerStatus({ className }: { className?: string }) {
  const { online, checking } = useServerHealth();
  const label = checking
    ? "● Memeriksa server…"
    : online
      ? "● Server tersambung"
      : "● Server tidak tersambung";
  return (
    <span
      className={cn(
        checking ? "text-muted" : online ? "text-primary" : "text-danger",
        className,
      )}
    >
      {label}
    </span>
  );
}

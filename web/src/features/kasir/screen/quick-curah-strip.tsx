import { useListQuickCurah } from "@/shared/api/gen/catalog/catalog";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { Button } from "@/shared/ui/button";

export function QuickCurahStrip({
  openProductId,
  onCurah,
}: {
  /** Barang yang jendela curahnya sedang terbuka. */
  openProductId: string | null;
  onCurah: (match: CatalogMatch) => void;
}) {
  const { data } = useListQuickCurah({ query: { staleTime: 60_000 } });
  if (!data?.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {data.map((m) => (
        <Button
          key={m.product.id}
          variant="ghost"
          aria-haspopup="dialog"
          aria-expanded={m.product.id === openProductId}
          className="bg-primary-soft font-semibold text-primary hover:bg-primary-soft/70"
          onClick={() => onCurah(m)}
        >
          {m.product.name} curah
        </Button>
      ))}
    </div>
  );
}

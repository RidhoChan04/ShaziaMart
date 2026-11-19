import { Link } from "@tanstack/react-router";
import {
  Bell,
  ChartColumn,
  ChevronRight,
  Layers,
  type LucideIcon,
  NotebookPen,
  Phone,
  Receipt,
  Store,
} from "lucide-react";
import { useGetOwnerSettings } from "@/shared/api/gen/owner/owner";
import type { OwnerSettings } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList } from "../products/detail/section";
import {
  SECTION_TITLES,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "./settings-sections";

const ICONS: Record<SettingsSection, LucideIcon> = {
  toko: Store,
  kasir: Receipt,
  kasbon: NotebookPen,
  stok: Layers,
  laporan: ChartColumn,
  perhatian: Bell,
  telepon: Phone,
};

/** Keterangan tetap per kelompok (§12g); hanya baris telepon menampilkan nilainya. */
const CAPTIONS: Record<Exclude<SettingsSection, "telepon">, string> = {
  toko: "Nama, alamat, struk, gambar QRIS",
  kasir: "Stok minus dan curah",
  kasbon: "Limit pelanggan baru",
  stok: "Kedaluwarsa, batas opname",
  laporan: "Untung tipis, tidak terjual",
  perhatian: "Batas selisih, kas keluar, shift, QRIS",
};

function summaryOf(section: SettingsSection, s: OwnerSettings): string {
  return section === "telepon"
    ? (s.ownerPhone ?? "Belum diisi")
    : CAPTIONS[section];
}

/** Lainnya › Pengaturan: satu baris per kelompok dengan keterangan tetap. */
export function SettingsPage() {
  const query = useGetOwnerSettings();
  const settings = query.data;
  return (
    <div className="grid gap-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <SubPageHeader
        title="Pengaturan"
        back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
      />
      {settings ? (
        <div className="overflow-hidden rounded-lg bg-surface lg:max-w-2xl">
          <RowList>
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = ICONS[section];
              return (
                <li key={section}>
                  <Link
                    to="/owner/lainnya/pengaturan/$bagian"
                    params={{ bagian: section }}
                    className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-[30px] shrink-0 place-items-center rounded-md bg-primary-soft text-primary"
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="text-[17px]">
                        {SECTION_TITLES[section]}
                      </span>
                      <span className="truncate text-[13px] text-muted">
                        {summaryOf(section, settings)}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted"
                    />
                  </Link>
                </li>
              );
            })}
          </RowList>
        </div>
      ) : query.isError ? (
        <div className="grid justify-items-start gap-3">
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(query.error)}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : (
        <p role="status" className="text-muted">
          Memuat…
        </p>
      )}
    </div>
  );
}

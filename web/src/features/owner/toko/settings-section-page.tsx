import { useParams } from "@tanstack/react-router";
import { useGetOwnerSettings } from "@/shared/api/gen/owner/owner";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../common/sub-page-header";
import { AttentionSection } from "./settings-attention-section";
import { CreditSection } from "./settings-credit-section";
import { KasirSection } from "./settings-kasir-section";
import { PhoneSection } from "./settings-phone-section";
import { ReportSection } from "./settings-report-section";
import { SECTION_TITLES, type SettingsSection } from "./settings-sections";
import { StockSection } from "./settings-stock-section";
import { StoreSection } from "./settings-store-section";

const SECTIONS = {
  toko: StoreSection,
  kasir: KasirSection,
  kasbon: CreditSection,
  stok: StockSection,
  laporan: ReportSection,
  perhatian: AttentionSection,
  telepon: PhoneSection,
} satisfies Record<SettingsSection, unknown>;

/** Satu kelompok Pengaturan; Simpan hanya mengirim bagian ini. Rute sudah menolak `$bagian` yang tidak dikenal. */
export function SettingsSectionPage() {
  const { bagian } = useParams({ from: "/owner/lainnya/pengaturan/$bagian" });
  const section = bagian as SettingsSection;
  const Section = SECTIONS[section];
  const query = useGetOwnerSettings();
  const settings = query.data;
  return (
    <div className="grid gap-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <SubPageHeader
        title={SECTION_TITLES[section]}
        eyebrow="Pengaturan"
        back={{ label: "Pengaturan", fallback: "/owner/lainnya" }}
      />
      {settings ? (
        // Kunci per kelompok: isian dimulai dari nilai tersimpan setiap kali bagian dibuka.
        <Section key={section} settings={settings} />
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

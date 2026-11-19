import { SubPageHeader } from "../common/sub-page-header";

export function SettingsSectionPage() {
  return (
    <SubPageHeader
      title="Pengaturan"
      back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
    />
  );
}

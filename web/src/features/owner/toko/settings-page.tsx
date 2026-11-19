import { SubPageHeader } from "../common/sub-page-header";

export function SettingsPage() {
  return (
    <SubPageHeader
      title="Pengaturan"
      back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
    />
  );
}

import { SubPageHeader } from "../common/sub-page-header";

export function KasirAccountPage() {
  return (
    <SubPageHeader
      title="Akun kasir"
      back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
    />
  );
}

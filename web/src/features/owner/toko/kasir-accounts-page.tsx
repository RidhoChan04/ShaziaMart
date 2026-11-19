import { SubPageHeader } from "../common/sub-page-header";

export function KasirAccountsPage() {
  return (
    <SubPageHeader
      title="Akun kasir"
      back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
    />
  );
}

import { SubPageHeader } from "../common/sub-page-header";

export function QrisPage() {
  return (
    <SubPageHeader
      title="QRIS harian"
      back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
    />
  );
}

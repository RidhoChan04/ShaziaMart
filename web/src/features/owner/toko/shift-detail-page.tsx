import { SubPageHeader } from "../common/sub-page-header";

export function ShiftDetailPage() {
  return (
    <SubPageHeader
      title="Shift"
      back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
    />
  );
}

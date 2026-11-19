import { SubPageHeader } from "../common/sub-page-header";

export function ShiftsPage() {
  return (
    <SubPageHeader
      title="Shift & kas"
      back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
    />
  );
}

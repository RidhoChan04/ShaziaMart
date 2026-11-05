import { SubPageHeader } from "../common/sub-page-header";

/** Detail pelanggan: kerangka rute; isinya diisi Task 7. */
export function CustomerPage() {
  return (
    <div>
      <SubPageHeader
        title="Pelanggan"
        back={{ label: "Kasbon", fallback: "/owner/kasbon" }}
      />
      <p className="text-muted">Segera hadir</p>
    </div>
  );
}

import { SubPageHeader } from "../common/sub-page-header";

export function AttentionAllPage() {
  return (
    <SubPageHeader
      title="Perlu perhatian"
      back={{ label: "Beranda", fallback: "/owner" }}
    />
  );
}

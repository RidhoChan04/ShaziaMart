import { KasirScreen } from "./screen/kasir-screen";
import { KasirGate } from "./shift/kasir-gate";

export function KasirPage() {
  return (
    <KasirGate>
      <KasirScreen />
    </KasirGate>
  );
}

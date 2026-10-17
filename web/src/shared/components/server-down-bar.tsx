import { WifiOff } from "lucide-react";

export function ServerDownBar() {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 bg-danger px-4 py-2 font-medium text-white"
    >
      <WifiOff aria-hidden="true" />
      Server tidak tersambung — transaksi belum bisa disimpan
    </div>
  );
}

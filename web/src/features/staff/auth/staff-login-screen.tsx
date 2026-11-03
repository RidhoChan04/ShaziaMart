import { useQueryClient } from "@tanstack/react-query";
import { Package, Wifi } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { User } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useListStaffUsers, useStaffLogin } from "@/shared/api/gen/staff/staff";
import { PinPad } from "@/shared/components/pin-pad";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { setStaffSession } from "./staff-session";

/** Kerangka layar masuk: ikon app, merek, isi, lalu catatan "hanya Wi-Fi toko". */
function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center gap-5 bg-bg px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="grid justify-items-center gap-2.5 text-center">
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center rounded-[14px] bg-linear-155 from-primary to-primary-deep text-primary-foreground shadow-sm"
        >
          <Package className="size-7" />
        </span>
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">
            ShaziaMart · Stok
          </h1>
          <p className="text-sm text-muted">Masuk dengan akun kasir</p>
        </div>
      </div>
      {children}
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
        <Wifi aria-hidden="true" className="size-4" />
        Hanya bisa dipakai di Wi-Fi toko
      </p>
    </main>
  );
}

/** Kegagalan yang hanya bisa diatasi dengan mencoba lagi (server mati, di luar Wi-Fi toko). */
function Failure({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="grid justify-items-center gap-3 text-center">
      <p role="alert" className="text-sm font-medium text-danger">
        {message}
      </p>
      <Button variant="outline" onClick={onRetry} disabled={retrying}>
        Coba lagi
      </Button>
    </div>
  );
}

/** Sesi belum bisa diperiksa: tampilkan alasannya dan biarkan orang toko mencoba lagi. */
export function StaffUnavailableScreen({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <AuthFrame>
      <Failure
        message={pesanError(error)}
        onRetry={onRetry}
        retrying={retrying}
      />
    </AuthFrame>
  );
}

function NamePicker({
  users,
  picked,
  onPick,
}: {
  users: readonly User[];
  picked: User;
  onPick: (user: User) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-3">
      {users.map((user) => (
        <button
          key={user.id}
          type="button"
          aria-pressed={user.id === picked.id}
          onClick={() => onPick(user)}
          className="group flex min-h-11 min-w-14 flex-col items-center gap-1.5 rounded-md text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-pressed:font-bold"
        >
          <span
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-full bg-surface text-[19px] font-semibold shadow-sm transition-transform duration-100 group-active:scale-95 group-aria-pressed:bg-primary group-aria-pressed:text-primary-foreground group-aria-pressed:ring-2 group-aria-pressed:ring-primary group-aria-pressed:ring-offset-2 group-aria-pressed:ring-offset-bg motion-reduce:transition-none motion-reduce:group-active:scale-100"
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
          {user.name}
        </button>
      ))}
    </div>
  );
}

/** Login orang toko: pilih nama akun kasir (default pertama) lalu PIN 6 digit. */
export function StaffLoginScreen() {
  const client = useQueryClient();
  const users = useListStaffUsers();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const login = useStaffLogin({
    mutation: { onSuccess: (session) => setStaffSession(client, session) },
  });

  if (users.isError) {
    return (
      <AuthFrame>
        <Failure
          message={pesanError(users.error)}
          onRetry={() => void users.refetch()}
          retrying={users.isFetching}
        />
      </AuthFrame>
    );
  }
  const list = users.data ?? [];
  const picked = list.find((u) => u.id === pickedId) ?? list[0];

  return (
    <AuthFrame>
      {users.isPending && <p className="text-muted">Memuat…</p>}
      {picked && (
        <>
          <NamePicker
            users={list}
            picked={picked}
            onPick={(user) => {
              setPickedId(user.id);
              login.reset();
            }}
          />
          <div className="grid justify-items-center gap-1">
            <p className="text-[15px] font-semibold">{`Masukkan PIN ${picked.name}`}</p>
            {/* Kunci per nama: ganti nama mengosongkan PIN dan memfokuskan isiannya lagi. */}
            <PinPad
              key={picked.id}
              pending={login.isPending}
              error={login.isError ? pesanError(login.error) : null}
              onComplete={(pin) =>
                login.mutate({ data: { userId: picked.id, pin } })
              }
            />
          </div>
        </>
      )}
    </AuthFrame>
  );
}

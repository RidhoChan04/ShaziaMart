import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useOwnerLogin } from "@/shared/api/gen/owner/owner";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { setOwnerSession } from "./owner-session";

/** Login pemilik: nama + password; setelah berhasil tetap di halaman yang dibuka. */
export function OwnerLoginScreen() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const login = useOwnerLogin({
    mutation: { onSuccess: (session) => setOwnerSession(client, session) },
  });
  const filled = name.trim() !== "" && password !== "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (filled) login.mutate({ data: { name, password } });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <form
        onSubmit={submit}
        className="grid w-full max-w-sm gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm"
      >
        <div className="text-center">
          <p className="text-base font-bold text-primary">ShaziaMart</p>
          <h1 className="text-2xl font-bold">Masuk pemilik</h1>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="owner-name" className="text-sm font-medium">
            Nama
          </label>
          <Input
            id="owner-name"
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="owner-password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="owner-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {login.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(login.error)}
          </p>
        )}
        <Button type="submit" size="lg" disabled={!filled || login.isPending}>
          Masuk
        </Button>
      </form>
    </main>
  );
}

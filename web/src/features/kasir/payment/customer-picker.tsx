import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import {
  getSearchCustomersQueryKey,
  useCreateCustomer,
  useSearchCustomers,
} from "@/shared/api/gen/credit/credit";
import type { Customer } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const DEBOUNCE_MS = 150;

function CustomerInfo({ customer }: { customer: Customer }) {
  return (
    <>
      <span className="block font-medium">{`${customer.name} · ${customer.phone}`}</span>
      <span className="block text-sm text-muted tabular-nums">
        {`Saldo ${formatRupiah(customer.balance)} · Limit ${formatRupiah(customer.creditLimit)}`}
      </span>
    </>
  );
}

function validate(name: string, phone: string) {
  return {
    name: name.trim().length < 2 ? "Nama minimal 2 huruf" : null,
    phone: /^\d{8,15}$/.test(phone) ? null : "No. HP harus 8–15 digit angka",
  };
}

function NewCustomerForm({ onCreated }: { onCreated: (c: Customer) => void }) {
  const ids = { name: useId(), phone: useId() };
  const queryClient = useQueryClient();
  const create = useCreateCustomer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shown, setShown] = useState(false);
  const errors = validate(name, phone);

  function save() {
    setShown(true);
    if (errors.name || errors.phone || create.isPending) return;
    create.mutate(
      { data: { name: name.trim(), phone } },
      {
        onSuccess: (customer) => {
          void queryClient.invalidateQueries({
            queryKey: getSearchCustomersQueryKey(),
          });
          onCreated(customer);
        },
      },
    );
  }

  const field = (
    key: "name" | "phone",
    label: string,
    value: string,
    set: (v: string) => void,
  ) => (
    <div className="grid gap-1">
      <label htmlFor={ids[key]} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={ids[key]}
        value={value}
        autoComplete="off"
        inputMode={key === "phone" ? "numeric" : "text"}
        aria-invalid={shown && errors[key] !== null}
        onChange={(e) => set(e.target.value)}
      />
      {shown && errors[key] && (
        <span className="text-sm text-danger">{errors[key]}</span>
      )}
    </div>
  );

  return (
    <div className="grid gap-2 rounded-md border border-border p-2">
      {field("name", "Nama", name, setName)}
      {field("phone", "No. HP", phone, setPhone)}
      {create.isError && (
        <p role="alert" className="text-sm text-danger">
          {pesanError(create.error)}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={create.isPending}
        onClick={save}
      >
        Simpan pelanggan
      </Button>
    </div>
  );
}

/** Pilih pelanggan kasbon: cari nama/no. HP atau tambah baru. */
export function CustomerPicker({
  value,
  onChange,
}: {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
}) {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [refocus, setRefocus] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    if (refocus && value === null) searchRef.current?.focus();
  }, [refocus, value]);

  const search = useSearchCustomers(
    { q },
    // Daftar lama tetap tampil selama pencarian baru dimuat (tanpa kedip).
    { query: { enabled: value === null, placeholderData: keepPreviousData } },
  );

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-primary bg-primary-soft p-2">
        <div>
          <CustomerInfo customer={value} />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setRefocus(true);
            onChange(null);
          }}
        >
          Ganti pelanggan
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={searchId} className="text-xs text-muted">
        Cari pelanggan
      </label>
      <Input
        id={searchId}
        ref={searchRef}
        type="search"
        autoComplete="off"
        placeholder="Nama atau no. HP"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {search.isError && (
        <p role="alert" className="text-sm text-danger">
          {pesanError(search.error)}
        </p>
      )}
      <ul
        aria-label="Pelanggan"
        className="grid max-h-44 gap-1 overflow-y-auto"
      >
        {search.data?.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="w-full rounded-md border border-border px-3 py-1.5 text-left hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => onChange(c)}
            >
              <CustomerInfo customer={c} />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <NewCustomerForm onCreated={onChange} />
      ) : (
        <Button type="button" variant="ghost" onClick={() => setAdding(true)}>
          Tambah pelanggan
        </Button>
      )}
    </div>
  );
}

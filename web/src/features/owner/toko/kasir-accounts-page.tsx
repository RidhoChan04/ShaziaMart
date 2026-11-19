import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useListOwnerKasirAccounts } from "@/shared/api/gen/owner/owner";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList, Section } from "../products/detail/section";
import { KasirAddSheet } from "./kasir-add-sheet";
import { KasirStatus } from "./kasir-status";

/** Daftar akun kasir + Tambah kasir. */
export function KasirAccountsPage() {
  const query = useListOwnerKasirAccounts();
  // Urutan nama dari server; akun nonaktif dipindah ke bawah (urutan di dalam kelompok tetap).
  const accounts = query.data && [
    ...query.data.filter((a) => a.active),
    ...query.data.filter((a) => !a.active),
  ];
  return (
    <div className="lg:max-w-2xl">
      <SubPageHeader
        title="Akun kasir"
        back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
      />
      {accounts ? (
        <div className="grid gap-4">
          <Section title="Kasir">
            {accounts.length === 0 ? (
              <p className="px-4 py-8 text-center text-muted">
                Belum ada akun kasir
              </p>
            ) : (
              <RowList>
                {accounts.map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/owner/lainnya/kasir/$userId"
                      params={{ userId: a.id }}
                      className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                    >
                      <span className="grid min-w-0 flex-1 justify-items-start gap-0.5">
                        <span className="text-[17px] leading-snug font-semibold break-words">
                          {a.name}
                        </span>
                        <KasirStatus account={a} />
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted"
                      />
                    </Link>
                  </li>
                ))}
              </RowList>
            )}
          </Section>
          <KasirAddSheet />
        </div>
      ) : query.isError ? (
        <div className="grid justify-items-start gap-3">
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(query.error)}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : (
        <p role="status" className="text-muted">
          Memuat…
        </p>
      )}
    </div>
  );
}

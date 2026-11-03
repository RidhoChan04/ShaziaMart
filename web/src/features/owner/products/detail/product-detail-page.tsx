import { Link, useParams, useSearch } from "@tanstack/react-router";
import { ApiError } from "@/shared/api/fetcher";
import { useGetOwnerProduct } from "@/shared/api/gen/owner/owner";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../../common/sub-page-header";
import { productBadges } from "../product-model";
import { StatusBadge } from "../status-badge";
import { BarcodeCard } from "./barcode-card";
import { PriceCard } from "./price-card";
import { PriceHistoryCard } from "./price-history-card";
import { StatusCard } from "./status-card";
import { StockCard } from "./stock-card";
import { StockOutDialog } from "./stock-out-dialog";

const ubahPill =
  "inline-flex h-11 items-center rounded-full bg-surface px-4 text-[15px] font-semibold text-primary shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

export function ProductNotFound() {
  return (
    <div className="grid justify-items-start gap-4 pt-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em]">
        Barang tidak ditemukan
      </h1>
      <Link
        to="/owner/barang"
        className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Kembali ke daftar barang
      </Link>
    </div>
  );
}

export function ProductDetailPage() {
  const { productId } = useParams({ from: "/owner/barang/$productId" });
  const { lembar } = useSearch({ from: "/owner/barang/$productId" });
  const query = useGetOwnerProduct(productId);
  const product = query.data;

  if (!product) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <ProductNotFound />;
    }
    if (query.isError) {
      return (
        <div className="grid justify-items-start gap-3 pt-6">
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(query.error)}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      );
    }
    return (
      <p role="status" className="pt-6 text-muted">
        Memuat…
      </p>
    );
  }

  const eceran = product.units[0];
  const unitName = eceran?.name ?? "";
  // Menipis dan Minus tampil di kartu Stok bersama angkanya; sisanya di sini.
  const badges = productBadges(product).filter(
    (b) => b.key !== "minus" && b.key !== "menipis",
  );

  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title={product.name}
        eyebrow={
          product.category
            ? `${product.category} · dijual per ${unitName}`
            : `dijual per ${unitName}`
        }
        back={{ label: "Barang", fallback: "/owner/barang" }}
        action={
          <Link
            to="/owner/barang/$productId/ubah"
            params={{ productId: product.id }}
            className={ubahPill}
          >
            Ubah
          </Link>
        }
      />
      {badges.length > 0 && (
        <ul
          // biome-ignore lint/a11y/noRedundantRoles: Safari/VoiceOver membuang semantik daftar bila list-style none
          role="list"
          aria-label="Tanda status"
          className="mb-3 flex flex-wrap gap-2"
        >
          {badges.map((b) => (
            <li key={b.key}>
              <StatusBadge badge={b} />
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-5 lg:max-w-5xl lg:grid-cols-2 lg:items-start">
        <div className="grid gap-5">
          <PriceCard product={product} />
          <StockCard product={product} />
        </div>
        <div className="grid gap-5">
          <BarcodeCard product={product} />
          <PriceHistoryCard product={product} />
          <StatusCard product={product} />
        </div>
      </div>
      {/* ?lembar=harga: Task 11 memasang lembar Ubah harga di sini (priceLines + costAlert); sampai itu parameter diabaikan. */}
      <StockOutDialog product={product} requested={lembar === "habis"} />
    </div>
  );
}

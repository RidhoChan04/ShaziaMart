import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  DRAFT_ID,
  renderForm,
  storeWithDraft,
} from "@/features/staff/receipt/form-test-kit";
import { ownerLogin, staffLogin } from "@/mocks/handlers/test-helpers";
import { setScenario } from "@/mocks/scenarios";
import { renderApp } from "@/test/render-app";

test("/ redirect ke /kasir", async () => {
  const { router } = renderApp("/");
  const header = await screen.findByRole("banner");
  expect(within(header).getByText("ShaziaMart")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/kasir");
});

test("layout kasir: status server; Riwayat/Kunci hanya saat sesi + shift", async () => {
  renderApp("/kasir");
  expect(await screen.findByText("● Server tersambung")).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Buka shift" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Riwayat" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Kunci" })).toBeNull();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("layout kasir menampilkan ServerDownBar saat offline", async () => {
  setScenario("server-mati");
  renderApp("/kasir");
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    "Server tidak tersambung — transaksi belum bisa disimpan",
  );
});

test("halaman tak dikenal menampilkan pesan Indonesia", async () => {
  renderApp("/ngawur");
  expect(
    await screen.findByText("Halaman tidak ditemukan"),
  ).toBeInTheDocument();
});

test("start_url PWA /owner/ (garis miring di akhir) membuka Beranda", async () => {
  await ownerLogin();
  renderApp("/owner/");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Beranda" }),
  ).toBeInTheDocument();
});

test("rute Barang: validateSearch menyimpan q, kategori, nonaktif; nonaktif=salah dibuang", async () => {
  await ownerLogin();
  const { router } = renderApp(
    "/owner/barang?q=indo&kategori=Kopi&nonaktif=true",
  );
  await screen.findByRole("heading", { level: 1, name: "Barang" });
  expect(router.state.matches.at(-1)?.search).toEqual({
    q: "indo",
    kategori: "Kopi",
    nonaktif: true,
  });

  const validate = router.routesByPath["/owner/barang"].options.validateSearch;
  if (typeof validate !== "function") throw new Error("tanpa validateSearch");
  expect(validate({ nonaktif: "salah", q: 5, kategori: "" })).toEqual({});
  expect(validate({ nonaktif: "true" })).toEqual({ nonaktif: true });
});

test("rute sub-halaman Barang: baru, impor, detail (lembar valid saja), ubah", async () => {
  await ownerLogin();
  const { router } = renderApp("/owner/barang/abc?lembar=harga");
  // Detail sungguhan (id "abc" tidak ada → halaman tidak ditemukan), bukan placeholder.
  await screen.findByRole("heading", {
    level: 1,
    name: "Barang tidak ditemukan",
  });
  expect(router.state.matches.at(-1)?.search).toEqual({ lembar: "harga" });

  await router.navigate({
    to: "/owner/barang/$productId",
    params: { productId: "abc" },
    search: { lembar: "habis" },
  });
  expect(router.state.matches.at(-1)?.search).toEqual({ lembar: "habis" });

  const validate =
    router.routesByPath["/owner/barang/$productId"].options.validateSearch;
  if (typeof validate !== "function") throw new Error("tanpa validateSearch");
  expect(validate({ lembar: "ngawur" })).toEqual({});

  await router.navigate({ to: "/owner/barang/baru" });
  expect(router.state.location.pathname).toBe("/owner/barang/baru");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Barang baru" }),
  ).toBeInTheDocument();

  await router.navigate({ to: "/owner/barang/impor" });
  expect(router.state.location.pathname).toBe("/owner/barang/impor");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Impor dari Excel" }),
  ).toBeInTheDocument();

  await router.navigate({
    to: "/owner/barang/$productId/ubah",
    params: { productId: "abc" },
  });
  expect(router.state.location.pathname).toBe("/owner/barang/abc/ubah");
  expect(
    await screen.findByRole("heading", { name: "Barang tidak ditemukan" }),
  ).toBeInTheDocument();
});

test("router: /staff memuat chunk terpisah (lazyRouteComponent loadStaff); /staff/tidak-ada → Halaman tidak ditemukan", async () => {
  await staffLogin("Rina");
  const { router } = renderApp("/staff/tidak-ada");
  expect(
    await screen.findByText("Halaman tidak ditemukan"),
  ).toBeInTheDocument();

  const staffPaths = [
    "/staff",
    "/staff/",
    "/staff/masuk",
    "/staff/masuk/baru",
    "/staff/masuk/$receiptId",
    "/staff/opname",
    "/staff/kedaluwarsa",
    "/staff/lainnya",
  ] as const;
  for (const path of staffPaths) {
    const component = router.routesById[path].options.component as
      | { preload?: unknown }
      | undefined;
    // lazyRouteComponent → komponen dengan `preload`, bukan impor statis.
    expect(typeof component?.preload, path).toBe("function");
  }
});

test("rute /staff/masuk/baru: formulir nota sungguhan; validateSearch menyimpan draf & langkah=bayar saja", async () => {
  await staffLogin("Rina");
  const { router } = renderApp("/staff/masuk/baru?draf=d1&langkah=bayar");
  await screen.findByRole("heading", { level: 1, name: "Barang masuk" });
  const validate =
    router.routesByPath["/staff/masuk/baru"].options.validateSearch;
  if (typeof validate !== "function") throw new Error("tanpa validateSearch");
  expect(validate({ draf: "", langkah: "ngawur" })).toEqual({});
  expect(validate({ draf: 5 })).toEqual({});
});

test("rute /staff/masuk/baru: draf milik pengguna + langkah=bayar bertahan, langkah bayar tampil", async () => {
  await staffLogin("Rina");
  const { router } = renderForm(
    await storeWithDraft(),
    `/staff/masuk/baru?draf=${DRAFT_ID}&langkah=bayar`,
  );
  await screen.findByRole("heading", { name: "Pembayaran" });
  expect(router.state.location.search).toEqual({
    draf: DRAFT_ID,
    langkah: "bayar",
  });
});

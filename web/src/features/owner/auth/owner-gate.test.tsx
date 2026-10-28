import {
  type QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { problem } from "@/mocks/handlers/respond";
import { login, ownerLogin, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import { customFetch } from "@/shared/api/fetcher";
import { getGetSessionQueryKey, getSession } from "@/shared/api/gen/auth/auth";
import {
  getGetOwnerSessionQueryKey,
  getGetOwnerTodaySummaryQueryKey,
  getOwnerTodaySummary,
} from "@/shared/api/gen/owner/owner";
import { renderApp } from "@/test/render-app";

const loginHeading = () =>
  screen.findByRole("heading", { level: 1, name: "Masuk pemilik" });
const page = (name: string) => screen.findByRole("heading", { level: 1, name });

async function submitLogin(name: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nama"), name);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Masuk" }));
  return user;
}

test("tanpa sesi → Masuk pemilik; Pak Ahmad / pemilik123 → Beranda", async () => {
  renderApp("/owner");
  expect(await loginHeading()).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Nama")).toHaveAttribute(
    "autocomplete",
    "username",
  );
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  expect(screen.getByLabelText("Password")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  expect(screen.getByRole("button", { name: "Masuk" })).toBeDisabled();

  await submitLogin("Pak Ahmad", "pemilik123");
  expect(await page("Beranda")).toBeInTheDocument();
  expect(
    screen.getByRole("navigation", { name: "Navigasi utama" }),
  ).toBeInTheDocument();
  expect(mockDb.get().ownerSession).not.toBeNull();
});

test("sesi masih diperiksa → Memuat…, bukan layar kosong", async () => {
  setScenario("lambat");
  const { router } = renderApp("/owner");
  // Chunk pemilik sudah dimuat; yang tertunda hanya pemeriksaan sesi.
  await waitFor(() => expect(router.state.status).toBe("idle"));
  expect(screen.getByRole("status")).toHaveTextContent("Memuat…");
  expect(await loginHeading()).toBeInTheDocument();
});

test("tautan langsung /owner/laporan: setelah login tetap di Laporan", async () => {
  renderApp("/owner/laporan");
  await loginHeading();
  await submitLogin("Pak Ahmad", "pemilik123");
  expect(await page("Laporan")).toBeInTheDocument();
});

test("password salah → 'Nama atau password salah'", async () => {
  renderApp("/owner");
  await loginHeading();
  await submitLogin("Pak Ahmad", "salah");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Nama atau password salah",
  );
  expect(screen.getByRole("heading", { name: "Masuk pemilik" })).toBeVisible();
});

test("terkunci setelah 5x salah → pesan Terlalu banyak…", async () => {
  for (let i = 0; i < 4; i += 1) await ownerLogin("Pak Ahmad", "salah");
  renderApp("/owner");
  await loginHeading();
  await submitLogin("Pak Ahmad", "salah");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Terlalu banyak percobaan salah — coba lagi dalam 5 menit",
  );
});

test("kasir mengunci layar tidak mengeluarkan pemilik (state.session vs ownerSession)", async () => {
  await ownerLogin();
  expect((await login("123456")).status).toBe(200);
  const { queryClient } = renderApp("/owner");
  expect(await page("Beranda")).toBeInTheDocument();

  // Kasir keluar/kunci: hanya sesi kasir yang hilang.
  expect((await post("/api/auth/logout", {})).status).toBe(204);
  expect(mockDb.get().session).toBeNull();
  // 401 dari endpoint kasir di QueryClient yang sama tidak menyentuh gerbang pemilik.
  await act(() =>
    queryClient
      .fetchQuery({
        queryKey: getGetSessionQueryKey(),
        queryFn: () => getSession(),
      })
      .catch(() => undefined),
  );
  await act(() =>
    queryClient.invalidateQueries({ queryKey: getGetOwnerSessionQueryKey() }),
  );
  expect(screen.getByRole("heading", { name: "Beranda" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Masuk pemilik" })).toBeNull();
  expect(mockDb.get().ownerSession).not.toBeNull();
});

test("pemilik Keluar tidak mengeluarkan kasir", async () => {
  await ownerLogin();
  expect((await login("123456")).status).toBe(200);
  renderApp("/owner/lainnya");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Keluar" }));
  expect(await loginHeading()).toBeInTheDocument();
  expect(mockDb.get().session).not.toBeNull();
  expect((await fetch("/api/auth/session")).status).toBe(200);
});

test("Keluar → layar login", async () => {
  await ownerLogin();
  renderApp("/owner");
  const user = userEvent.setup();
  await page("Beranda");
  await user.click(screen.getByRole("link", { name: "Lainnya" }));
  await user.click(await screen.findByRole("button", { name: "Keluar" }));
  expect(await loginHeading()).toBeInTheDocument();
  expect(mockDb.get().ownerSession).toBeNull();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});

test("Keluar gagal → pesan galat, tetap masuk", async () => {
  await ownerLogin();
  renderApp("/owner/lainnya");
  const user = userEvent.setup();
  const keluar = await screen.findByRole("button", { name: "Keluar" });
  setScenario("server-mati");
  await user.click(keluar);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Server tidak tersambung — coba lagi",
  );
  expect(screen.getByRole("heading", { name: "Lainnya" })).toBeInTheDocument();
});

test("401 UNAUTHORIZED dari query /api/owner/* → kembali ke login", async () => {
  await ownerLogin();
  const { queryClient } = renderApp("/owner");
  await page("Beranda");
  // Sesi pemilik habis di server; query pemilik berikutnya mendapat 401.
  mockDb.update((s) => {
    s.ownerSession = null;
  });
  await act(() =>
    queryClient
      .fetchQuery({
        queryKey: getGetOwnerTodaySummaryQueryKey(),
        queryFn: () => getOwnerTodaySummary(),
      })
      .catch(() => undefined),
  );
  expect(await loginHeading()).toBeInTheDocument();
});

test("401 UNAUTHORIZED dari mutasi pemilik → kembali ke login", async () => {
  await ownerLogin();
  server.use(
    http.post("/api/owner/logout", () =>
      problem(401, "UNAUTHORIZED", "Sesi pemilik tidak ditemukan"),
    ),
  );
  renderApp("/owner/lainnya");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Keluar" }));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Masuk pemilik" }),
    ).toBeInTheDocument(),
  );
});

/** Mutasi biasa (operationId tidak berawalan "owner") yang memanggil `path`. */
function renderTrigger(client: QueryClient, path: string, key: string) {
  function Trigger() {
    const mutation = useMutation({
      mutationKey: [key],
      mutationFn: () => customFetch<void>(path, { method: "POST" }),
    });
    return (
      <button type="button" onClick={() => mutation.mutate()}>
        {`Picu ${key}`}
      </button>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Trigger />
    </QueryClientProvider>,
  );
  return screen.getByRole("button", { name: `Picu ${key}` });
}

const unauthorized = () =>
  problem(401, "UNAUTHORIZED", "Sesi pemilik tidak ditemukan");

test("401 dari mutasi /api/owner/* tanpa awalan 'owner' pada operationId → login", async () => {
  await ownerLogin();
  server.use(http.post("/api/owner/products/p1/price", unauthorized));
  const { queryClient } = renderApp("/owner");
  await page("Beranda");
  const user = userEvent.setup();
  await user.click(
    renderTrigger(
      queryClient,
      "/api/owner/products/p1/price",
      "updateProductPrice",
    ),
  );
  expect(await loginHeading()).toBeInTheDocument();
});

test("401 dari mutasi kasir diabaikan walau kuncinya berawalan 'owner'", async () => {
  await ownerLogin();
  const hit = vi.fn();
  server.use(
    http.post("/api/sales", () => {
      hit();
      return unauthorized();
    }),
  );
  const { queryClient } = renderApp("/owner");
  await page("Beranda");
  const user = userEvent.setup();
  await user.click(renderTrigger(queryClient, "/api/sales", "ownerTrap"));
  await waitFor(() => expect(hit).toHaveBeenCalled());
  await waitFor(() =>
    expect(queryClient.getMutationCache().getAll()[0]?.state.status).toBe(
      "error",
    ),
  );
  expect(screen.getByRole("heading", { name: "Beranda" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Masuk pemilik" })).toBeNull();
});

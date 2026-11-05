// Bahan test hook draf (useDrafts/useDraftSync); bukan kode app.
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { problem } from "@/mocks/handlers/respond";
import { server } from "@/mocks/node";
import type { Session } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { getGetStaffSessionQueryKey } from "@/shared/api/gen/staff/staff";
import { createTestQueryClient } from "@/test/render-app";
import {
  memoryOpnameStore,
  type OpnameDraftStore,
} from "../opname/opname-draft-store";
import {
  OpnameStoreContext,
  useOpnameDrafts,
} from "../opname/use-opname-drafts";
import type { DraftStore } from "./draft-store";
import { DraftStoreContext, useDraftSync, useDrafts } from "./use-drafts";

/** Server POST palsu: `online` false → gagal jaringan; tiap POST (id) dicatat. */
function postServer(path: string) {
  const state = { online: true, posts: [] as string[] };
  server.use(
    http.post(path, async ({ request }) => {
      const { id } = (await request.json()) as { id: string };
      state.posts.push(id);
      if (!state.online) return HttpResponse.error();
      return HttpResponse.json({ id }, { status: 201 });
    }),
  );
  return state;
}

/** Server nota palsu. */
export const receiptServer = () => postServer("/api/staff/receipts");

/** Server opname palsu (kirim hitungan). */
export const opnameServer = () => postServer("/api/staff/opname-sessions");

const sessionOf = (userId: string | null): Session | null =>
  userId === null
    ? null
    : { user: { id: userId, name: userId, role: "kasir" } };

/** Sesi di server (cookie, dipakai bersama semua tab); bisa beda dengan cache tab ini. */
export function serveSession(userId: string | null) {
  const session = sessionOf(userId);
  server.use(
    http.get("/api/staff/session", () =>
      session ? HttpResponse.json(session) : problem(401, "UNAUTHORIZED"),
    ),
  );
}

/** Masuk di tab ini: sesi di cache dan di server sama. */
export function signIn(client: QueryClient, userId: string | null) {
  client.setQueryData(getGetStaffSessionQueryKey(), sessionOf(userId));
  serveSession(userId);
}

/** Dua penyimpan di memori (jsdom tanpa IndexedDB): draf nota dan draf opname. */
export function wrapperFor(
  store: DraftStore,
  userId: string | null = "u-rina",
  opnameStore: OpnameDraftStore = memoryOpnameStore(),
) {
  const client = createTestQueryClient();
  signIn(client, userId);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <DraftStoreContext.Provider value={store}>
        <OpnameStoreContext.Provider value={opnameStore}>
          {children}
        </OpnameStoreContext.Provider>
      </DraftStoreContext.Provider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

export function renderSync(
  store: DraftStore,
  userId: string | null = "u-rina",
  opnameStore: OpnameDraftStore = memoryOpnameStore(),
) {
  const { client, wrapper } = wrapperFor(store, userId, opnameStore);
  const hook = renderHook(
    ({ id }: { id: string | null }) => ({
      sync: useDraftSync(id),
      list: useDrafts(id ?? ""),
      opname: useOpnameDrafts(id ?? ""),
    }),
    { wrapper, initialProps: { id: userId } },
  );
  return { client, hook };
}

/** Penyimpan yang selalu gagal (mis. IndexedDB diblokir/penuh); nota maupun opname. */
export function brokenStore(): DraftStore & OpnameDraftStore {
  const fail = () => Promise.reject(new Error("QuotaExceededError"));
  return { list: fail, get: fail, put: fail, remove: fail, update: fail };
}

/**
 * Hanya setInterval yang dipalsukan (sync berkala, cek kesehatan). Tetap maju seirama jam
 * asli karena waitFor Testing Library juga memakai setInterval untuk memeriksa ulang.
 */
export const fakeIntervals = () =>
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval"],
    shouldAdvanceTime: true,
  });

export const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

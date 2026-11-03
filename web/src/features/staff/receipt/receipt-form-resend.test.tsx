import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { server } from "@/mocks/node";
import { ID_TAKEN_MESSAGE } from "@/shared/lib/error-messages";
import { memoryDraftStore } from "../drafts/draft-store";
import {
  capturePosts,
  DRAFT_ID,
  loginRina,
  makeDraft,
  mockupLines,
  NOW,
  renderForm,
} from "./form-test-kit";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  toast.dismiss();
  server.events.removeAllListeners();
  vi.useRealTimers();
});

const takenDraft = (message: string) => ({
  ...makeDraft({ lines: mockupLines(), supplierName: "CV Sumber Rejeki" }),
  status: "rejected" as const,
  errors: [{ lineId: null, field: "lines" as const, message }],
  photo: {
    id: "foto-lama",
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], {
      type: "image/jpeg",
    }),
    takenAt: NOW,
    bytes: 5,
    uploaded: false,
  },
});

test("ditolak ID_TAKEN → 'Kirim sebagai nota baru': ID nota dan foto baru, draf lama hilang, nota terkirim", async () => {
  await loginRina(true);
  const store = memoryDraftStore();
  await store.put(takenDraft(ID_TAKEN_MESSAGE));
  const bodies = capturePosts();
  const { router } = renderForm(store);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Kirim sebagai nota baru" }),
  );
  expect(await screen.findByText("Barang masuk tersimpan")).toBeVisible();
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk"),
  );
  expect(await store.get(DRAFT_ID)).toBeUndefined();
  expect(await store.list()).toEqual([]);
  const sent = bodies[0] as { id: string; photoId: string };
  expect(sent.id).not.toBe(DRAFT_ID);
  expect(sent.photoId).not.toBe("foto-lama");
  expect(mockDb.get().receipts.some((r) => r.id === sent.id)).toBe(true);
});

test("galat lain tidak menawarkan 'Kirim sebagai nota baru'", async () => {
  await loginRina(true);
  const store = memoryDraftStore();
  await store.put(takenDraft("Barang ini tidak dijual lagi"));
  renderForm(store);
  await screen.findByLabelText("Supplier");
  expect(
    screen.queryByRole("button", { name: "Kirim sebagai nota baru" }),
  ).toBeNull();
});

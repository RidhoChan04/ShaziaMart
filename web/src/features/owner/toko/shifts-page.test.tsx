import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { get, json, ownerLogin, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type {
  OwnerCashTakeInput,
  OwnerShiftList,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";
import { at, closeShift, seedDay, take } from "./shifts-test-setup";

const TAKES = "/api/owner/cash-takes";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(7);
});

afterEach(() => {
  toast.dismiss();
  server.events.removeAllListeners();
  vi.useRealTimers();
});

const open = async (path = "/owner/lainnya/shift") => {
  const user = userEvent.setup();
  const utils = renderApp(path);
  await screen.findByRole("heading", { level: 1, name: "Shift & kas" });
  return { user, ...utils };
};
const rows = () => within(screen.getByRole("main")).getAllByRole("listitem");
const rowOf = (text: string) => {
  const row = rows().find((li) => li.textContent?.includes(text));
  if (!row) throw new Error(`baris tidak ada: ${text}`);
  return row;
};

test("hari ini: navigator (› nonaktif), shift buka bertanda, shift tutup dengan uang fisik dan selisih, ambil uang sela di antaranya", async () => {
  await seedDay();
  await open();
  expect(await screen.findByText("Budi · sejak 15.00")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Hari berikutnya" }),
  ).toBeDisabled();
  expect(screen.getByRole("link", { name: "Hari sebelumnya" })).toHaveAttribute(
    "href",
    "/owner/lainnya/shift?tanggal=2026-11-18",
  );
  const items = rows();
  expect(items).toHaveLength(3);
  // terbaru dulu: Budi (15.00), pengambilan sela (14.59), Rina (07.00)
  expect(items[0]).toHaveTextContent("Budi · sejak 15.00");
  expect(items[0]).toHaveTextContent("Sedang buka");
  expect(items[1]).toHaveTextContent("Diambil pemilik");
  expect(items[1]).toHaveTextContent("14.59 · Setoran harian");
  expect(items[1]).toHaveTextContent("−Rp50.000");
  expect(items[2]).toHaveTextContent("Rina · 07.00–14.58");
  expect(items[2]).toHaveTextContent("Rp400.000");
  const list = (await json(await get("/api/owner/shifts"))) as OwnerShiftList;
  const rina = list.items.find((s) => s.kasirName === "Rina");
  expect(rina?.difference).not.toBeNull();
  expect(items[2]).toHaveTextContent(
    rina?.difference === 0 ? "Cocok" : /Selisih [+−]Rp/,
  );
});

test("panah hari sebelumnya berpindah ke Rabu 18 Nov dan › aktif", async () => {
  await seedDay();
  const { user } = await open();
  await user.click(screen.getByRole("link", { name: "Hari sebelumnya" }));
  expect(
    (await screen.findAllByText("Rabu, 18 Nov 2026")).length,
  ).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "Hari berikutnya" })).toBeEnabled();
});

test("hari tanpa shift: Tidak ada shift di tanggal ini", async () => {
  await ownerLogin();
  await open("/owner/lainnya/shift?tanggal=2020-01-01");
  expect(
    await screen.findByText("Tidak ada shift di tanggal ini"),
  ).toBeInTheDocument();
});

test("Ambil uang dari laci: shift buka → keterangan menyebut kasir; tanpa shift buka → modal shift berikutnya", async () => {
  await seedDay();
  const { user, unmount } = await open();
  await screen.findByText("Budi · sejak 15.00");
  await user.click(
    screen.getByRole("button", { name: "Ambil uang dari laci" }),
  );
  const sheet = await screen.findByRole("dialog", {
    name: "Ambil uang dari laci",
  });
  expect(
    within(sheet).getAllByText("Mengurangi uang seharusnya shift Budi.")[0],
  ).toBeVisible();
  unmount();
  at(21);
  await closeShift(900_000);
  const again = await open();
  await again.user.click(
    await screen.findByRole("button", { name: "Ambil uang dari laci" }),
  );
  const sheet2 = await screen.findByRole("dialog", {
    name: "Ambil uang dari laci",
  });
  expect(
    within(sheet2).getAllByText("Mengurangi modal shift berikutnya.")[0],
  ).toBeVisible();
});

async function openSheet() {
  const ctx = await open();
  const trigger = await screen.findByRole("button", {
    name: "Ambil uang dari laci",
  });
  await waitFor(() => expect(trigger).toBeEnabled());
  await ctx.user.click(trigger);
  const sheet = await screen.findByRole("dialog", {
    name: "Ambil uang dari laci",
  });
  return { ...ctx, trigger, sheet };
}

test("simpan: Nominal + Catatan terkirim, toast tercatat, lembar menutup, fokus kembali ke tombol, daftar dimuat ulang", async () => {
  await seedDay();
  at(21);
  await closeShift(900_000);
  const bodies: OwnerCashTakeInput[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith(TAKES))
      bodies.push((await request.clone().json()) as OwnerCashTakeInput);
  });
  const { user, trigger, sheet } = await openSheet();
  await user.type(
    within(sheet).getByRole("textbox", { name: "Nominal" }),
    "250000",
  );
  await user.type(
    within(sheet).getByRole("textbox", { name: "Catatan" }),
    " Setoran ",
  );
  await user.click(within(sheet).getByRole("button", { name: "Simpan" }));
  expect(
    await screen.findByText("Pengambilan uang tercatat"),
  ).toBeInTheDocument();
  expect(bodies[0]).toMatchObject({ amount: 250_000, note: "Setoran" });
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Ambil uang dari laci" }),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(await screen.findByText("21.00 · Setoran")).toBeInTheDocument();
});

test("klik ganda Simpan → satu POST, satu pengambilan", async () => {
  await seedDay();
  const ids: string[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith(TAKES))
      ids.push(((await request.clone().json()) as OwnerCashTakeInput).id);
  });
  const { user, sheet } = await openSheet();
  await user.type(
    within(sheet).getByRole("textbox", { name: "Nominal" }),
    "30000",
  );
  const before = mockDb.get().cashTakes.length;
  await user.dblClick(within(sheet).getByRole("button", { name: "Simpan" }));
  expect(
    await screen.findByText("Pengambilan uang tercatat"),
  ).toBeInTheDocument();
  expect(ids).toHaveLength(1);
  expect(mockDb.get().cashTakes).toHaveLength(before + 1);
});

test("respons hilang lalu Simpan lagi → id sama, tercatat sekali, pemberitahuan sudah tercatat; nominal berubah → id baru", async () => {
  await seedDay();
  const ids: string[] = [];
  let lose = true;
  let inner = false;
  server.use(
    http.post(TAKES, async ({ request }) => {
      const body = (await request.clone().json()) as OwnerCashTakeInput;
      if (inner) return;
      ids.push(body.id);
      if (!lose) return;
      lose = false;
      inner = true;
      await post(TAKES, body);
      inner = false;
      return HttpResponse.error();
    }),
  );
  const { user, sheet } = await openSheet();
  const box = within(sheet).getByRole("textbox", { name: "Nominal" });
  await user.type(box, "40000");
  const before = mockDb.get().cashTakes.length;
  await user.click(within(sheet).getByRole("button", { name: "Simpan" }));
  expect(await within(sheet).findByRole("alert")).toBeInTheDocument();
  at(20, 17);
  await user.click(within(sheet).getByRole("button", { name: "Simpan" }));
  expect(
    await screen.findByText("Pengambilan uang ini sudah tercatat sebelumnya"),
  ).toBeInTheDocument();
  expect(ids).toHaveLength(2);
  expect(ids[1]).toBe(ids[0]);
  expect(mockDb.get().cashTakes).toHaveLength(before + 1);
});

test("nominal atau catatan berubah selama id tertunda → id baru", async () => {
  await seedDay();
  const ids: string[] = [];
  server.use(
    http.post(TAKES, async ({ request }) => {
      ids.push(((await request.clone().json()) as OwnerCashTakeInput).id);
      return HttpResponse.error();
    }),
  );
  const { user, sheet } = await openSheet();
  const ui = within(sheet);
  const save = () => user.click(ui.getByRole("button", { name: "Simpan" }));
  const box = ui.getByRole("textbox", { name: "Nominal" });
  await user.type(box, "40000");
  await save();
  await ui.findByRole("alert");
  await save();
  await waitFor(() => expect(ids).toHaveLength(2));
  expect(ids[1]).toBe(ids[0]);
  await user.type(ui.getByRole("textbox", { name: "Catatan" }), "x");
  await save();
  await waitFor(() => expect(ids).toHaveLength(3));
  expect(ids[2]).not.toBe(ids[0]);
});

test("nominal kosong atau 0 → Simpan nonaktif", async () => {
  await seedDay();
  const { user, sheet } = await openSheet();
  const save = within(sheet).getByRole("button", { name: "Simpan" });
  expect(save).toBeDisabled();
  await user.type(within(sheet).getByRole("textbox", { name: "Nominal" }), "0");
  expect(save).toBeDisabled();
});

/** Pengambilan sela yang masih bisa dibatalkan: shift Budi ditutup lalu pemilik ambil uang. */
async function plantOpenTake() {
  await seedDay();
  at(21);
  await closeShift(900_000);
  at(21, 5);
  await take("tk-bebas", 75_000, "Setoran malam");
}

test("batal pengambilan sela: lembar Pengambilan {Rp}, alasan wajib, efek modal shift berikutnya, toast, baris dicoret", async () => {
  await plantOpenTake();
  const { user } = await open();
  await user.click(
    await screen.findByRole("button", {
      name: /Diambil pemilik.*Setoran malam/,
    }),
  );
  const sheet = await screen.findByRole("dialog", {
    name: "Pengambilan Rp75.000",
  });
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan pengambilan" }),
  );
  const dialog = await screen.findByRole("alertdialog", {
    name: "Batalkan pengambilan Rp75.000?",
  });
  expect(
    within(dialog).getByText(
      "Modal shift berikutnya kembali bertambah Rp75.000.",
    ),
  ).toBeInTheDocument();
  const confirm = within(dialog).getByRole("button", {
    name: "Batalkan pengambilan",
  });
  expect(confirm).toBeDisabled();
  await user.type(
    within(dialog).getByRole("textbox", { name: "Alasan" }),
    "Salah nominal",
  );
  await user.click(confirm);
  expect(await screen.findByText("Pengambilan dibatalkan")).toBeInTheDocument();
  const cancelled = mockDb.get().cashTakes.find((t) => t.id === "tk-bebas");
  expect(cancelled?.cancelReason).toBe("Salah nominal");
  await waitFor(() =>
    expect(rowOf("Setoran malam")).toHaveTextContent(
      "Dibatalkan · Salah nominal · Pak Ahmad · 21.05",
    ),
  );
  expect(
    screen.queryByRole("button", { name: /Setoran malam/ }),
  ).not.toBeInTheDocument();
});

test("pengambilan sela yang sudah terpakai modal shift: tanpa tombol, keterangan Sudah dipakai modal shift {kasir}", async () => {
  await seedDay();
  const { user } = await open();
  await user.click(
    await screen.findByRole("button", { name: /Setoran harian/ }),
  );
  const sheet = await screen.findByRole("dialog", {
    name: "Pengambilan Rp50.000",
  });
  expect(
    within(sheet).getByText("Sudah dipakai modal shift Budi"),
  ).toBeInTheDocument();
  expect(
    within(sheet).queryByRole("button", { name: "Batalkan pengambilan" }),
  ).not.toBeInTheDocument();
});

test("409 CASH_TAKE_LOCKED saat batal: dialog menutup, tanpa toast dibatalkan, lembar berganti ke keterangan terkunci", async () => {
  await plantOpenTake();
  const { user } = await open();
  await user.click(
    await screen.findByRole("button", { name: /Setoran malam/ }),
  );
  const sheet = await screen.findByRole("dialog", {
    name: "Pengambilan Rp75.000",
  });
  // Shift berikutnya dibuka (memakai pengambilan itu) sebelum pemilik menekan konfirmasi.
  server.use(
    http.post(`${TAKES}/:id/cancel`, () => {
      mockDb.update((s) => {
        const t = s.cashTakes.find((x) => x.id === "tk-bebas");
        if (t) t.consumedByShiftId = "shift-baru";
      });
      return HttpResponse.json(
        {
          code: "CASH_TAKE_LOCKED",
          type: "about:blank",
          title: "x",
          status: 409,
          detail: "Sudah dipakai modal shift berikutnya",
        },
        {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        },
      );
    }),
  );
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan pengambilan" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await user.type(
    within(dialog).getByRole("textbox", { name: "Alasan" }),
    "Salah",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan pengambilan" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(screen.queryByText("Pengambilan dibatalkan")).not.toBeInTheDocument();
  expect(
    mockDb.get().cashTakes.find((t) => t.id === "tk-bebas")?.cancelledAt,
  ).toBeNull();
  expect(
    await within(sheet).findByText(
      /Sudah dipakai modal shift|Shift sudah tutup/,
    ),
  ).toBeInTheDocument();
  expect(
    within(sheet).queryByRole("button", { name: "Batalkan pengambilan" }),
  ).not.toBeInTheDocument();
});

test("galat memuat daftar: pesan dan Coba lagi", async () => {
  await seedDay();
  server.use(http.get("/api/owner/shifts", () => HttpResponse.error()));
  renderApp("/owner/lainnya/shift");
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
});

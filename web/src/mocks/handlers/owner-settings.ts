import { HttpResponse, http } from "msw";
import type {
  AttentionRules,
  CreditSettings,
  KasirScreenSettings,
  OwnerSettings,
  ReportSettings,
  StockSettings,
  StoreSettingsInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { type MockState, mockDb } from "../db";
import { mockPhotos } from "../photos";
import { thinMarginPreview } from "../reports/thin-margin";
import { withScenario } from "../scenarios";
import { invalid, readJson, requireOwnerSession } from "./respond";
import { imageTypeOf, qrisImageIdOf, qrisImageUrl } from "./settings";

const BASE = "/api/owner/settings";
const MONEY_MAX = 10_000_000;
const CREDIT_LIMIT_MAX = 100_000_000;
const QRIS_IMAGE_MAX_BYTES = 1024 * 1024;

/** Pengaturan lengkap dari satu sumber per nilai (K19). */
function ownerSettingsOf(state: Readonly<MockState>): OwnerSettings {
  const { settings } = state;
  return {
    store: {
      name: state.store.name,
      address: state.storeProfile.address,
      receiptFooter: state.storeProfile.receiptFooter,
      qrisImageUrl: settings.qrisImageUrl,
    },
    kasir: {
      autoPrint: settings.autoPrint,
      allowNegativeStock: settings.allowNegativeStock,
      curahFractions: settings.curahFractions,
      quickCurahProductIds: settings.quickCurahProductIds,
    },
    credit: { defaultCreditLimit: state.defaultCreditLimit },
    stock: state.stockRules,
    report: state.reportRules,
    attention: state.attentionRules,
    ownerPhone: settings.ownerPhone,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;

/** Panjang dalam karakter (code point), bukan unit UTF-16. */
const chars = (s: string): number => [...s].length;

/** Hasil baca satu bagian: nilai yang sudah dirapikan, atau galat berbahasa Indonesia. */
type Read<T> = { value: T } | { error: string };

function readStore(v: unknown): Read<StoreSettingsInput> {
  if (
    !isRecord(v) ||
    typeof v.name !== "string" ||
    typeof v.address !== "string" ||
    typeof v.receiptFooter !== "string"
  ) {
    return { error: "Nama toko, alamat, dan catatan kaki struk wajib dikirim" };
  }
  const value = {
    name: v.name.trim(),
    address: v.address.trim(),
    receiptFooter: v.receiptFooter.trim(),
  };
  if (chars(value.name) < 1 || chars(value.name) > 40) {
    return { error: "Nama toko 1–40 karakter" };
  }
  if (chars(value.address) > 120) {
    return { error: "Alamat paling banyak 120 karakter" };
  }
  if (chars(value.receiptFooter) > 120) {
    return { error: "Catatan kaki struk paling banyak 120 karakter" };
  }
  return { value };
}

/** Pecahan curah 1..8 angka bulat 1..100.000, naik ketat (sekaligus unik). */
const isCurahFractions = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.length >= 1 &&
  v.length <= 8 &&
  v.every(
    (f: unknown, i) =>
      isInt(f, 1, 100_000) && (i === 0 || f > (v[i - 1] as number)),
  );

function readKasir(
  v: unknown,
  state: Readonly<MockState>,
): Read<KasirScreenSettings> {
  if (
    !isRecord(v) ||
    typeof v.autoPrint !== "boolean" ||
    typeof v.allowNegativeStock !== "boolean"
  ) {
    return { error: "Pengaturan kasir wajib dikirim lengkap" };
  }
  const { curahFractions, quickCurahProductIds: ids } = v;
  if (!isCurahFractions(curahFractions)) {
    return {
      error:
        "Pecahan curah 1–8 angka berbeda, urut naik, masing-masing 1–100.000",
    };
  }
  const activeCurah = new Set(
    state.products
      .filter((p) => p.isCurah && p.status === "aktif")
      .map((p) => p.id),
  );
  if (
    !Array.isArray(ids) ||
    ids.length > 12 ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => typeof id === "string" && activeCurah.has(id))
  ) {
    return {
      error: "Curah cepat paling banyak 12 barang curah aktif yang berbeda",
    };
  }
  return {
    value: {
      autoPrint: v.autoPrint,
      allowNegativeStock: v.allowNegativeStock,
      curahFractions,
      quickCurahProductIds: ids as string[],
    },
  };
}

function readCredit(v: unknown): Read<CreditSettings> {
  if (!isRecord(v) || !isInt(v.defaultCreditLimit, 0, CREDIT_LIMIT_MAX)) {
    return { error: "Limit kasbon pelanggan baru Rp0–Rp100.000.000" };
  }
  return { value: { defaultCreditLimit: v.defaultCreditLimit } };
}

function readStock(v: unknown): Read<StockSettings> {
  if (!isRecord(v) || !isInt(v.expirySoonDays, 1, 90)) {
    return { error: "Segera kedaluwarsa 1–90 hari" };
  }
  const { opnameItemLimit: item, opnameSessionLimit: session } = v;
  if (!isInt(item, 0, MONEY_MAX) || !isInt(session, 0, MONEY_MAX)) {
    return { error: "Batas selisih opname Rp0–Rp10.000.000" };
  }
  if (item > session) {
    return {
      error: "Batas selisih per barang tidak boleh melebihi batas per sesi",
    };
  }
  return {
    value: {
      expirySoonDays: v.expirySoonDays,
      opnameItemLimit: item,
      opnameSessionLimit: session,
    },
  };
}

function readReport(v: unknown): Read<ReportSettings> {
  if (!isRecord(v) || !isInt(v.thinMarginPermille, 0, 1000)) {
    return { error: "Batas untung tipis 0–100%" };
  }
  if (!isInt(v.unsoldDays, 7, 365)) {
    return { error: "Tidak terjual setelah 7–365 hari" };
  }
  return {
    value: {
      thinMarginPermille: v.thinMarginPermille,
      unsoldDays: v.unsoldDays,
    },
  };
}

function readAttention(v: unknown): Read<AttentionRules> {
  if (!isRecord(v)) return { error: "Ambang Perlu perhatian wajib dikirim" };
  const {
    cashDiffMin,
    smallShortageWeekMax,
    expenseSingleMax,
    expenseShiftMax,
    shiftMaxHours,
    qrisDailyReconcile,
  } = v;
  if (
    !isInt(cashDiffMin, 0, MONEY_MAX) ||
    !isInt(smallShortageWeekMax, 0, MONEY_MAX) ||
    !isInt(expenseSingleMax, 0, MONEY_MAX) ||
    !isInt(expenseShiftMax, 0, MONEY_MAX)
  ) {
    return { error: "Batas uang Perlu perhatian Rp0–Rp10.000.000" };
  }
  if (!isInt(shiftMaxHours, 1, 24)) {
    return { error: "Shift dianggap kelamaan setelah 1–24 jam" };
  }
  if (typeof qrisDailyReconcile !== "boolean") {
    return { error: "Pencocokan QRIS harian wajib dikirim" };
  }
  return {
    value: {
      cashDiffMin,
      smallShortageWeekMax,
      expenseSingleMax,
      expenseShiftMax,
      shiftMaxHours,
      qrisDailyReconcile,
    },
  };
}

const OWNER_PHONE = /^[0-9+ -]+$/;

function readOwnerPhone(v: unknown): Read<string | null> {
  if (v === null) return { value: null };
  const phone = typeof v === "string" ? v.trim() : "";
  if (chars(phone) < 8 || chars(phone) > 16 || !OWNER_PHONE.test(phone)) {
    return {
      error: "Nomor telepon 8–16 karakter (angka, spasi, +, atau -)",
    };
  }
  return { value: phone };
}

type SettingsPatch = {
  store?: StoreSettingsInput;
  kasir?: KasirScreenSettings;
  credit?: CreditSettings;
  stock?: StockSettings;
  report?: ReportSettings;
  attention?: AttentionRules;
  ownerPhone?: string | null;
};

/** Bagian yang dikirim harus utuh; satu galat menolak seluruh PATCH (K13). */
function readPatch(
  body: Record<string, unknown>,
  state: Readonly<MockState>,
): Read<SettingsPatch> {
  const readers: {
    [K in keyof SettingsPatch]-?: (v: unknown) => Read<SettingsPatch[K]>;
  } = {
    store: readStore,
    kasir: (v) => readKasir(v, state),
    credit: readCredit,
    stock: readStock,
    report: readReport,
    attention: readAttention,
    ownerPhone: readOwnerPhone,
  };
  const patch: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(readers)) {
    if (!Object.hasOwn(body, key)) continue;
    const result = read(body[key]);
    if ("error" in result) return result;
    patch[key] = result.value;
  }
  return { value: patch as SettingsPatch };
}

function applyPatch(s: MockState, patch: SettingsPatch): void {
  const { store, kasir, credit, stock, report, attention, ownerPhone } = patch;
  if (store) {
    // (K19) Satu nama toko: identitas toko dan KasirSettings.storeName.
    s.store.name = store.name;
    s.settings.storeName = store.name;
    s.storeProfile = {
      address: store.address,
      receiptFooter: store.receiptFooter,
    };
  }
  if (kasir) s.settings = { ...s.settings, ...kasir };
  if (credit) s.defaultCreditLimit = credit.defaultCreditLimit;
  if (stock) s.stockRules = stock;
  if (report) s.reportRules = report;
  if (attention) s.attentionRules = attention;
  if (ownerPhone !== undefined) s.settings.ownerPhone = ownerPhone;
}

/** Content-Type tanpa parameter, huruf kecil. */
const mediaType = (request: Request): string =>
  (request.headers.get("Content-Type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase() ?? "";

export const ownerSettingsHandlers = [
  http.get(
    BASE,
    withScenario(() => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      return HttpResponse.json(ownerSettingsOf(state));
    }),
  ),
  http.patch(
    BASE,
    withScenario(async ({ request }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      if (body === null) return invalid("Isi pengaturan tidak valid");
      const patch = readPatch(body, state);
      if ("error" in patch) return invalid(patch.error);
      mockDb.update((s) => applyPatch(s, patch.value));
      return HttpResponse.json(ownerSettingsOf(mockDb.get()));
    }),
  ),
  http.get(
    `${BASE}/thin-margin-preview`,
    withScenario(({ request }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const raw = new URL(request.url).searchParams.get("permille") ?? "";
      const permille = /^\d{1,4}$/.test(raw) ? Number(raw) : Number.NaN;
      if (!isInt(permille, 0, 1000)) {
        return invalid("Batas untung tipis 0–1000 permil");
      }
      return HttpResponse.json(thinMarginPreview(state, permille));
    }),
  ),
  http.put(
    `${BASE}/qris-image`,
    withScenario(async ({ request }) => {
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > QRIS_IMAGE_MAX_BYTES) {
        return invalid("Gambar QRIS terlalu besar (maks. 1 MB)");
      }
      // Isi berkas harus sesuai Content-Type yang dikirim.
      const type = imageTypeOf(bytes);
      if (type === null || type !== mediaType(request)) {
        return invalid("Gambar QRIS harus PNG atau JPEG");
      }
      const id = `qris-${newId()}`;
      mockPhotos.save(id, owner.id, bytes);
      // Penyimpanan perangkat penuh: gambar lama tetap dipakai.
      if (!mockPhotos.load(id)) {
        return invalid("Gambar QRIS gagal disimpan di perangkat ini");
      }
      const oldId = qrisImageIdOf(mockDb.get().settings.qrisImageUrl);
      mockDb.update((s) => {
        s.settings.qrisImageUrl = qrisImageUrl(id);
      });
      if (oldId !== null) mockPhotos.remove(oldId);
      return HttpResponse.json(ownerSettingsOf(mockDb.get()));
    }),
  ),
];

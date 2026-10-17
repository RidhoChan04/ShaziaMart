# Rencana F1 — Fondasi Frontend: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi web di `web/` yang jalan dengan backend palsu (MSW): kerangka `/kasir` dan `/owner` bergaya "Bersih & Hijau", indikator server, pemilih skenario, PWA untuk owner, utilitas uang/berat/nominal yang teruji, kontrak OpenAPI + client hasil generate, E2E + aksesibilitas, dan CI.

**Architecture:** Satu SPA React (Vite) dengan dua route tree yang di-code-split. UI hanya memanggil hook hasil orval dari `api/openapi.yaml`; di development/mock, MSW menjawab request `/api` dari state di memori yang bisa diubah lewat skenario. Logika murni (uang, berat, nominal) ada di `shared/lib` tanpa ketergantungan UI.

**Tech Stack:** Node 24, React 19, TypeScript strict, Vite 8, TanStack Router, TanStack Query 5, Zustand (dipakai mulai F2), Tailwind 4, shadcn/ui, `@fontsource-variable/inter`, orval 8, MSW 2, vite-plugin-pwa, Biome, Vitest + Testing Library, Playwright + `@axe-core/playwright`, GitHub Actions.

**Spec:** `docs/specs/2026-10-17-frontend-design.html` (utama) dan `docs/specs/2026-10-17-arsitektur-kasir-design.html`.

## Global Constraints

- Semua perintah dijalankan dari `web/` kecuali disebut lain; package manager `npm`.
- TypeScript: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`.
- Tidak ada aset dari internet (font, ikon, suara, CDN); semuanya dibundel.
- Warna hanya lewat token: `--primary #1f7a4d`, `--bg #f6f7f5`, `--surface #ffffff`, `--text #1c2421`, `--muted #5e6b65`, `--border #e3e7e4`, `--primary-soft #e6f2ea`, `--success-soft #f0f8f3`, `--danger #b42318`, `--warning #b26b00`.
- Font Inter (variable) dari `@fontsource-variable/inter`; angka uang/qty memakai `tabular-nums`.
- Kasir: teks dasar 15px, tombol tinggi ≥ 44px, target layar ≥ 1366×768. Owner: mobile-first 360px, ≥ 1024px pakai sidebar.
- Format uang: `Rp12.500`, `-Rp5.000`, `Rp0`. Uang selalu bilangan bulat aman (`Number.isSafeInteger`).
- Pembulatan: setengah ke atas (`round_half_up`).
- Tidak ada tombol F; pintasan hanya `Enter`, `Esc`, `↑`, `↓`, `Delete`.
- Semua teks UI Bahasa Indonesia.
- OpenAPI `3.0.3`; error `application/problem+json` dengan `code` dari enum.
- MSW hanya aktif bila `import.meta.env.DEV` atau `VITE_MOCK=1`.
- Kode hasil generate (`src/shared/api/gen`) di-commit; CI gagal bila berbeda dari hasil generate ulang.
- Commit: author identitas git lokal; **tanpa** `Co-Authored-By` atau tanda AI apa pun; gaya conventional (`feat:`, `test:`, `chore:`, `ci:`).

## Review Focus

1. **PC kasir tanpa internet** → tidak boleh ada satu pun request ke host selain server aplikasi (font/CDN/analitik). Dites di Task 10 (penjaga request).
2. **Service worker PWA vs MSW** → di mode mock, halaman `/owner` tetap mendapat data palsu; SW PWA tidak terdaftar saat `VITE_MOCK=1`. Dites di Task 9 dan Task 10.
3. **Format angka gaya Indonesia** → `"400.000"` dibaca 400000; berat `"1,5"` dan `"1.5"` sama-sama 1500 g; masukan aneh (`"1,2345"`, `"-1"`, `"abc"`) ditolak tanpa crash. Dites di Task 2 dan Task 3.
4. **Refresh di deep link** (`/owner/laporan`) pada `vite preview` → tetap SPA. Dites di Task 10.
5. **Total sangat besar** (mis. Rp25.000.000 atau Rp9.007.199.254.740.991) → format dan tombol nominal benar tanpa error float; di atas batas integer aman ditolak. Dites di Task 2 dan Task 4.

---

### Task 1: Kerangka proyek web

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/biome.json`, `web/index.html`, `web/vitest.setup.ts`
- Create: `web/src/main.tsx`, `web/src/app/app.tsx`
- Test: `web/src/app/app.test.tsx`

**Interfaces:**
- Produces: script npm `dev`, `build`, `preview`, `test` (vitest run), `lint` (biome check), `typecheck` (tsc --noEmit); komponen `App` yang merender `ShaziaMart`.

- [ ] **Step 1: Scaffold**

Run (dari root repo): `npm create vite@latest web -- --template react-ts`, lalu di `web/`: `npm i` dan `npm i -D @biomejs/biome vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`. Hapus aset contoh Vite. `vitest` di `vite.config.ts`: `environment: "jsdom"`, `setupFiles: ["./vitest.setup.ts"]`, `exclude: ["e2e/**", "node_modules/**"]`. Set opsi TypeScript sesuai Global Constraints. `index.html`: `lang="id"`, title `ShaziaMart`.

- [ ] **Step 2: Tulis test yang gagal**

```tsx
test("App merender nama toko", () => {
  render(<App />);
  expect(screen.getByText("ShaziaMart")).toBeInTheDocument();
});
```

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `npm test`
Expected: FAIL — `App` belum merender teks tersebut

- [ ] **Step 4: Implementasi `App` minimal**

- [ ] **Step 5: Verifikasi**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: semua sukses

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "chore: kerangka proyek web React + Vite"
```

---

### Task 2: `shared/lib/money.ts`

**Files:**
- Create: `web/src/shared/lib/money.ts`
- Test: `web/src/shared/lib/money.test.ts`

**Interfaces:**
- Produces:
  - `formatRupiah(n: number): string` — melempar `RangeError` bila bukan safe integer.
  - `formatAngka(n: number): string` — tanpa "Rp" (`361500` → `"361.500"`), untuk kolom tabel.
  - `parseRupiah(input: string): number | null` — menerima digit dengan/tanpa titik ribuan dan awalan `Rp`/spasi; selain itu `null`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test.each([
  [0, "Rp0"], [500, "Rp500"], [12500, "Rp12.500"], [1250000, "Rp1.250.000"],
  [-5000, "-Rp5.000"], [25000000, "Rp25.000.000"],
  [9007199254740991, "Rp9.007.199.254.740.991"],
])("formatRupiah(%i) = %s", (n, s) => expect(formatRupiah(n)).toBe(s));

test("formatRupiah menolak pecahan dan di luar batas aman", () => {
  expect(() => formatRupiah(12.5)).toThrow(RangeError);
  expect(() => formatRupiah(9007199254740992)).toThrow(RangeError);
});

test("formatAngka", () => expect(formatAngka(361500)).toBe("361.500"));

test.each([
  ["400.000", 400000], ["400000", 400000], ["Rp400.000", 400000], [" Rp 20.000 ", 20000], ["0", 0],
  ["", null], ["abc", null], ["-5.000", null], ["12,5", null], ["4.00.000", null],
])("parseRupiah(%j) = %j", (s, n) => expect(parseRupiah(s)).toBe(n));
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/shared/lib/money.test.ts`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Implementasi**

Pemisah ribuan dibuat sendiri (bukan `Intl` dengan `style: "currency"`, karena menghasilkan spasi `Rp 12.500`). `parseRupiah` memvalidasi pola titik ribuan yang benar (`^\d{1,3}(\.\d{3})*$` atau `^\d+$`).

- [ ] **Step 4: Jalankan test**

Run: `npx vitest run src/shared/lib/money.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/lib
git commit -m "feat: format dan parse rupiah"
```

---

### Task 3: `shared/lib/quantity.ts`

**Files:**
- Create: `web/src/shared/lib/quantity.ts`
- Test: `web/src/shared/lib/quantity.test.ts`

**Interfaces:**
- Produces:
  - `roundHalfUp(numerator: number, denominator: number): number` — pembagian bulat setengah ke atas untuk bilangan non-negatif.
  - `parseKg(input: string): number | null` — kg → gram; desimal `,` atau `.`, maks 3 desimal, > 0.
  - `formatGram(gram: number, unit?: "kg" | "L"): string` — `1500` → `"1,5 kg"`, `250` → `"0,25 kg"`, `1000` → `"1 kg"`.
  - `formatApproxKg(gram: number, unit?: "kg" | "L"): string` — `1111` → `"≈ 1,111 kg"`.
  - `lineSubtotal(price: number, qtyBase: number, unitSize: number): number` — `roundHalfUp(price × qtyBase, unitSize)`.
  - `qtyBaseFromAmount(amount: number, price: number, unitSize: number): number` — `roundHalfUp(amount × unitSize, price)`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test.each([
  ["1,5", 1500], ["1.5", 1500], ["0,25", 250], ["2", 2000], ["0,001", 1],
  ["", null], ["0", null], ["-1", null], ["1,2345", null], ["abc", null], ["1,5,0", null],
])("parseKg(%j) = %j", (s, g) => expect(parseKg(s)).toBe(g));

test.each([[1500, "1,5 kg"], [250, "0,25 kg"], [1000, "1 kg"], [1, "0,001 kg"]])(
  "formatGram(%i) = %s", (g, s) => expect(formatGram(g)).toBe(s));
test("formatGram liter", () => expect(formatGram(1500, "L")).toBe("1,5 L"));
test("formatApproxKg", () => expect(formatApproxKg(1111)).toBe("≈ 1,111 kg"));

test.each([
  [18000, 1500, 1000, 27000],  // gula 1,5 kg
  [18000, 333, 1000, 5994],
  [14500, 333, 1000, 4829],    // 4828,5 → naik
  [36000, 2, 1, 72000],        // satuan pcs
])("lineSubtotal(%i, %i, %i) = %i", (p, q, u, s) => expect(lineSubtotal(p, q, u)).toBe(s));

test.each([
  [20000, 18000, 1000, 1111],  // beras Rp20.000 → ±1,111 kg
  [10000, 15000, 1000, 667],   // 666,67 → 667
  [9000, 18000, 1000, 500],
])("qtyBaseFromAmount(%i, %i, %i) = %i", (a, p, u, q) => expect(qtyBaseFromAmount(a, p, u)).toBe(q));
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/shared/lib/quantity.test.ts`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Implementasi**

Semua aritmetika bilangan bulat: `roundHalfUp(a, b) = Math.floor((2a + b) / (2b))`; lempar `RangeError` bila hasil perkalian di luar safe integer.

- [ ] **Step 4: Jalankan test**

Run: `npx vitest run src/shared/lib/quantity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/lib
git commit -m "feat: utilitas berat curah dan pembulatan"
```

---

### Task 4: `shared/lib/denominations.ts`

**Files:**
- Create: `web/src/shared/lib/denominations.ts`
- Test: `web/src/shared/lib/denominations.test.ts`

**Interfaces:**
- Produces: `quickCashOptions(total: number): number[]` — elemen pertama = `total` (uang pas), lalu maks 3 nominal > total, naik, unik. `total <= 0` → `[]`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test.each([
  [3100,   [3100, 5000, 10000, 20000]],
  [18000,  [18000, 20000, 50000, 100000]],
  [27000,  [27000, 30000, 40000, 50000]],
  [50000,  [50000, 100000, 200000, 300000]],
  [361500, [361500, 370000, 400000, 500000]],
  [25000000, [25000000, 25100000, 25200000, 25300000]],
  [0, []],
])("quickCashOptions(%i)", (t, want) => expect(quickCashOptions(t)).toEqual(want));
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/shared/lib/denominations.test.ts`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Implementasi**

Total < 50.000: bulatkan ke atas ke kelipatan `[5000, 10000, 20000, 50000, 100000]`. Total ≥ 50.000: kelipatan `[10000, 50000, 100000]`, lalu bila kurang dari 3, tambah kelipatan 100.000 berikutnya. Buang yang ≤ total dan duplikat, ambil 3 pertama.

- [ ] **Step 4: Jalankan test**

Run: `npx vitest run src/shared/lib/denominations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/lib
git commit -m "feat: tombol nominal cepat"
```

---

### Task 5: Design system — token, font, komponen dasar

**Files:**
- Create: `web/src/app/styles.css`
- Create: `web/components.json` (shadcn)
- Create: `web/src/shared/ui/button.tsx`, `dialog.tsx`, `tabs.tsx`, `input.tsx`, `table.tsx`, `sheet.tsx`, `sonner.tsx`
- Create: `web/src/shared/lib/cn.ts`
- Test: `web/src/shared/ui/button.test.tsx`

**Interfaces:**
- Produces: utilitas Tailwind dari token (`bg-primary`, `text-muted`, `border-border`, `bg-primary-soft`, `bg-success-soft`, `text-danger`, `bg-surface`, `bg-bg`); `<Button variant="primary" | "outline" | "ghost" | "danger" size="md" | "lg">` dengan `md` = tinggi 44px (`h-11`), `lg` = 56px (`h-14`); kelas utilitas `num` = `tabular-nums`.

- [ ] **Step 1: Pasang dan konfigurasi**

`npm i tailwindcss @tailwindcss/vite @fontsource-variable/inter clsx tailwind-merge` lalu `npx shadcn@latest init` (path komponen `src/shared/ui`, alias `@/`). Tambah komponen: `npx shadcn@latest add button dialog tabs input table sheet sonner`. `styles.css`: `@import "tailwindcss"; @import "@fontsource-variable/inter";` + blok `@theme` dengan token di Global Constraints, `--font-sans: "Inter Variable", system-ui, sans-serif`, `--radius-md: 8px`, `--radius-lg: 12px`, `body { font-size: 15px }`, ring fokus 2px `--primary`.

- [ ] **Step 2: Tulis test yang gagal**

```tsx
test("Button md tinggi 44px dan bisa difokus", async () => {
  render(<Button>Bayar</Button>);
  const b = screen.getByRole("button", { name: "Bayar" });
  expect(b.className).toContain("h-11");
  await userEvent.tab();
  expect(b).toHaveFocus();
});
test("Button lg tinggi 56px", () => {
  render(<Button size="lg">Bayar</Button>);
  expect(screen.getByRole("button").className).toContain("h-14");
});
```

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `npx vitest run src/shared/ui/button.test.tsx`
Expected: FAIL — varian/ukuran belum sesuai

- [ ] **Step 4: Sesuaikan `button.tsx` (varian & ukuran) dan warna komponen lain ke token**

- [ ] **Step 5: Verifikasi**

Run: `npm test && npm run build` lalu `ls dist/assets | grep -i inter`
Expected: test PASS; file font `inter-*.woff2` ada di `dist/assets`.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat: design system Bersih & Hijau dengan Inter dibundel"
```

---

### Task 6: Kontrak OpenAPI, orval, dan penanganan error API

**Files:**
- Create: `api/openapi.yaml`
- Create: `web/orval.config.ts`
- Create: `web/src/shared/api/fetcher.ts`
- Create (generated): `web/src/shared/api/gen/*`
- Test: `web/src/shared/api/fetcher.test.ts`

**Interfaces:**
- Produces:
  - Di `openapi.yaml`: `openapi: 3.0.3`; tag `system`, `auth`, `shift`, `catalog`, `sales`, `credit`, `inventory`, `reports`, `settings`; operasi `GET /api/health` (`operationId: getHealth`) → `200`/`503` `Health {status: "ok"|"degraded", version: string, db: "ok"|"error"}`; skema `Problem {type, title, status, code: ErrorCode, detail?}`; `ErrorCode` enum: `INTERNAL, NOT_FOUND, VALIDATION, FORBIDDEN_ORIGIN, UNAUTHORIZED, PIN_REQUIRED, PIN_INVALID, LOCKED_OUT, SHIFT_CLOSED, SHIFT_ALREADY_OPEN, PRICE_CHANGED, CREDIT_LIMIT, INVALID_QUANTITY`. Endpoint fitur ditambahkan oleh F2/F3.
  - `class ApiError extends Error { status: number; code: ErrorCode | "NETWORK"; detail?: string; body?: unknown }`.
  - `customFetch<T>(url: string, init: RequestInit): Promise<T>` — mutator orval; respons non-2xx bertipe `application/problem+json` → `ApiError` dengan `code` dari body; gagal jaringan → `ApiError{status: 0, code: "NETWORK"}`; non-2xx tanpa problem+json → `ApiError{code: "INTERNAL"}` (termasuk `getHealth` 503, yang oleh UI dianggap offline).
  - Script npm `gen` = `orval --config orval.config.ts`.

- [ ] **Step 1: Tulis `openapi.yaml` dan `orval.config.ts`**

orval: input `../api/openapi.yaml`, output `src/shared/api/gen`, `client: "react-query"`, `httpClient: "fetch"`, `override.mutator: { path: "src/shared/api/fetcher.ts", name: "customFetch" }`, `mode: "tags-split"`. Tambah output kedua `client: "zod"` ke `src/shared/api/gen/zod`.

- [ ] **Step 2: Generate**

Run: `npm i -D orval && npm run gen`
Expected: hook `useGetHealth` ada di `src/shared/api/gen/system`.

- [ ] **Step 3: Tulis test yang gagal**

```ts
test("problem+json menjadi ApiError dengan code", async () => {
  mockFetch(409, { type: "about:blank", title: "Conflict", status: 409, code: "PRICE_CHANGED" }, "application/problem+json");
  await expect(customFetch("/api/x", {})).rejects.toMatchObject({ status: 409, code: "PRICE_CHANGED" });
});
test("gagal jaringan menjadi NETWORK", async () => {
  mockFetchReject(new TypeError("Failed to fetch"));
  await expect(customFetch("/api/x", {})).rejects.toMatchObject({ status: 0, code: "NETWORK" });
});
test("500 non-problem menjadi INTERNAL", async () => {
  mockFetch(500, "oops", "text/plain");
  await expect(customFetch("/api/x", {})).rejects.toMatchObject({ status: 500, code: "INTERNAL" });
});
test("200 mengembalikan body", async () => {
  mockFetch(200, { ok: true }, "application/json");
  await expect(customFetch("/api/x", {})).resolves.toMatchObject({ ok: true });
});
```

- [ ] **Step 4: Jalankan, pastikan gagal**

Run: `npx vitest run src/shared/api/fetcher.test.ts`
Expected: FAIL — `customFetch` belum ada

- [ ] **Step 5: Implementasi `customFetch` dan `ApiError`**

- [ ] **Step 6: Jalankan test dan generate ulang**

Run: `npm run gen && npm test && npm run typecheck`
Expected: PASS, tidak ada error tipe

- [ ] **Step 7: Commit**

```bash
git add api web
git commit -m "feat: kontrak OpenAPI, client orval, dan ApiError"
```

---

### Task 7: Infrastruktur backend palsu (MSW) dan skenario

**Files:**
- Create: `web/src/mocks/db.ts`, `web/src/mocks/scenarios.ts`, `web/src/mocks/seed.ts`
- Create: `web/src/mocks/handlers/system.ts`, `web/src/mocks/handlers/index.ts`
- Create: `web/src/mocks/browser.ts`, `web/src/mocks/node.ts`
- Create: `web/public/mockServiceWorker.js` (via `npx msw init public --save`)
- Modify: `web/src/main.tsx` (aktifkan MSW secara kondisional sebelum render)
- Modify: `web/vitest.setup.ts` (server MSW untuk test)
- Test: `web/src/mocks/scenarios.test.ts`, `web/src/mocks/db.test.ts`

**Interfaces:**
- Produces:
  - `type Scenario = "normal" | "server-mati" | "lambat" | "harga-berubah" | "printer-gagal" | "stok-minus"`.
  - `getScenario(): Scenario` (dari `?skenario=`, lalu `localStorage["mock.skenario"]`, default `"normal"`); `setScenario(s: Scenario): void`.
  - `withScenario(resolver)` — pembungkus handler MSW: `server-mati` → `HttpResponse.error()`; `lambat` → `delay(1500)` lalu lanjut; lainnya lanjut (dipakai handler F2/F3).
  - `mockDb`: `{ get(): MockState; update(fn: (s: MockState) => void): void; reset(): void }`, persisten di `localStorage["mock.db"]`; `MockState` di F1 berisi `{ store: { id: string; name: "ShaziaMart" } }` dan diperluas F2/F3.
  - `rng(seed: number): () => number` (mulberry32) di `seed.ts`; seed tetap `20261017`.
  - `enableMocking(): Promise<void>` di `main.tsx`: aktif bila `import.meta.env.DEV || import.meta.env.VITE_MOCK === "1"`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("default skenario normal; ?skenario menang atas localStorage", () => {
  expect(getScenario()).toBe("normal");
  localStorage.setItem("mock.skenario", "lambat");
  history.replaceState(null, "", "/?skenario=server-mati");
  expect(getScenario()).toBe("server-mati");
});
test("skenario tak dikenal jatuh ke normal", () => {
  history.replaceState(null, "", "/?skenario=ngawur");
  expect(getScenario()).toBe("normal");
});
test("health normal 200, server-mati gagal jaringan", async () => {
  setScenario("normal");
  await expect(fetch("/api/health").then(r => r.status)).resolves.toBe(200);
  setScenario("server-mati");
  await expect(fetch("/api/health")).rejects.toThrow();
});
test("lambat menunda ≥ 1500 ms", async () => { /* fake timers: response belum selesai di 1499 ms, selesai di 1500 ms */ });
test("mockDb persist dan reset", () => {
  mockDb.update(s => { s.store.name = "X"; });
  expect(JSON.parse(localStorage.getItem("mock.db")!).store.name).toBe("X");
  mockDb.reset();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});
test("rng deterministik", () => {
  const a = rng(20261017), b = rng(20261017);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/mocks`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Implementasi**

`npm i -D msw`. Handler health mengembalikan `{status: "ok", version: "mock", db: "ok"}`. `vitest.setup.ts`: `server.listen({ onUnhandledRequest: "error" })`, reset handler, `localStorage.clear()` dan `history.replaceState(null, "", "/")` setiap `afterEach`.

- [ ] **Step 4: Jalankan test**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat: backend palsu MSW dengan skenario dan state persisten"
```

---

### Task 8: Routing, layout kasir & owner, status server, panel dev

**Files:**
- Create: `web/src/app/router.tsx`, `web/src/app/providers.tsx`
- Create: `web/src/features/kasir/kasir-layout.tsx`, `web/src/features/kasir/kasir-page.tsx`
- Create: `web/src/features/owner/owner-layout.tsx`, `web/src/features/owner/pages.tsx`
- Create: `web/src/shared/components/server-status.tsx`, `web/src/shared/components/server-down-bar.tsx`
- Create: `web/src/mocks/dev-panel.tsx`
- Modify: `web/src/app/app.tsx`
- Test: `web/src/shared/components/server-status.test.tsx`, `web/src/features/owner/owner-layout.test.tsx`, `web/src/app/router.test.tsx`

**Interfaces:**
- Consumes: `useGetHealth` (Task 6), `getScenario`/`setScenario`/`mockDb.reset` (Task 7), komponen UI (Task 5).
- Produces:
  - Route: `/` → redirect `/kasir`; `/kasir` (lazy); `/owner` (lazy) dengan anak `/owner` (Beranda), `/owner/barang`, `/owner/laporan`, `/owner/kasbon`, `/owner/lainnya`. Setiap halaman owner sementara menampilkan heading sesuai namanya.
  - `useServerHealth(): { online: boolean; checking: boolean }` — polling `getHealth` tiap 5000 ms, `retry: false`; `online` = respons 200 dengan `status === "ok"`.
  - `<ServerStatus />` — teks `● Server tersambung` / `● Server tidak tersambung`.
  - `<ServerDownBar />` — bar `role="alert"`: `Server tidak tersambung — transaksi belum bisa disimpan` (hanya di layout kasir, saat offline).
  - Layout kasir: header `ShaziaMart` + `<ServerStatus/>` + tombol `Riwayat` dan `Kunci` (nonaktif di F1, diisi F2).
  - Layout owner: header (tanggal hari ini dalam format Indonesia + `ShaziaMart`) dan navigasi 5 item `Beranda, Barang, Laporan, Kasbon, Lainnya` — tab bawah di bawah 1024px, sidebar di ≥ 1024px; item aktif ditandai `aria-current="page"`. Saat offline, isi halaman diganti `Tidak bisa terhubung ke toko — pastikan PC kasir menyala dan online` + tombol `Coba lagi`.
  - `<DevPanel />` — hanya dirender bila mock aktif: pilih skenario + tombol `Reset data`.

- [ ] **Step 1: Tulis test yang gagal**

```tsx
test("ServerStatus: tersambung saat health ok", async () => { /* render dengan QueryClient + MSW normal → findByText("● Server tersambung") */ });
test("ServerStatus: tidak tersambung saat server-mati", async () => { /* setScenario("server-mati") → findByText("● Server tidak tersambung") */ });
test("ServerStatus: tidak tersambung saat 503 degraded", async () => { /* override handler 503 {status:"degraded"} */ });
test("layout kasir menampilkan ServerDownBar saat offline", async () => { /* findByRole("alert") memuat "transaksi belum bisa disimpan" */ });
test("owner: 5 item navigasi dan aria-current pada halaman aktif", async () => { /* render /owner/laporan → link "Laporan" aria-current="page" */ });
test("owner offline menampilkan layar tidak bisa terhubung + Coba lagi", async () => { /* server-mati */ });
test("/ redirect ke /kasir", async () => { /* memory history "/" → heading/teks layout kasir */ });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm test`
Expected: FAIL — komponen belum ada

- [ ] **Step 3: Implementasi**

`npm i @tanstack/react-router @tanstack/react-query`. Router berbasis kode (bukan file-based) dengan `lazyRouteComponent` untuk `kasir` dan `owner`. Tanggal header: `Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short" })`.

- [ ] **Step 4: Jalankan test dan cek manual**

Run: `npm test`, lalu `npm run dev` dan buka `/kasir`, `/owner`, `/owner?skenario=server-mati`.
Expected: test PASS; tampilan sesuai mockup spec bagian 4 dan 8 (kerangka).

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat: routing dan layout kasir/owner dengan status server"
```

---

### Task 9: PWA untuk owner

**Files:**
- Create: `web/public/icon.svg`
- Create: `web/pwa-assets.config.ts`
- Create: `web/src/app/pwa.ts` (`shouldRegisterPwa`)
- Create: `web/src/app/pwa-options.ts` (`pwaOptions`, dipakai `vite.config.ts` dan test)
- Modify: `web/vite.config.ts` (vite-plugin-pwa)
- Modify: `web/src/main.tsx` (registrasi SW kondisional)
- Test: `web/src/app/pwa-config.test.ts`

**Interfaces:**
- Produces:
  - Manifest: `name: "ShaziaMart Pemilik"`, `short_name: "ShaziaMart"`, `start_url: "/owner/"`, `scope: "/owner/"`, `display: "standalone"`, `theme_color: "#1f7a4d"`, `background_color: "#f6f7f5"`, `lang: "id"`, ikon 192/512 + maskable.
  - Service worker: scope `/owner/`, precache aset aplikasi saja, `navigateFallback: "/index.html"`, `navigateFallbackDenylist: [/^\/api\//]`, tanpa runtime caching untuk `/api`.
  - `shouldRegisterPwa(env): boolean` di `web/src/app/pwa.ts` — `false` bila mock aktif (`DEV` atau `VITE_MOCK=1`), `true` hanya di build produksi non-mock.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("SW PWA tidak didaftarkan saat mock", () => {
  expect(shouldRegisterPwa({ DEV: true, VITE_MOCK: undefined })).toBe(false);
  expect(shouldRegisterPwa({ DEV: false, VITE_MOCK: "1" })).toBe(false);
  expect(shouldRegisterPwa({ DEV: false, VITE_MOCK: undefined })).toBe(true);
});
test("konfigurasi manifest dan SW", () => {
  // import { pwaOptions } dari vite.config (diekspor terpisah di web/src/app/pwa-options.ts)
  expect(pwaOptions.manifest).toMatchObject({ start_url: "/owner/", scope: "/owner/", display: "standalone", lang: "id" });
  expect(pwaOptions.workbox?.navigateFallbackDenylist?.some(r => r.test("/api/health"))).toBe(true);
  expect(pwaOptions.workbox?.runtimeCaching ?? []).toHaveLength(0);
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/app/pwa-config.test.ts`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Implementasi**

`npm i -D vite-plugin-pwa @vite-pwa/assets-generator`. Ikon dari `icon.svg` (huruf "S" putih di lingkaran `#1f7a4d`). `injectRegister: null`; registrasi manual di `main.tsx` lewat `virtual:pwa-register` hanya bila `shouldRegisterPwa(import.meta.env)`.

- [ ] **Step 4: Verifikasi**

Run: `npm test && npm run build && cat dist/manifest.webmanifest`
Expected: test PASS; manifest memuat `start_url` `/owner/` dan ikon 192/512.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat: PWA untuk aplikasi pemilik"
```

---

### Task 10: E2E, aksesibilitas, dan penjaga request eksternal

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/e2e/fixtures.ts`
- Create: `web/e2e/shell.spec.ts`
- Modify: `web/package.json` (script `build:mock` = `VITE_MOCK=1 vite build`, `e2e` = `playwright test`)

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces: fixture `test` yang (1) menggagalkan test bila ada request ke host selain `baseURL`, (2) menyediakan `expectNoA11yViolations(page)` (axe, gagal pada impact `serious`/`critical`).

- [ ] **Step 1: Konfigurasi**

`npm i -D @playwright/test @axe-core/playwright cross-env` lalu `npx playwright install chromium`. `webServer`: `npm run build:mock && npm run preview -- --port 4173 --strictPort`, `baseURL` `http://localhost:4173`. Project: `kasir` (1366×768), `owner-hp` (360×800), `owner-laptop` (1280×800). `build:mock` memakai `cross-env VITE_MOCK=1` agar jalan di Windows.

- [ ] **Step 2: Tulis test E2E**

```ts
test("kasir: kerangka tampil dan server tersambung", async ({ page }) => {
  await page.goto("/kasir");
  await expect(page.getByText("ShaziaMart")).toBeVisible();
  await expect(page.getByText("● Server tersambung")).toBeVisible();
  await expectNoA11yViolations(page);
});
test("kasir: server mati menampilkan bar merah", async ({ page }) => {
  await page.goto("/kasir?skenario=server-mati");
  await expect(page.getByRole("alert")).toContainText("transaksi belum bisa disimpan");
});
test("owner HP: tab bawah; laptop: sidebar", async ({ page }, info) => {
  await page.goto("/owner");
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link")).toHaveCount(5);
  // owner-hp: nav berada di bawah viewport (boundingBox.y > 700); owner-laptop: nav di kiri (boundingBox.x === 0, tinggi ≥ 600)
  await expectNoA11yViolations(page);
});
test("owner: deep link /owner/laporan tetap SPA dan mendapat data mock", async ({ page }) => {
  await page.goto("/owner/laporan");
  await expect(page.getByRole("heading", { name: "Laporan" })).toBeVisible();
  await expect(page.getByText("Tidak bisa terhubung ke toko")).toHaveCount(0);
});
// Penjaga request eksternal aktif di semua test lewat fixture.
```

- [ ] **Step 3: Jalankan E2E**

Run: `npm run e2e`
Expected: semua test PASS di 3 project

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "test: E2E kerangka, aksesibilitas, dan penjaga request eksternal"
```

---

### Task 11: CI frontend

**Files:**
- Create: `.github/workflows/web.yml`
- Modify: `web/package.json` (script `gen:check` = `npm run gen && git diff --exit-code -- src/shared/api/gen`)

**Interfaces:**
- Consumes: script `lint`, `typecheck`, `test`, `gen:check`, `build`, `e2e`.

- [ ] **Step 1: Workflow**

Trigger: `push` ke `main` dan `pull_request` yang menyentuh `web/**` atau `api/**`. Satu job `web` di `ubuntu-latest`, `working-directory: web`: setup Node 24 dengan cache npm, `npm ci`, `npm run lint`, `npm run typecheck`, `npm run gen:check`, `npm test`, `npx playwright install --with-deps chromium`, `npm run e2e`, upload laporan Playwright bila gagal.

- [ ] **Step 2: Verifikasi lokal**

Run: `npm run lint && npm run typecheck && npm run gen:check && npm test && npm run e2e`
Expected: semua sukses

- [ ] **Step 3: Commit dan push**

```bash
git add .github web/package.json
git commit -m "ci: lint, test, dan E2E frontend"
git push
```
Expected: workflow `web` hijau di GitHub Actions.

# Client runtime, hardware integration and frontend stack for a Windows grocery POS cashier station

Research date: 2026-10-15. Context: a Windows 10/11 cashier PC with a USB HID barcode scanner, a USB ESC/POS thermal printer (58 or 80 mm) and a cash drawer on the printer's RJ11 kick port. The developer knows Go and React. The owner uses a phone browser (Android/iOS).

How sources were checked:
- **(fetched)** means I opened the page directly with WebFetch, the npm registry JSON or the GitHub REST API.
- **(search)** means the claim comes from a search-engine summary of that URL and I did not open the page myself. Give these less weight.
- Version numbers marked "npm registry" were read live from `https://registry.npmjs.org/<pkg>` on 2026-10-15.

---

## 1. Client runtime options and trade-offs (Edge/Chrome kiosk, Tauri v2, Wails v2/v3, Electron, Flutter desktop)

### Takeaway
Two runtimes fit this project best: (1) an Edge or Chrome kiosk/app window pointed at a local Go server, or (2) Wails v2, which is stable, runs Go natively and uses WebView2. Tauri v2 is mature and actively released, but it adds Rust to a Go/React team. Electron is the heaviest option, at roughly 80+ MB and 150+ MB idle RAM according to blog benchmarks. Wails v3 is still a beta (beta.29, 13 Oct 2026), so do not build production on it yet.

### Cited Findings
**Browser kiosk (Edge)**
- Edge kiosk mode applies to Edge 87+ and has two modes. "Digital/Interactive Signage" shows one site full screen (`msedge.exe --kiosk URL --edge-kiosk-type=fullscreen`). "Public browsing" is a limited multi-tab mode. Both run an InPrivate session, and autofill is disabled. — [MS Learn: Configure Edge kiosk mode (fetched; updated 2026-10-06)](https://learn.microsoft.com/deployedge/microsoft-edge-configure-kiosk-mode)
- Kiosk mode blocks F11 and F12, blocks Ctrl+N, restricts launching other apps from the browser (Edge 90+) and locks down the UI print settings (Edge 90+). The "PrintingEnabled" policy is supported. — [MS Learn (fetched)](https://learn.microsoft.com/deployedge/microsoft-edge-configure-kiosk-mode)
- `--kiosk-idle-timeout-minutes` resets the session after inactivity, but it does not restart Edge afterwards. Automatic restart needs Assigned Access or Shell Launch. With single-app Assigned Access, the "Digital/Interactive signage" option is chosen from Windows Settings > "Set up a kiosk". — [MS Learn (fetched)](https://learn.microsoft.com/deployedge/microsoft-edge-configure-kiosk-mode)
- Listed functional limitations: Extensions policies, BackgroundModeEnabled, StartupBoostEnabled, IsolateOrigins and others are not supported in kiosk mode. This matters because **browser extensions cannot be used in Edge kiosk mode**. — [MS Learn (fetched)](https://learn.microsoft.com/deployedge/microsoft-edge-configure-kiosk-mode)
- The Microsoft kiosk page does not document `--kiosk-printing` (silent printing). — [MS Learn (fetched)](https://learn.microsoft.com/deployedge/microsoft-edge-configure-kiosk-mode)

**Tauri v2**
- The latest `tauri` crate is 2.12.3 and the latest `@tauri-apps/cli` is 2.12.2, both released Oct 10, 2026. The updater plugin is at 2.13.3 and the autostart plugin at 2.7.0 (Oct 1, 2026). Releases are frequent. — [Tauri release index (fetched)](https://v2.tauri.app/release/); npm registry shows `@tauri-apps/cli` 2.12.3 published 2026-10-14 — [npm registry (fetched)](https://registry.npmjs.org/@tauri-apps/cli)
- On Windows, Tauri uses WebView2. WebView2 updates itself and comes preinstalled on Windows 11, and on older Windows the Tauri installer installs it. The NSIS bundler has a `minimumWebview2Version` option. — [Tauri Webview Versions (search)](https://v2.tauri.app/reference/webview-versions/); [tauri-bundler v2.0.1-rc.6 notes (search)](https://v2.tauri.app/release/tauri-bundler/v2.0.1-rc.6/)

**Wails**
- Wails v3 releases are pre-releases up to **v3.0.0-beta.29 (13 Oct 2026)**. They are automated nightly builds from master. The notes say "The API is stable, but you may still encounter issues before the final 3.0 release." No date is given for the final release. — [wailsapp/wails releases (fetched)](https://github.com/wailsapp/wails/releases)
- v3 beta.8 removed the desktop binary release pipeline, so v3 is tag-only and the CLI is installed with `go install`. The v3 beta announcement still calls v2 the current stable release and advises keeping v2 apps in place. — [newreleases v3.0.0-beta.8 (search)](https://newreleases.io/project/github/wailsapp/wails/release/v3.0.0-beta.8); [newreleases v3.0.0-beta.0 (search)](https://newreleases.io/project/github/wailsapp/wails/release/v3.0.0-beta.0)
- Wails v2 is still being maintained. v2.14.0 was published 2026-08-10, v2.13.0 on 2026-07-06 and v2.12.0 on 2026-03-26. — [GitHub API wails releases (fetched)](https://api.github.com/repos/wailsapp/wails/releases?per_page=100)

**Electron**
- The latest stable Electron is 44.7.2 (Oct 14, 2026), which bundles Chromium 152.0.7977.149 and Node.js 24.21.0. The 43.x and 42.x stable lines are patched in parallel. — [releases.electronjs.org (fetched)](https://releases.electronjs.org/); [npm registry electron (fetched)](https://registry.npmjs.org/electron)
- Size and memory, from blog benchmarks with unclear methodology: a Tauri "Hello World" is 3.2 MB vs 85 MB for Electron, idle memory is 42 MB vs 168 MB, and cold start is 380 ms vs 1,420 ms. — [Tech Insider, Jul 2026 (search)](https://tech-insider.org/tauri-vs-electron-2026/). Another source gives Tauri 30–40 MB idle vs Electron 200–300 MB, and Electron bundles of 80–150 MB. — [codenote (search)](https://codenote.net/en/posts/cross-platform-dev-tools-comparison-2026/). The Tech Insider article calls "Electron 34.x" the current baseline, which conflicts with the actual 44.x line, so treat its figures as rough.
- Tauri moves extra work into WebView compatibility checks and Rust/native-command ownership. — [PkgPulse (search)](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)

**Flutter desktop**
- Not researched successfully. The GitHub releases API for flutter/flutter returned only a 2024 pre-release tag, which is not meaningful because Flutter publishes releases elsewhere. See Gaps.

### Inferences
- **Browser kiosk + local Go server (recommended baseline):** This option ships no client binary. The Go service is the only thing installed, and Edge is already on Windows 10/11. Auto-start comes from a Startup shortcut, Task Scheduler or Assigned Access. "Auto-update" just means updating the Go service, because the UI is served by it. The same React SPA also serves the owner's phone browser, so one codebase covers both. The downside is that the browser cannot reach the printer directly, so hardware goes through the local Go service. That is the most reliable path anyway (see §2). Edge kiosk mode does not support extensions, which rules out extension-based printing helpers.
- **Wails v2:** This gives a single Go binary with a WebView2 window. Go code can call winspool directly through bindings. It is a good fit if a "real app" window is wanted (no browser chrome, no URL bar risk). Use v2, not v3, until v3.0 is final.
- **Tauri v2:** It is technically excellent and has official autostart and updater plugins. However, its native layer is Rust. For this team the Go backend would run as a sidecar or separate service, which adds a language and a build toolchain for little gain over Wails.
- **Electron:** Its strengths are the largest ecosystem and Node-native USB/printer modules. The costs are about 80+ MB downloads and higher RAM, which matters on low-end cashier PCs. Its native modules also duplicate what the Go backend already does.
- **Owner on phone:** Whichever runtime is chosen, the UI should be a plain web SPA served over HTTP(S) by the Go backend so the owner's phone can use it. That favours the browser-kiosk or Wails v2 approach, since both reuse the same SPA.

### Gaps
- Flutter desktop: I did not verify its current stable version, Windows printing/USB plugins or kiosk story. It would also mean writing the UI in Dart, which the developer does not know.
- Wails v2 bundle size and memory figures were not found in a primary source.
- I could not open the wails.io changelog (HTTP 403), so I have no official statement on v2's long-term maintenance commitment.
- WebView2 Evergreen runtime presence on Windows 10 was not confirmed from a Microsoft page. The only claim is Tauri's (search).

---

## 2. Printing ESC/POS receipts: Go RAW to the spooler vs WebUSB/Web Serial vs QZ Tray vs window.print + kiosk-printing

### Takeaway
The most reliable approach is to send RAW ESC/POS bytes from the local Go service to the Windows print spooler (winspool `OpenPrinter` → `StartDocPrinter` with datatype "RAW" → `WritePrinter`). It uses the vendor's normal Windows driver, needs no driver swap and works from any client runtime. WebUSB usually needs the printer's driver replaced with WinUSB through Zadig, which is fragile. `window.print()` with `--kiosk-printing` cannot send the drawer-kick or cut commands reliably, and vendors report it breaking in some Edge versions. QZ Tray works, but adds a Java tray app and a certificate/trust step.

### Cited Findings
**(a) Go → Windows spooler RAW**
- `github.com/alexbrainman/printer` is a Windows printing package. It wraps `OpenPrinter`, `StartDocPrinter`, `WritePrinter`, `EndDocPrinter`, `EnumPrinters` and `GetDefaultPrinter`. `Printer.StartRawDocument(name)` starts a document with type "RAW", or "XPS_PASS" when the driver is XPS-based. It is BSD-3-Clause. — [pkg.go.dev alexbrainman/printer (fetched)](https://pkg.go.dev/github.com/alexbrainman/printer)
  - Maintenance: no tagged releases. The last commit was 2020-09-12. — [GitHub API commits (fetched)](https://api.github.com/repos/alexbrainman/printer/commits?per_page=1)
- `github.com/DevLumuz/go-escpos` v1.0.2 (Nov 7, 2025, MIT, fork of joeyak's library) uses `winspool.drv` through syscall (`OpenPrinterW`, `StartDocPrinterW`, `WritePrinter`, `EnumPrintersW`). It provides `NewWindowsPrinter(name)`, `GetInstalledPrinters()`, `NewIpPrinter(addr)` and `NewPrinter(io.Writer)`, plus text, barcode, image, cut and status functions. Status includes a `DrawerOpen` field. It has no dedicated drawer-kick function, so `Write([]byte)` is used for raw commands. It has 0 known importers. — [pkg.go.dev DevLumuz/go-escpos (fetched)](https://pkg.go.dev/github.com/DevLumuz/go-escpos)
- Reference implementations in other languages use the same winspool approach: python-escpos `Win32Raw` (pywin32) — [python-escpos win32raw (search)](https://python-escpos.readthedocs.io/en/latest/_modules/escpos/printer/win32raw.html); and a C++ example using Winspool.lib with datatype "RAW" — [U++ forum (search)](https://www.ultimatepp.org/forums/pdf.php?th=6632)

**(b) WebUSB / Web Serial**
- MDN marks WebUSB as **Experimental** and "Limited availability… not Baseline because it does not work in some of the most widely-used browsers". It requires a secure context (HTTPS). — [MDN WebUSB API (fetched)](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API)
- WebUSB is supported by Chromium-based browsers (Chrome, Edge, Opera, Samsung Internet), not Firefox or Safari. — [HackerNoon (search)](https://sia.hackernoon.com/exploring-the-webusb-api-connecting-to-usb-devices-and-printing-with-tspltspl2). Web Serial is supported in Chrome/Edge 89+, Safari has no support, and the claim of Firefox 151+ is unconfirmed. — [OpenReplay (search)](https://blog.openreplay.com/web-serial-api-use-cases/)
- On Windows, the default driver installed when the printer is plugged in blocks Chrome from opening or claiming the device ("DOMException: Access denied"). — [Zebra developer forum (search)](https://developer.zebra.com/content/domexception-failed-execute-open-usbdevice-access-denied). The usual fix is to run Zadig as administrator and replace the driver with WinUSB. — [CloudBridal help (search)](https://help.cloudbridal.com/en/article/printing-receipts-with-a-thermal-printer-7t79xf/); [Storepass docs (search)](https://admin.storepass.co/support/documentation/DfLHy7p6Ca). A Zebra forum poster calls Zadig "not viable for our customer base". — [Zebra forum (search)](https://developer.zebra.com/content/domexception-failed-execute-open-usbdevice-access-denied)
- Web Serial exists because OS serial drivers claim USB-to-serial adapters before WebUSB can reach them, so printers that appear as COM ports need Web Serial instead. — [dev.to (search)](https://dev.to/matemiller/when-web-meets-hardware-usb-serial-and-the-new-web-frontier-bnf)

**(c) QZ Tray**
- QZ Tray is described as a "Browser plugin for sending documents and raw commands to a printer or attached device". Its source code is LGPL-2.1 (QZ Industries). Premium support is paid ("fees may apply"). — [qzind/tray README & LICENSE (fetched)](https://github.com/qzind/tray)
- Latest release is v2.3.0, published 2026-09-11. The `qz-tray` npm package is also at 2.3.0. — [GitHub API qzind/tray releases (fetched)](https://api.github.com/repos/qzind/tray/releases?per_page=1); [npm registry qz-tray (fetched)](https://registry.npmjs.org/qz-tray)
- I could not open the pricing page (404) or the download page (no content). — [qz.io/pricing (fetched, 404)](https://qz.io/pricing/)

**(d) window.print() + 58 mm CSS + --kiosk-printing**
- In Chrome, adding `--kiosk-printing` to the shortcut prints without a dialog, but it removes the ability to choose a printer, so the OS default printer is used. — [Koha wiki (search)](https://wiki.koha-community.org/wiki/Configure_Automatic_Receipt_Printing)
- Vendor reports say Edge 96 introduced a bug that broke `--kiosk-printing` and that Microsoft acknowledged it — [churchteams (search)](https://help.churchteams.com/knowledge/automatic-or-kiosk-printing-isnt-working-in-edge-on-a-pc). A POS vendor says Edge kiosk printing needs print preview to stay enabled — [shoptill-e (search)](https://www.shoptill-e.com/support/74). One guide adds that no other browser windows may be open when launching the shortcut — [WhosOnLocation (search)](https://helpdesk.whosonlocation.com/hc/en-us/articles/360009886693). These pages are dated, and the bug's current status is unknown.
- By default the page size is Letter/A4 (about 210 mm wide), so content gets cut off on a roll. The roll width has to be set. — [AutoPrintEmail (search)](https://autoprint.email/help/thermal-receipt-printer-setup). A 58 mm printer typically has about 48 mm of effective print width. — [spec sheet (search)](https://p.globalsources.com/IMAGES/PDT/SPEC/868/K1196029868.pdf)

### Inferences
- **Most reliable: (a) Go RAW to the spooler.** Install the vendor's Windows driver (or "Generic / Text Only"), share nothing, and have the Go service write RAW bytes. Raw bytes include cut and drawer-kick commands, which `window.print` cannot send. It works the same whether the UI runs in Edge kiosk, Wails or Tauri. It also works when the owner's phone triggers a reprint, because the printer stays attached to the PC's Go service.
- The Go library options are thin. alexbrainman/printer has been unchanged since 2020 and DevLumuz/go-escpos has 0 importers. The winspool calls are only about 5 syscalls, though, so wrapping them with `golang.org/x/sys/windows` (or vendoring alexbrainman/printer) is low risk. Generate the ESC/POS bytes separately (§4).
- WebUSB fails the "plug in and it works" test on Windows because of the WinUSB/Zadig driver swap. The swap also removes the printer from the Windows spooler, which breaks other apps and test prints. Avoid it.
- `window.print` + kiosk-printing is acceptable only as a fallback, for example printing from a browser with no local agent. It is GDI rasterized, slower, sensitive to CSS and the driver's paper size, and cannot kick the drawer unless the driver has a "open drawer after print" setting.
- QZ Tray is a reasonable option when you need a **pure web app with no local server**. Here a local Go service already exists, so QZ Tray would duplicate it.

### Gaps
- I did not find QZ Tray's current pricing, or whether the free version shows a trust/untrusted dialog on every print without a purchased certificate.
- The current status (2026) of the Edge `--kiosk-printing` bug is unknown.
- I did not confirm the MDN compatibility tables for Web Serial and WebUSB directly.

---

## 3. Cash drawer kick (ESC p) and HID keyboard-wedge barcode scanners

### Takeaway
The drawer opens when ESC p m t1 t2 (`1B 70 m t1 t2`) is sent to the printer. m=0 pulses connector pin 2 and m=1 pulses pin 5, with the pulse lasting t×2 ms. A common value is `1B 70 00 19 FA` (ESC p 0 25 250) or 50/50. HID wedge scanners "type" the code followed by Enter. Web apps tell scans from typing by inter-key timing (for example under about 20–40 ms per character) plus a suffix or prefix character configured on the scanner.

### Cited Findings
- Epson's reference: ESC p m t1 t2. m=0/48 means drawer connector pin 2 and m=1/49 means pin 5. ON time = t1×2 ms and OFF time = t2×2 ms. Epson recommends t1 < t2. Pins 2 and 5 cannot pulse at the same time. — [Epson ESC/POS ESC p (search; direct fetch returned 403)](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lp.html)
- The real-time variant DLE DC4 n=1 uses t×100 ms and is ignored during error status. — [Epson DLE DC4 fn1 (search)](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/dle_dc4_fn1.html)
- Example values: `ESC p 0 25 250` — [Unique Micro Design AN142 (search)](https://apu-lb2.umd.com.au/itd/an/an142.pdf); python-escpos `CD_KICK_2` uses 50/50 timing bytes — [python-escpos constants (search)](https://python-escpos.readthedocs.io/en/latest/api/constants.html). Common byte strings are `1B 70 00` for drawer 1 and `1B 70 01` for drawer 2, and the commands are "highly depending on your printer model". — [Smartlab ESC/POS codes (search)](https://tabshop.smartlab.at/help-topics/help-esc-pos-codes.html)
- Firing the pulse repeatedly can overheat the drawer solenoid. — [SambaPOS forum (search)](https://forum.sambapos.com/t/printing-registered-official-receipts-and-in-house-tickets/9920?page=2)
- Drawer status can be read back. go-escpos `TransmitPrinterStatus()` returns a `DrawerOpen` field. — [pkg.go.dev DevLumuz/go-escpos (fetched)](https://pkg.go.dev/github.com/DevLumuz/go-escpos)
- **Scanner detection:** The usual method is timing-based. Buffer keystrokes, treat a fast burst ending with Enter (keycode 13) as a scan, and tune the thresholds per device. jQuery Scanner Detection uses an average of 40 ms per character in its sample. One Stack Overflow answer uses a 20 ms idle timeout. — [search summary covering laracasts / SO / jQuery-Scanner-Detection (search)](https://dev.library.kiwix.org/content/stackoverflow_en_nopic_2021-08/questions/11290898/detect-when-input-box-filled-by-keyboard-and-when-by-barcode-scanner)
- Configuring a scanner prefix or suffix that people are unlikely to type is more robust. onScan.js combines speed with prefix/suffix detection. — [onscan.js npm (search)](https://www.npmjs.com/package/onscan.js)
- `use-scan-detection` is deprecated in favour of `@use-symbology-scanner/react`. — [npm use-scan-detection (search)](https://npmjs.com/package/use-scan-detection)

### Inferences
- Implement the drawer kick as a Go function that sends `ESC p 0 25 250` over the same RAW spooler job as the receipt, either before or after the cut, or as its own tiny RAW job for a "no sale" open. Make the pin (2 or 5) configurable because drawers differ.
- For the POS UI, use a global `keydown` listener. It buffers characters arriving under about 30 ms apart and ending in Enter, then routes them to "add item by barcode" regardless of which field has focus. Also program the scanner to send a prefix (for example F12 or a rare character) for certainty. Keep a dedicated barcode input with autofocus as the simple fallback. This works the same in a browser, WebView2 or Electron, because the scanner appears as a keyboard and needs no drivers.

### Gaps
- I did not open the Epson ESC p page directly (403), so the parameter details come from the search summary.
- I did not verify which 58 mm Chinese printers (for example Xprinter, EPPOS) honour pin 5.

---

## 4. Go libraries for ESC/POS generation and their maintenance status

### Takeaway
No Go ESC/POS library is both well maintained and widely used. hennedo/escpos has a clean API and is MIT licensed, but has had no commits since November 2022. DevLumuz/go-escpos (Nov 2025) adds native Windows spooler printing but has no adoption. Plan to own a thin ESC/POS byte-builder, borrowing from these, plus the winspool wrapper.

### Cited Findings
- **hennedo/escpos:** v0.0.1 (pkg.go.dev, Mar 2021, MIT). `New(io.Writer)` buffers commands until `Print()` or `PrintAndCut()`, and `WriteRaw` sends raw bytes. Features: bold, underline, reverse, upside-down, rotation, alignment, size, line spacing, UPC-A/E, EAN-13/8, QR, images and NV images, cut. Encodings are ASCII, Western European and GBK. There is no cash drawer function. — [pkg.go.dev hennedo/escpos (fetched)](https://pkg.go.dev/github.com/hennedo/escpos); repo has 118 stars, 14 open issues, 3 PRs and is not archived — [GitHub hennedo/escpos (fetched)](https://github.com/hennedo/escpos); last commit 2022-11-14 — [GitHub API (fetched)](https://api.github.com/repos/hennedo/escpos/commits?per_page=1)
- **DevLumuz/go-escpos** v1.0.2 (Nov 7, 2025): Windows winspool, IP and io.Writer printers, text, barcodes, images, cut, beep and status queries. It has no drawer-kick helper and 0 importers. — [pkg.go.dev (fetched)](https://pkg.go.dev/github.com/DevLumuz/go-escpos)
- **knq/escpos** (last published 2020), its fork **stephensfx/escpos** v1.0.0 (Mar 2025) and **paulobressan/escpos** (2020) are older or basic options. — [pkg.go.dev knq/escpos (search)](https://pkg.go.dev/github.com/knq/escpos); [pkg.go.dev stephensfx/escpos (search)](https://pkg.go.dev/github.com/stephensfx/escpos); [pkg.go.dev paulobressan/escpos (search)](https://pkg.go.dev/github.com/paulobressan/escpos)
- **alexbrainman/printer** handles winspool transport only, not ESC/POS. Last commit 2020. — [pkg.go.dev (fetched)](https://pkg.go.dev/github.com/alexbrainman/printer)

### Inferences
- A receipt needs only a small subset of ESC/POS: init `ESC @`, alignment `ESC a`, bold `ESC E`, size `GS !`, code page `ESC t`, feed, cut `GS V` and drawer `ESC p`. That subset is easy to own in about 200 lines. hennedo/escpos is a usable base, either vendored or used as-is through `io.Writer` into a `bytes.Buffer`, with `WriteRaw` for `ESC p`.
- Layout for 58 vs 80 mm: build a monospace line formatter (32 vs 48 columns at Font A on typical printers) rather than relying on image rendering. This is an inference; check the column counts against the specific printer's manual.

### Gaps
- I did not check whether any Go library handles Indonesian-specific needs (Rupiah formatting is trivial, and code pages are mostly ASCII).
- The column counts per paper width for common cheap printers are not confirmed from a primary source.

---

## 5. Frontend stack for a keyboard-heavy, data-dense POS UI (2026): React 19 + Vite + TanStack + Tailwind v4 + shadcn vs Svelte/Solid/Flutter; TanStack Router vs React Router

### Takeaway
React 19.3 + Vite 8 + TanStack Router 1.170 + TanStack Query 5 + Tailwind 4.3 + shadcn (CLI v4) is current and actively released, and it is the natural choice given the developer knows React. For a client-only SPA, TanStack Router gives typed params, search params and loaders out of the box. React Router is now at **v8** (June 2026). Its strongest type safety still comes from framework mode, while TanStack Router targets the SPA case directly. Svelte 5 and Solid are healthy but would mean learning a new framework for little gain here.

### Cited Findings
**Current versions (npm registry, read 2026-10-15)**
- react: 19.3.0, released Sep 9, 2026. 19.2.0 was Oct 1, 2025. React Compiler v1.0 blog post published Oct 7, 2025. — [react.dev/versions (fetched)](https://react.dev/versions)
- vite 8.3.4 (2026-10-08) — [npm](https://registry.npmjs.org/vite); @tanstack/react-router 1.170.44 (2026-10-12) — [npm](https://registry.npmjs.org/@tanstack/react-router); @tanstack/react-query 5.104.2 (2026-10-11) — [npm](https://registry.npmjs.org/@tanstack/react-query); tailwindcss 4.3.3 (2026-07-16) — [npm](https://registry.npmjs.org/tailwindcss); shadcn CLI 4.21.5 (2026-10-14) — [npm](https://registry.npmjs.org/shadcn); react-router 8.4.0 (2026-09-15) — [npm](https://registry.npmjs.org/react-router); svelte 5.57.2 (2026-10-06) — [npm](https://registry.npmjs.org/svelte); @sveltejs/kit 3.1.0 (2026-10-14) — [npm](https://registry.npmjs.org/@sveltejs/kit); solid-js 1.9.17 (2026-10-07) — [npm](https://registry.npmjs.org/solid-js) (all fetched)

**Recent major changes**
- **React Router v8.0.0 (2026-06-17):** first release on a yearly major cadence. Minimum versions are Node 22.22+, React 19.2.7+ and Vite 7+. It is ESM-only. The `react-router-dom` package is removed (import from `react-router` and `react-router/dom`). Middleware is always on. All `future.v8_*` flags became defaults. v9 is targeted around May/June 2027. — [React Router CHANGELOG v8.0.0 (fetched raw)](https://raw.githubusercontent.com/remix-run/react-router/main/CHANGELOG.md); release date — [GitHub API (fetched)](https://api.github.com/repos/remix-run/react-router/releases/tags/react-router@8.0.0)
- React Router v7 still gets patches: 7.18.4 was released 2026-09-15 alongside 8.4.0. — [GitHub API react-router releases (fetched)](https://api.github.com/repos/remix-run/react-router/releases?per_page=3)
- **Tailwind:** v4.2.0 added new palettes and a webpack plugin, later patches improved Vite 8 compatibility, and v4.3.1 (Jun 2026) fixed Vite alias resolution in `@import`/`@plugin`. — [releases.sh Tailwind (search)](https://releases.sh/tailwind-css/tailwind-css.md)
- **shadcn/ui CLI v4 (Mar 2026):** adds dry-run and diff flags, presets, and a `base` flag to choose primitives (Base UI or Radix). — [releases.sh shadcn (search)](https://releases.sh/shadcn/shadcn-ui/highlights); [Medium (search)](https://medium.com/@nakranirakesh/shadcn-ui-march-2026-update-cli-v4-ai-agent-skills-and-design-system-presets-d30cf200b0e9)

**TanStack Router vs React Router (blog-level sources)**
- TanStack Router types params, search params and loader data with zero configuration. In React Router v7, most advanced features and type safety work only in framework mode. Library-mode SPAs "don't get the enhanced type safety". — [Medium comparison (search)](https://medium.com/p/32dddc4fcd58); [Better Stack (search)](https://betterstack.com/community/guides/scaling-nodejs/tanstack-router-vs-react-router/)
- TanStack Router validates search params with Zod or Valibot and caches route loaders. React Router leads on ecosystem size (about 12M+ vs 1.2M weekly downloads in one source) and on SSR/RSC. — [PkgPulse (search)](https://www.pkgpulse.com/guides/tanstack-router-vs-react-router-v7-2026/raw.md); [reliasoftware (search)](https://reliasoftware.com/blog/tanstack-router-vs-react-router)

### Inferences
- **Recommendation for this POS:** Use React 19.3 + Vite 8 + TanStack Router (file-based, SPA mode) + TanStack Query + Tailwind 4 + shadcn (Radix or Base UI primitives) + TanStack Table/Virtual for the data-dense lists. TanStack Router's typed search params suit filter-heavy screens (product search, reports) that the owner may bookmark on a phone.
- React Router v8 is a fine choice if the team prefers its familiarity. But the v8 changelog focuses on framework and server concerns (middleware, Vite Environment API, prerendering), which an embedded SPA served by Go does not use.
- For a keyboard-first cashier screen, the important work is a global hotkey layer (F-keys for pay, qty, void), focus management, and the scanner listener from §3. This is framework-independent. shadcn's Radix/Base UI primitives provide accessible focus handling for dialogs and comboboxes.
- Svelte 5 / SvelteKit 3 and Solid 1.9 are actively released, but switching costs ramp-up time and the shadcn/TanStack ecosystem is richest for React. Flutter would mean Dart and a separate web/desktop story, which works against the "owner uses a phone browser" requirement.

### Gaps
- I did not read the React 19.3 release notes. Their content (for example Activity or ViewTransition stabilization) is unverified.
- I did not verify the SvelteKit 3.0 changes, or whether TanStack Start 1.0 is officially stable (the sources conflict).
- I found no primary-source benchmark on POS-style rendering performance between frameworks.

---

## 6. Sharing API types between a Go backend and a TypeScript frontend (OpenAPI + oapi-codegen + openapi-typescript/orval vs ConnectRPC vs tygo)

### Takeaway
All three approaches are actively maintained as of October 2026. The most complete option for a REST-style Go API used by a React SPA and a phone browser is spec-first OpenAPI with **oapi-codegen v2.8.0**, which added initial OpenAPI 3.1 support in July 2026, plus **openapi-typescript/openapi-fetch** (types-only, small) or **orval** (generates TanStack Query hooks). ConnectRPC v2 (connect-go 2.0.1 and connect-es 2.2.0) is the strongest typed-RPC alternative. tygo is the lightest option, Go structs to TS types only, with no client or contract.

### Cited Findings
- **oapi-codegen v2.8.0 (17 Jul 2026):** "initial support" for OpenAPI 3.1, closing issue #373. Adds callbacks and webhooks, `oneOf` enums and `type: [T, "null"]` nullability, and pre-generation spec validation. Requires Go 1.25 (for kin-openapi 3.1). v2.7.1 and v2.7.2 (Jun/Jul 2026) fixed Go code-injection issues from malicious specs, and the maintainers advise validating specs and reviewing generated code. They are seeking sponsorship and partly fund the solo kin-openapi maintainer. — [oapi-codegen releases (fetched)](https://github.com/oapi-codegen/oapi-codegen/releases)
- Before 2.8.0, the workaround for 3.1 specs was OpenAPI Overlays. — [jvt.me (search)](https://www.jvt.me/posts/2025/05/04/oapi-codegen-trick-openapi-3-1/)
- **openapi-typescript** 7.13.0 and **openapi-fetch** 0.17.0, both published 2026-02-11 (no newer release since). — [npm openapi-typescript (fetched)](https://registry.npmjs.org/openapi-typescript); [npm openapi-fetch (fetched)](https://registry.npmjs.org/openapi-fetch)
- **orval** 8.43.0, published 2026-10-14 (very active). — [npm orval (fetched)](https://registry.npmjs.org/orval). Orval generates clients and React Query hooks ("batteries-included"), while openapi-typescript is types-only. All three are MIT and actively maintained. — [pistack 2026-10-01 comparison (search)](https://www.pistack.xyz/posts/2026-10-01-orval-vs-kubb-vs-openapi-typescript-typescript-client-generators/); [PkgPulse (search)](https://www.pkgpulse.com/guides/orval-vs-openapi-typescript-vs-kubb-openapi-client-2026)
- **ConnectRPC:** connect-go v2.0.1 was published 2026-10-14, and v1.21.1 the same day (v1 is still patched). — [GitHub API connect-go releases (fetched)](https://api.github.com/repos/connectrpc/connect-go/releases?per_page=2). connect-go v2 is a new major version of the Go API, not of the protocol. The wire protocol is unchanged, generated code uses plain messages, and v1 is supported indefinitely on its own branch. — [newreleases connect-go v2.0.0 (search)](https://newreleases.io/project/github/connectrpc/connect-go/release/v2.0.0). @connectrpc/connect (ES) is at 2.2.0 (2026-09-07) — [npm (fetched)](https://registry.npmjs.org/@connectrpc/connect). Connect-ES v2 (GA Nov 2024) moved to Protobuf-ES 2.0 and no longer needs its own codegen plugin. — [connectrpc.com migrating to v2 (search)](https://connectrpc.com/docs/web/migrating-to-v2/)
- **tygo** (gzuidhof): generates TS typings from Go source, preserving comments and constants and supporting non-struct type expressions. It has 928 stars, 11 open issues and 9 open PRs, and is not archived. — [GitHub gzuidhof/tygo (fetched)](https://github.com/gzuidhof/tygo). Latest release v0.2.21 (2026-02-03), v0.2.20 (2025-11-19). — [GitHub API tygo releases (fetched)](https://api.github.com/repos/gzuidhof/tygo/releases?per_page=3)

### Inferences
- **For this project:** Use OpenAPI 3.x as the contract. Generate the Go server interfaces with oapi-codegen, using the `std-http`/chi strict-server mode. On the TS side use **orval** for TanStack Query hooks, or **openapi-typescript + openapi-fetch** for a tiny runtime. If the 3.1 support in oapi-codegen is still "initial" for your spec, author in 3.0.3, which it has long supported.
- The OpenAPI spec also documents the API for future integrations (for example a mobile app or e-commerce sync) and is plain JSON/REST that the owner's phone browser calls directly.
- ConnectRPC is excellent if you want protobuf schemas and streaming, for example live sales on the owner dashboard. It also speaks plain HTTP/JSON, so browsers work without a proxy. The cost is a protobuf/buf toolchain, and it is less natural for REST-ish CRUD and file/CSV endpoints.
- tygo suits code-first, small teams, but it shares only types: no endpoint, method or status contract, and no client generation. Drift in routes and params is still possible.

### Gaps
- I did not check whether oapi-codegen's 3.1 support covers everything a typical CRUD spec needs. The maintainers call it "initial".
- I did not compare generated bundle sizes (orval vs openapi-fetch vs connect-es).
- I did not verify the openapi-typescript 8.x roadmap.

# Real-world POS Tech Stacks and Offline Architectures (benchmark for a single-store toko sembako POS)

Research date: 2026-10-15. Source labels used below:
- **[OPENED]**: page fetched and read in full (or the relevant part of it).
- **[SNIPPET]**: claim came from a search-result summary; the page itself was not fetched or the fetch failed (403/404). Lower confidence.
- **[VENDOR]**: third-party vendor marketing selling an add-on. Treat as opinion, not independent fact.
- Information dated before ~2023 is flagged **(possibly outdated)**.

---

## 1. Odoo POS: client tech, offline mode, hardware integration, known offline limits

### Takeaway
Odoo POS is a browser web app. Odoo 18 ships an IndexedDB wrapper in the POS frontend, so orders are kept locally and pushed to the server when the connection comes back. Officially, Odoo claims only that it works "even if you are temporarily offline": it is short-outage tolerance, not a full offline-first design. For hardware there are two paths: Epson ePOS network printers called directly from the browser, or an "IoT system" (IoT Box, or a Windows virtual IoT program) that bridges USB/ESC-POS printers, scales, displays and payment terminals.

### Cited Findings
**Client and offline storage**
- Official docs: "The app works on any device with a web browser, even if you are temporarily offline." The same page says "the session can only be opened once on the same browser." It does not explain how orders are stored or synced. — [Odoo 18 POS docs](https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale.html) [OPENED]
- The Odoo 18.0 source tree has `addons/point_of_sale/static/src/app/models/utils/indexed_db.js` next to `order_change.js`, `tax_utils.js` and others. — [GitHub odoo/odoo 18.0 utils dir](https://github.com/odoo/odoo/tree/18.0/addons/point_of_sale/static/src/app/models/utils) [OPENED]
- `indexed_db.js` is a generic IndexedDB wrapper class:
  - Its constructor takes `dbName`, `dbVersion` and `dbStores` as `[id, storeName]` pairs, and each store uses `keyPath: id`.
  - Methods include `create(storeName, arrData)` (uses `put`), `delete(storeName, uuids)`, `readAll(storeName)` (retries up to 5 times) and `reset()` (deletes the DB).
  - Writes skip records that are unchanged, ignoring the `JSONuiState`, `date_order` and `write_date` fields.
  - It reconnects after an `InvalidStateError` with a 3 s delay, and on "Connection to Indexed Database server lost" it shows a reload dialog that mentions "unsaved orders".
  - Records are deleted by `uuids`, which means records carry client-generated UUIDs.
  - — [indexed_db.js raw, Odoo 18.0](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/static/src/app/models/utils/indexed_db.js) [OPENED]
- The client framework (OWL, Odoo's own JS component framework) is mentioned only in a vendor page, which describes "the OWL/JS POS frontend". — [ECOSIRE POS Offline Mode Pro](https://ecosire.com/apps/odoo/pos-offline-mode-pro) [VENDOR][SNIPPET]

**Offline behavior and limitations**
- Cybrosys's Odoo 16/17 guides describe the outage flow:
  - When the connection drops, session data stays in the browser cache, and the backend shows a count of offline orders.
  - After reconnecting, the user clicks the sync icon.
  - If the session was closed while offline, Odoo creates a **"rescue session"** with a new ID for those orders.
  - — [Cybrosys Odoo 16 book: rescue session](https://cybrosys.com/odoo/odoo-books/odoo-book-v16/pos/rescue-session); [Cybrosys Odoo 17 book](https://www.cybrosys.com/odoo/odoo-books/v17/pos/rescue-session/) [SNIPPET]
- A third-party module ("POS Sync Orders", Odoo 16) adds a button to push confirmed orders to the backend without closing the session. This implies stock Odoo 16 batched order upload around session close and sync events. — [apps.odoo.com pos_sync_orders](https://apps.odoo.com/apps/modules/16.0/pos_sync_orders) [SNIPPET] (possibly outdated, v16)
- A vendor selling an offline add-on makes several claims about core Odoo:
  - Native Odoo caches the catalog and tolerates brief drops.
  - On reconnect it pushes orders back "without idempotency or reconciliation".
  - A refresh during a long outage can strand unsynced tickets.
  - Payments that need a live call cannot work offline.
  - Its add-on adds an IndexedDB-persisted queue with idempotency keys and stock reconciliation across registers, for Odoo 17, 18 and 19.

  This is **vendor opinion and is not confirmed by Odoo docs.** — [ECOSIRE POS Offline Mode Pro](https://ecosire.com/apps/odoo/pos-offline-mode-pro) [VENDOR][SNIPPET]

**Hardware: ePOS printers (no IoT box)**
- Set-up: enable "ePos Printer" in the POS settings and enter the printer's IP address.
- Epson Wi-Fi/Ethernet printers that follow the "EPOS SDK JavaScript protocol" work without an IoT system. Supported models include TM-m30 i/ii/iii (marked recommended), TM-m10, TM-T82II-i, TM-T83II-i, TM-T88V-DT, TM-T70-i and TM-P20/P60II/P80.
- These need an IoT system: ESC/POS thermal printers, USB-only Epson printers, and the TM-T20, TM-T88 and TM-U220 families.
- Bluetooth Epson printers are **not compatible**.
- Separate pages exist for "Secure connection (HTTPS)" and a "Self-signed certificate for ePOS printers". This shows the browser-to-printer HTTPS mixed-content problem is a known pain point.
- — [Odoo 18 ePOS printers](https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/configuration/epos_printers.html) [OPENED]

**Hardware: IoT system**
- An IoT box is a "micro-computer" with the Odoo IoT program preinstalled. There is also a "Windows virtual IoT" program that installs on a Windows PC.
- Windows virtual IoT does not support MRP devices such as cameras and measurement tools.
- Production use requires an IoT box subscription.
- — [Odoo 18 IoT docs](https://www.odoo.com/documentation/18.0/applications/general/iot.html) [OPENED]
- POS devices that connect through IoT:
  - receipt printer, by USB or network;
  - **cash drawer, connected to the printer with an RJ25 cable**, not directly to the IoT system;
  - barcode scanner, which must send Enter after each barcode (keyboard-wedge style);
  - scale;
  - customer display;
  - payment terminal, by a method that depends on the model.
  - — [Odoo 18 POS IoT connection](https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/configuration/pos_iot.html) [OPENED]

### Inferences
- Odoo's design is "web app + local IndexedDB cache + order push to server". The server stays authoritative for stock and accounting, and orders carry client-side UUIDs. That is the same pattern a PWA-based kasir would use.
- The "rescue session" concept shows an operational problem any POS faces: what happens to orders whose shift or session was closed elsewhere while they were offline.
- The cash drawer is kicked by the receipt printer. This is industry-standard ESC/POS behavior: the drawer kick command goes through the printer's RJ11/RJ12 port. A web POS therefore only needs printer access to open the drawer.
- Odoo needs extra hardware or software (IoT box or Windows virtual IoT) for USB ESC/POS printers. This shows that **browsers cannot easily talk to USB/Bluetooth thermal printers**: you need a local bridge, a networked ePOS printer, or WebUSB/WebSerial/WebBluetooth.

### Gaps
- No official Odoo documentation describes the exact sync algorithm, retry or idempotency behavior, or offline duration limits. The source code (the `pos_store` and data-service modules) would need a deeper read.
- The legacy `hw_proxy` (Odoo ≤ 12 PosBox) architecture was not researched. The IoT box being Raspberry Pi based is widely known but **not confirmed** in the docs page I opened.
- The OWL framework claim was not confirmed from an Odoo-owned page in this session.

---

## 2. Loyverse, Square POS, Shopify POS, Lightspeed: platforms and offline behavior and limits

### Takeaway
All four are cloud POS products whose register apps keep selling during outages: they queue sales locally and upload on reconnect. Every one of them disables some features offline (refunds, customer creation, loyalty, gift cards, live stock, reports) and limits or time-boxes offline card payments. They treat offline as a **degraded backup mode, not a first-class mode**. Losing the local queue (signing out, uninstalling, clearing app data) is the main documented data-loss risk.

### Cited Findings
**Loyverse** (Android and iOS apps, linked from the help page footer)
- Works offline: sales are processed and recorded, and shifts can be managed. The app "continues to function for main sales activities." — [Loyverse help: Offline Use](https://help.loyverse.com/help/offline-work-of-pos) [OPENED]
- Offline receipts are stored on the device and labeled "Unsynced". They sync automatically to the Back Office on reconnect. Manual sync fails with "No internet connection". — same [OPENED]
- **Cannot sign out while there are unsynced receipts.** — same [OPENED]
- Disabled offline: refunds (the button is disabled), registering or editing customers, and integrated card terminals. Email receipts are queued.
- **Stock levels and negative-stock alerts are hidden offline.**
- Open tickets can be created but do not sync to other devices until reconnection.
- — same [OPENED]

**Square POS**
- Offline payments are stored in the POS app and upload automatically on reconnect.
- Square recommends uploading within 24 h. Pending payments **expire after 72 h** and "cannot be retrieved or reprocessed".
- Register, Terminal and Handheld have a 72 h upload window from the start of the offline session. Reader (2nd gen) and Stand have a 24 h acceptance window.
- — [Square help: offline mode](https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode) [OPENED]
- The seller sets a per-transaction offline maximum of $1–$50,000. — same [OPENED]
- Not supported offline: Afterpay, Cash App Pay, Square Gift Cards, Tap to Pay on phone, manual card entry, EBT/SNAP, the Invoices and Kiosk apps, and close-of-day reporting. Loyalty points must be accrued manually after upload. — same [OPENED]
- Data-loss rule: "Pending offline payments will be permanently lost and the funds won't be captured" if the user signs out, deletes the app, switches modes or locations, or factory resets. Restart and power-off are OK. — same [OPENED]
- There are no decline notifications while offline. The merchant bears the risk of declined, expired or disputed offline payments, and offline payments cannot be refunded until they upload. — same [OPENED]
- Square publishes a general idempotency pattern:
  - The same `CreatePayment` request with the same idempotency key is treated as a duplicate and not charged twice.
  - Reusing a key with different parameters returns an error.
  - Square recommends UUIDs (e.g. `crypto.randomUUID`).
  - — [Square docs: idempotency](https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency) [SNIPPET]
- A developer forum thread reports duplicate payments on slow networks or browser refreshes even with keys in place, and attributes it to how keys were generated or stored and how retries were timed. — [Square dev forum thread](https://developer.squareup.com/forums/t/idempotency-issue-causing-duplicate-payment-attempts-through-the-square-payments-api-integration/27006) [SNIPPET]
- Square open-sourced **Tape**:
  - Described as "a lightning fast, transactional, file-based FIFO for Android and Java" (© 2012, Apache-2.0).
  - Adds and removes are atomic, and writes are synchronous to disk.
  - It warns that atomic-segment-write file systems are needed, and that a power loss on conventional file systems can corrupt the file.
  - The repo was **archived 25 Oct 2024**.
  - The README does not say it was built for offline payment queueing.
  - — [github.com/square/tape](https://github.com/square/tape) [OPENED] **(possibly outdated)**

**Shopify POS**
- Cash and manual payments work through "offline checkout" without enabling offline payments. Card offline payments need several things:
  - POS app 9.14.0+;
  - a compatible reader (Verifone Victa, POS Go, POS Terminal, Tap & Chip, Chipper 2X BT, Wisepad 3, Chip & Swipe);
  - a staff permission;
  - the admin setting turned on.
  - — [Shopify help: offline payments](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-payments) [OPENED]
- Limits:
  - a **device daily limit** (total of offline card payments per device);
  - a **per-transaction limit**;
  - no hard time limit, but Shopify recommends reconnecting within 24 h.
  - Not supported offline: swipe, Tap to Pay on phone, manual entry (MOTO), Interac, eftpos, and all offline payments in France.
  - — same [OPENED]
- On reconnect, payments process automatically and orders sync to the admin. Badges move from "Payment pending" to "Paid" or "Card declined". POS Terminal needs the local Wi-Fi to stay up: "Don't restart the internet router while offline." — same [OPENED]
- Client platform: Shopify rebuilt POS in **React Native** (announced at Unite 2019), and in 2020 said new mobile apps would be React Native. — [thestack.technology](https://www.thestack.technology/shopify-app-rewrite-back-to-native/); [mjtsai.com](https://mjtsai.com/blog/wp-json/wp/v2/posts/38067); [Shopify Engineering: migrating largest app to RN](https://shopify.engineering/migrating-our-largest-mobile-app-to-react-native) [SNIPPET] (possibly outdated)
- In 2026 Shopify reportedly announced "Native is now the future of mobile at Shopify" and rebuilt the Shop app natively. **No source confirms whether POS is included.** — [Better Stack summary](https://betterstack.com/community/guides/ai/shopify-react-native-to-native/); [The New Stack](https://thenewstack.io/shopify-native-ai-agents) [SNIPPET]

**Lightspeed Retail (X-Series)** (the fetch returned 403, so all of these are search snippets)
- The Retail POS app enters offline mode after the connection has been down for more than 2 minutes. Lightspeed describes it as a backup for disruptions, not a complete offline selling solution.
- It **won't run offline unless an initial sync has completed**, and offline mode is unavailable if the user wasn't logged in before the drop.
- — [Lightspeed X-Series support](https://x-series-support.lightspeedhq.com/hc/articles/25534272395163) [SNIPPET]
- Offline card payments only work on the Smart Terminal (WisePOS E) and are labeled beta. They are not linked to sales records and do not affect inventory. Failures show as "Offline declined". — [Lightspeed X-Series support](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533879657115-What-are-the-reasons-that-Retail-POS-X-Series-would-go-offline) [SNIPPET]
- Lightspeed's O-Series (an Australian-hosted product) recommends a maximum of 7 days offline. — [o-series support](https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329361292571) [SNIPPET]

**Toast** (restaurant, but architecturally relevant)
- "Offline mode with local sync": one wired-Ethernet Toast device is auto-assigned as the **local hub**. It relays updates between devices on the LAN and up to the cloud. There can be only one hub, and devices on other subnets cannot share data. — [Toast platform guide: offline mode with local sync](https://doc.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html) [OPENED]
- Offline payments: cards must be swiped (no EMV). Gift cards, rewards, house accounts and customer credits are unavailable, and so are logging in and out, resync and reports. Toast warns that uninstalling, clearing the cache or data, or logging out "can permanently erase stored data and payments". — same [OPENED]
- Toast gave a Droidcon Boston 2019 talk, "Working Offline: Data Sync Patterns at Toast", covering on-device DBs, secure payment storage, device-to-device communication and **event sourcing**. — [Pluralsight listing](https://pluralsight.com/courses/droidcon-boston-2019-session-26) [SNIPPET] (possibly outdated)

### Inferences
- The common pattern is "native or RN app + on-device store + upload queue". The server is authoritative for catalog, customers and stock, and the client is authoritative for completed sales.
- Features that need a global view (stock levels, refunds against server records, customer registration, loyalty balances) are **disabled offline** rather than reconciled. That is the cheapest way to avoid conflicts.
- The "can't sign out or clear data with an unsynced queue" guard (Loyverse, Square, Toast) is a must-have UX rule for the kasir app.
- Square's 72 h and Shopify's 24 h guidance exist because of card-network authorization risk. For a cash- and QRIS-based toko sembako, the offline time limit matters much less for cash. QRIS dynamic payment does need connectivity (not verified in this research).

### Gaps
- Official statements on the Square POS client stack (native iOS/Android) and its local DB were not found in this session.
- Lightspeed X-Series client platform (iPad app vs browser) was not confirmed because the fetch was blocked (403).
- Loyverse's client stack and engineering details were not found.

---

## 3. Indonesian POS products: Moka, Majoo, Pawoon, Olsera, Qasir, iSeller

### Takeaway
Indonesian SaaS POS products are mostly **Android-first, some with iOS and Windows apps**, plus a web back office. Several (Moka, Pawoon, Majoo) claim offline transaction capture with auto-sync on reconnect, but no official technical documentation of the sync mechanics was found. Printing is overwhelmingly **Bluetooth 58 mm thermal printers**, plus LAN/Wi-Fi printers and Android all-in-ones with built-in printers (e.g. the Olsera + iMin bundle). Hard engineering facts (languages, DBs) are scarce. The only stack signal found is old Moka job postings (Rails backend, Java Android).

### Cited Findings
**Moka POS** (GoTo)
- It runs on Android and iOS tablets and phones and in a web browser, and is cloud-based. The article says offline mode keeps working on unstable connections and syncs to Moka's cloud on reconnect, and it mentions an "Offline Sync" feature for bills.
- These need connectivity: GoPay, OVO and LinkAja payments, GoFood integration, and real-time reports.
- The article contradicts itself by also saying Moka "depends fully on internet" for most core functions.
- It says Moka is now part of GoTo Group. It was published 8 Jul 2026 and updated 11 Aug 2026, by **HashMicro, a competing vendor**.
- — [HashMicro Moka review](https://www.hashmicro.com/id/blog/review-aplikasi-moka-pos/) [OPENED] (secondary, competitor)
- Stack signals (undated):
  - AngelList postings for Moka list a Ruby on Rails full-stack role (React a plus) and Android roles requiring Java. — [AngelList Moka full-stack](https://angel.co/jobs/198518-software-engineer-web-full-stack); [AngelList Moka Android](https://angel.co/jobs/349352-senior-software-engineer-android) [SNIPPET] (likely pre-2021, possibly outdated)
  - A LinkedIn profile describes the Moka merchant-platform squad as about 20 people across mobile, web, backend and QA. — [LinkedIn](https://id.linkedin.com/in/tek-yin-kwee) [SNIPPET]
- Bluetooth 58 mm printers (e.g. iWare C58BT) are marketed on Tokopedia as "support Moka POS". — [Tokopedia listing](https://www.tokopedia.com/barcodiaindo/printer-bluetooth-c58bt-c58xsii-support-moka-pos-printer-bluetooth-kasir-printer-iware-bluetooth-roll-struk-1732300811757520195) [SNIPPET]

**Majoo**
- Platforms:
  - Android (Google Play): small businesses are recommended Android 5, 3 GB RAM and 16 GB storage, while plan specs require Android 7+.
  - iOS: the FAQ says iOS 11, plan specs say iOS 13.
  - Windows: the FAQ says Win 8 64-bit, 4 GB RAM and 256 GB storage; plan specs say Win 10 build 17763+.
  - macOS: plan specs list a MacBook M1.
  - Web dashboard: dashboard.majoo.id.
  - The FAQ and plan specs are internally inconsistent.
  - — [Majoo FAQ](https://majoo.id/faq) [OPENED]
- Printers: "all thermal printers" are claimed supported over wireless/Bluetooth or LAN, with Bluetooth range ≤10 m. Plan specs require Bluetooth 4.0, and separate kitchen and cashier printers are recommended. Barcode scanners "any type", cash drawer optional, Android EDC listed, and an Android desktop POS (15", 4 GB) listed for the higher tiers. — same [OPENED]
- Majoo recommends ISP internet of at least 10 Mbps. The FAQ does **not** describe offline mode. — same [OPENED]
- Third-party listicles claim Majoo works without internet and auto-sends transactions when back online. — [KitaLulus](https://www.kitalulus.com/blog/bisnis/aplikasi-kasir-gratis/) [SNIPPET] (not confirmed by Majoo)

**Pawoon**
- Its App Store listing claims the app works online and offline, with offline transactions stored in the app and moved to the system after reconnecting. — [App Store Pawoon POS](https://apps.apple.com/id/app/pawoon-pos/id1546031246) [SNIPPET] (direct fetch returned 404)
- A 2019 article describes Pawoon as Android-based and integrated with GO-PAY. — [Bisnis.com 2019](https://teknologi.bisnis.com/read/20190313/266/899110/ribuan-merchant-pawoon-kini-terima-transaksi-go-pay) [SNIPPET] (possibly outdated)
- CB Insights describes it as a cloud POS running on smartphones and tablets with no dedicated hardware needed. — [CB Insights Pawoon](https://www.cbinsights.com/company/pawoon/alternatives-competitors) [SNIPPET]

**Olsera**
- In August 2022 it partnered with **iMin** for bundled POS hardware:
  - iMin M2 Max: Android 11 Go, 2 GB/16 GB, 8", built-in 58 mm printer;
  - iMin D2 402 desktop: Android 11, 10.1".
  - The article does not mention offline capability.
  - — [industry.co.id, 17 Aug 2022](https://www.industry.co.id/read/111501/kolaborasi-olsera-dan-imin-hadirkan-paket-pos-siap-pakai) [OPENED] (possibly outdated)
- Marketplace and third-party pages claim Olsera runs on Android, iOS and Windows and is cloud-based. No offline-mode statement was found. — [Tokopedia Olsera listing](https://www.tokopedia.com/hardwareolsera/aplikasi-kasir-olserapos-software-kasir-program-kasir) [SNIPPET]

**Qasir**
- Its official tutorial covers connecting a **Bluetooth thermal printer** under Settings, choosing Bluetooth, selecting the device and running a test print. — [Qasir tutorial: receipt printer](https://www.qasir.id/tutorial/connecting-qasir-with-receipt-printer) [SNIPPET]
- No source found on Qasir's offline capability.

**iSeller**
- A business profile says it is compatible with Android and iPad. Windows support and offline mode were not confirmed. — [Dealroom iSeller](https://app.dealroom.co/companies/iseller) [SNIPPET]

**Local offline-first comparators**
- KasirCepat is described as offline-first for small shops and warung. It runs on Android, Windows and Linux, and multi-device sync is a paid "Pro" feature over **local Wi-Fi**. — [SourceForge kasir-cepat](https://sourceforge.net/projects/kasir-cepat/) [SNIPPET]
- An academic paper on an Android kasir app ("Excash") used SQFLite offline storage with a Bluetooth thermal printer (2025). — [ISAS proceeding](https://proceeding.isas.or.id/index.php/sentrinov/article/view/1714) [SNIPPET]

### Inferences
- The Indonesian market baseline is: an Android app (tablet or phone or Android all-in-one) + a Bluetooth 58 mm ESC/POS printer + a cloud back office/dashboard + "offline capture, sync later". A Windows app is a secondary option (Majoo, Olsera).
- Android all-in-ones (Sunmi, iMin) with built-in 58/80 mm printers are a common hardware target. They usually expose the printer through a vendor SDK/AIDL service rather than plain Bluetooth. This is general knowledge and **not verified in this session**.
- Digital wallet and QRIS payments and marketplace integrations are the features consistently listed as needing internet.
- No Indonesian vendor publishes how conflicts or stock are handled offline. Assume they follow the Loyverse model: sales are append-only and pushed later, and stock is recomputed server-side.

### Gaps
- No official help-center pages for Moka, Pawoon, Olsera, Qasir or iSeller describing offline limits were successfully opened. help.mokapos.com did not surface in search.
- No current (2024–2026) job postings or engineering blogs for Moka, Majoo, Pawoon, Olsera, Qasir or iSeller were found. Backend and client languages are unknown apart from old Moka postings.
- Sunmi/iMin compatibility for Moka, Majoo, Pawoon, Qasir and iSeller was not confirmed from vendor sources.

---

## 4. Open-source POS: stack, architecture, offline, printing

### Takeaway
Open-source POS products fall into two families:
- **Server web apps**: NexoPOS (Laravel + Vue), OSPOS (CodeIgniter 4 + Bootstrap), and POS Awesome on Frappe/ERPNext (Vue + Python). These are online-only by default; offline support appears only in newer forks or add-ons, built on IndexedDB and replay queues.
- **Java desktop apps**: uniCenta oPOS and Floreant. These run against an **embedded local Apache Derby DB** and switch to MySQL or PostgreSQL for multi-terminal setups. They are "offline" by construction because the database is local.

Web-based products solve printing with a local helper (Nexo Print Server, QZ Tray) or the browser print dialog.

### Cited Findings
- **NexoPOS**:
  - Stack: Laravel (PHP 8.2+), Vue, Vite and Tailwind.
  - Database: MariaDB 10.11 / MySQL 8.4 when self-hosted; the **Windows bundle uses SQLite**.
  - Deployment: Cloud, self-hosted, or a local Windows server that "securely connects additional computers on the same local network".
  - Offline mode is not documented.
  - Printing: **Nexo Print Server** provides "direct Windows printing for ESC/POS-compatible thermal printers", with an NPS Adapter module.
  - License: GPL-3.0. Docs reference core 6.2.x.
  - — [github.com/Blair2004/NexoPOS](https://github.com/Blair2004/NexoPOS) [OPENED]
- **Open Source Point of Sale (OSPOS)**:
  - Stack: PHP ≥ 8.2, CodeIgniter 4 (the repo still carries a `codeigniter3` tag, which is inconsistent), MySQL/MariaDB, and Bootstrap 3 + Bootswatch.
  - Deployment: Docker, including an nginx compose file.
  - No offline mode mentioned. Receipts are printed or emailed, with a hardware wiki page.
  - License: MIT, with a mandatory visible-footer clause. Latest version 3.4.
  - — [github.com/opensourcepos/opensourcepos](https://github.com/opensourcepos/opensourcepos) [OPENED]
- **POS Awesome** (original):
  - Vue + Vuetify on Frappe/ERPNext, supporting **ERPNext v14**.
  - Invoice submission is enqueued after the receipt prints. No offline mode is documented.
  - License: GPL-3.0. The repo surfaced under `ucraft-com`, while the README points to `yrestom`.
  - — [github.com/yrestom/POS-Awesome](https://github.com/yrestom/POS-Awesome) [OPENED]
- **POS Awesome V15 fork** (defendicon):
  - Stack: Vue 3 Composition API + Vuetify + Pinia, migrated to TypeScript; ERPNext/Frappe v15 and v16.
  - Offline: invoices, customers, payments and cash movements are created offline and synced by a **background replay**. The README says "**Request IDs make replays duplicate-safe**". Failed offline submissions are saved as **Drafts**. Item exchanges cannot go through the offline queue.
  - Stock: the option "Allow Offline Sale Without Stock Verification" only skips local blocking, and **server-side stock validation still runs at sync**.
  - Storage: the catalog uses IndexedDB with server fallback, plus optional localStorage caching.
  - Printing: **QZ Tray** raw ESC/POS (thermal) and ZPL/EPL (labels), with a browser print fallback.
  - License: GPL-3.0.
  - — [github.com/defendicon/POS-Awesome-V15](https://github.com/defendicon/POS-Awesome-V15) [OPENED]
- The community asked for PWA/offline support for POS Awesome V15 and maintainers asked for help, so offline was a work in progress at that time. — [Frappe forum: PWA offline request](https://discuss.frappe.io/t/add-offline-mode-progressive-web-app-pwa-support-for-pos-awesome/147391); [Frappe forum: offline sync v15?](https://discuss.frappe.io/t/does-pos-awesome-support-offline-sync-erpnext-v15/146049) [SNIPPET]
- **uniCenta oPOS**:
  - A Java touchscreen POS whose install includes an **embedded Apache Derby** database.
  - It is multi-terminal and multi-location, supporting Derby Client/Server, MySQL, HSQLDB, PostgreSQL and Oracle.
  - — [OSDN uniCenta project](https://osdn.net/projects/sfnet_unicentaopos) [SNIPPET] (possibly outdated; project activity unclear)
- **Floreant POS**:
  - Java, platform independent, restaurant-oriented.
  - Stack: Hibernate, Apache Derby, Ant, JavaPOS and JasperReports.
  - Can connect to PostgreSQL or MySQL for multi-terminal setups.
  - — [LinuxLinks Floreant](https://www.linuxlinks.com/floreantpos/) [SNIPPET] (possibly outdated)
- A 2026 comparison table lists uniCenta and Floreant as "Java + MySQL". This conflicts with the project sources, which say Derby is the embedded default. — [pistack.xyz 2026 comparison](https://www.pistack.xyz/posts/2026-06-18-self-hosted-restaurant-pos-ospos-floreant-unicenta/) [SNIPPET]

### Inferences
- For a single-store toko sembako, the Java-desktop pattern ("local embedded DB on the till, optional central DB") is the simplest truly-offline design. The modern equivalents are Electron/Tauri or Android with SQLite.
- Web POS products need a local print bridge (QZ Tray, Nexo Print Server, Odoo IoT) to do raw ESC/POS and drawer kicks without the browser dialog. This is a key architectural cost of a pure-web kasir.
- The POS Awesome V15 design is the clearest open reference for idempotent replay:
  - client request IDs;
  - drafts on failure;
  - server re-validates stock;
  - offline-blocked operations (exchanges) carved out.

### Gaps
- No OSS project's sync code was read in depth; the claims come from READMEs.
- Medusa POS was not researched.
- Current maintenance status of uniCenta and Floreant was not verified.

---

## 5. Common patterns: local DB + background sync? Conflict resolution approaches

### Takeaway
Yes. Every offline-capable product examined keeps a **local store on the terminal**: IndexedDB (Odoo, POS Awesome V15), device storage (Loyverse, Square, Shopify, Toast) or an embedded SQL DB (uniCenta, Floreant, NexoPOS-Windows SQLite). Each also runs a **queue that uploads completed sales when connectivity returns**.

The conflict strategy documented in practice is:
- **append-only sales**, idempotent via client IDs;
- a **server-authoritative** catalog, customers and stock, with stock re-validated or recomputed server-side;
- **disabling** operations that would conflict (refunds, customer edits, stock views, gift cards).

Last-write-wins is not documented by any of the products examined. Toast has talked publicly about event sourcing.

### Cited Findings
- Local persistence plus upload on reconnect is documented by Loyverse ([help](https://help.loyverse.com/help/offline-work-of-pos)), Square ([help](https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode)), Shopify ([help](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-payments)) and Toast ([guide](https://doc.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html)). [OPENED]
- Odoo 18 has an IndexedDB wrapper that keys records by `id`/`uuid` and warns about "unsaved orders". — [indexed_db.js](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/static/src/app/models/utils/indexed_db.js) [OPENED]
- Idempotent replay via request IDs, with the server re-validating stock at sync. — [POS-Awesome-V15](https://github.com/defendicon/POS-Awesome-V15) [OPENED]
- Disabling conflicting features offline:
  - Loyverse: refunds, customer edits and stock view disabled ([help](https://help.loyverse.com/help/offline-work-of-pos)) [OPENED].
  - Toast: gift cards, rewards, house accounts and resync unavailable ([guide](https://doc.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html)) [OPENED].
  - Square: gift cards and loyalty unavailable ([help](https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode)) [OPENED].
- Multi-terminal-while-offline is handled by a **LAN hub**: Toast uses one hub device over wired Ethernet ([guide](https://doc.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html)) [OPENED]; KasirCepat uses local Wi-Fi sync ([SourceForge](https://sourceforge.net/projects/kasir-cepat/)) [SNIPPET]. Without a hub, Loyverse open tickets do not reach other devices until reconnection ([help](https://help.loyverse.com/help/offline-work-of-pos)) [OPENED].
- Toast engineering presented "Data Sync Patterns" including event sourcing and on-device databases. — [Pluralsight Droidcon Boston 2019](https://pluralsight.com/courses/droidcon-boston-2019-session-26) [SNIPPET] (possibly outdated)
- Stripe-style idempotency: Square's same key + same params returns the original result, and the same key + different params returns an error. — [Square idempotency docs](https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency) [SNIPPET]

### Inferences
- The recommended pattern for a single-store kasir:
  - The local DB is the source of truth for **sales events**: an immutable sale + line items + payment, keyed by a client UUID or ULID.
  - The server, or the back-office side, is authoritative for **master data** (items, prices).
  - **Stock = opening stock + Σ(movement events)** is computed rather than stored as a mutable counter synced from many devices. This avoids last-write-wins stock drift.
- In a single-store, single-terminal deployment, most conflict problems disappear. The remaining risks are:
  - duplicate upload, solved with idempotency keys and a unique constraint server-side;
  - lost local queue, solved by blocking sign-out or clear-data and by backups;
  - price changes made in the back office while the till is offline, solved by recording the price on the sale line.

### Gaps
- No published conflict-resolution algorithm (CRDT, vector clocks, etc.) from a major POS vendor was found. Vendors document UX limits rather than algorithms.

---

## 6. Post-mortems and engineering write-ups on POS offline sync problems

### Takeaway
Public, primary-source post-mortems on POS offline sync failures (duplicate transactions, stock drift) are **rare**. What exists is:
- vendor help-center warnings about data loss and declines;
- a Square developer-forum thread on duplicates despite idempotency keys;
- vendor marketing for offline add-ons that describes duplicate and oversell problems in core products;
- Square's archived Tape library's warning about power-loss corruption.

No engineering blog post-mortem from Square, Shopify, Toast or GoTo/Moka on this topic was found.

### Cited Findings
- Data-loss failure modes are documented by the vendors themselves. Square: "Pending offline payments will be permanently lost" if signed out, app deleted, mode switched or factory reset ([Square help](https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode)) [OPENED]. Toast: uninstalling, clearing cache or data, or logging out "can permanently erase stored data and payments" ([Toast guide](https://doc.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html)) [OPENED].
- Decline risk on offline card payments, discovered only after reconnecting: [Square](https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode), [Shopify](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-payments) [OPENED]. Lightspeed reports these as "Offline declined" ([Lightspeed](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533879657115-What-are-the-reasons-that-Retail-POS-X-Series-would-go-offline)) [SNIPPET].
- Duplicate payments on slow networks or refreshes even with idempotency keys, attributed to key generation/storage and retry timing. — [Square developer forum](https://developer.squareup.com/forums/t/idempotency-issue-causing-duplicate-payment-attempts-through-the-square-payments-api-integration/27006) [SNIPPET]
- A durable-queue caveat: Tape is atomic only on file systems with atomic segment writes, and "power loss mid-write can corrupt the file" on conventional file systems. — [square/tape](https://github.com/square/tape) [OPENED]
- Odoo's IndexedDB wrapper handles "Connection to Indexed Database server lost" by prompting a reload. This shows that browser storage connections can drop in practice. — [indexed_db.js](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/static/src/app/models/utils/indexed_db.js) [OPENED]
- Vendor add-on pages for Odoo, Shopify, Magento and ERPNext all market the same fixes:
  - client-generated idempotency keys on queued sales;
  - ordered replay;
  - oversell (two registers selling the last unit offline) **flagged for admin review rather than overwritten**.

  This implicitly claims these are gaps in the core products. — [ECOSIRE Odoo](https://ecosire.com/apps/odoo/pos-offline-mode-pro), [ECOSIRE Magento](https://ecosire.com/apps/magento-2/magento-2-offline-pos), [ECOSIRE ERPNext](https://ecosire.com/fr/apps/erpnext/erpnext-offline-pos) [VENDOR][SNIPPET]

### Inferences
- Lessons to carry into the kasir design:
  1. Generate an idempotency key **once per logical sale, persist it with the sale before any network call**, and reuse it on every retry. The server enforces uniqueness.
  2. Use a storage engine with real transactional durability (SQLite in WAL mode, or IndexedDB transactions) rather than ad-hoc files.
  3. Block destructive actions (logout, reset, reinstall prompts) while the queue is non-empty.
  4. Treat oversell as a reportable exception, not something to prevent offline. A sembako shop would rather sell and fix stock later.
  5. Show a visible "unsynced count".

### Gaps
- No primary post-mortem (incident write-up) from any major POS vendor about duplicate transactions or stock drift was found.
- The Toast Droidcon 2019 talk content was not accessible beyond its abstract.
- No Indonesian (GoTo/Gojek tech blog, Majoo, Pawoon) engineering write-ups on POS sync were found.

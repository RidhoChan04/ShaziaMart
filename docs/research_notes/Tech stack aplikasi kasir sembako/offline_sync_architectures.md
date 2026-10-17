# Offline-capable architectures and sync technologies for a grocery POS (kasir sembako)

Research date: 2026-10-15. Context: 1 store, 1 cashier now, possible multi-branch within about 1 year; developer knows Go and React; hosting must start at Rp0.

Source-quality legend:
- **[opened]**: page fetched and read.
- **[snippet]**: claim taken only from a search-result summary. The page was NOT opened, so verify it before relying on the claim.

---

## Q1. Sync engines in 2026: maturity, databases, self-host vs hosted, free tier, Go/Windows support, conflict handling and server-side validation

### Takeaway
PowerSync is the most POS-relevant sync engine alive in 2026:
- It supports Postgres, MySQL, SQL Server and MongoDB.
- It has a free cloud tier and a self-hostable Open Edition.
- Writes go through *your own backend API* (which can be Go) in a blocking FIFO upload queue, so the server stays authoritative for money and stock.

Turso Sync gives Go-native local SQLite with push/pull, but conflicts are "last push wins". That is unsafe for stock counters unless you model data as append-only rows. ElectricSQL does read-path sync only. Zero is GA but explicitly not designed for long offline periods. RxDB works with a custom (Go) HTTP backend. Triplit was effectively acqui-hired by Supabase. Supabase is also acquiring Turso (announced Oct 2026).

### Cited Findings

**PowerSync**
- Pricing:
  - Free: $0/month.
  - Pro: from $49/month.
  - Team: from $599/month.
  - Enterprise: custom.
  - Pro/Team overage: $1/GB synced beyond 30 GB. — [PowerSync pricing](https://www.powersync.com/pricing) [opened]
- Free tier limits — [PowerSync pricing](https://www.powersync.com/pricing) [opened]:
  - 2 GB data synced per month.
  - 500 MB hosted data.
  - Up to 50 peak concurrent clients.
  - Up to 2 service instances.
  - 1 source DB connection per instance.
  - "Free projects are deactivated after 1 week of inactivity." The same page elsewhere says ">2 weeks of inactivity", so the page contradicts itself.
- Self-host: a free, source-available "Open Edition" exists. It is configured by config file, includes Sync Streams and Prometheus metrics, and has no Dashboard. — [PowerSync pricing](https://www.powersync.com/pricing) [opened]
- Source databases: Postgres, MongoDB, MySQL, SQL Server, and Azure DocumentDB (alpha). They are supported on every cloud plan and on self-hosted. — [PowerSync pricing](https://www.powersync.com/pricing) [opened]
- Client SDKs:
  - Listed without a status label: JavaScript Web, React Native/Expo, Node.js, Dart/Flutter, Kotlin, Swift.
  - Beta: Capacitor, **.NET (Windows)**, Rust.
  - Alpha: Tauri.
  - No Go client SDK is listed. — [PowerSync client SDK refs](https://docs.powersync.com/client-sdk-references/introduction) [opened]
- Write path:
  - Client mutations are applied locally and persisted in an upload queue as PUT/PATCH/DELETE ops, grouped per transaction.
  - "The upload queue … is a blocking" FIFO queue. If the backend doesn't acknowledge, the queue stops.
  - "While mutations are present in the upload queue, the client does not advance to a new checkpoint." — [PowerSync consistency](https://docs.powersync.com/architecture/consistency) [opened]
- Validation is the developer's responsibility in "your backend API": "There is no single correct choice for handling write failures."
  - Options: discard the mutation, discard the transaction, record the failure for user resolution, or move it to a backend queue for retry.
  - Consistency model: "causal+ consistency." — [PowerSync consistency](https://docs.powersync.com/architecture/consistency) [opened]

**ElectricSQL** (docs now redirect from electric-sql.com to electric.ax)
- "Electric does not do write-path sync." Writes go through your own API. Documented patterns:
  1. Online writes.
  2. Optimistic state (`useOptimistic`).
  3. Shared persistent optimistic state.
  4. Through-the-database sync with PGlite plus shadow tables, triggers and a change log.
  - The docs say conflicts are "extremely rare and can be mitigated well by strategies like presence." — [Electric writes guide](https://electric.ax/docs/guides/writes) [opened]
- Electric Cloud pricing — [Electric pricing](https://electric.ax/pricing) [opened]:
  - PAYG: $0 monthly fee, $1 per 1M writes, $0.10 per GB-month; usage under $5/month is waived; reads, egress and fan-out are "ALWAYS FREE".
  - Pro: $249/month.
  - Scale: $1,999/month.
  - The "Postgres Sync" add-on costs +$2 per 1M writes on PAYG.
  - The repository is Apache 2.0.
  - The page states no GA or version status.

**Turso / libSQL**
- Embedded Replicas ("fully supported in production"): reads are local. "Writes are sent to the remote primary database … NOT written to the local file first." Local writes are possible with `offline: true`. — [Turso embedded replicas](https://docs.turso.tech/features/embedded-replicas/introduction) [opened]
- For new projects that need sync, Turso recommends **Turso Sync**, which is based on logical CDC with "local-first writes, explicit push()/pull()". — [Turso embedded replicas](https://docs.turso.tech/features/embedded-replicas/introduction) [opened]
- Turso Sync — [Turso Sync docs](https://docs.turso.tech/sync) [opened]:
  - SDKs: TypeScript (`@tursodatabase/sync`), Python, and **Go (`turso.tech/database/tursogo`)**.
  - Conflict resolution is "last push wins".
  - "All changes are safely stored in the local database file until they can be synced."
  - The remote must be reachable on the first connect unless `bootstrap_if_empty=false`.
  - Committed write transactions that overlap open write transactions "MAY be delayed".
  - The page does not say beta or GA, and does not describe server-side validation.
- A .NET `TursoSync` 1.4.0 NuGet package with `Push()`/`Pull()` exists, and pyturso is labeled beta. — [NuGet TursoSync](https://www.nuget.org/packages/TursoSync) [snippet]
- Turso Cloud pricing — [Turso pricing](https://turso.tech/pricing) [opened]:
  - Free tier: $0, 100 DBs, 5 GB storage, 500M rows read/month, 10M rows written/month, 3 GB monthly syncs.
  - Developer plan: $4.99/month (9 GB, 25M writes, 10 GB syncs).
- **Supabase is acquiring Turso** (announced 2026-10-02, alongside a $150M round). "The Turso platform will continue operations, with a clear graduation path into the rest of the Supabase ecosystem." libSQL is not mentioned. — [Webull/PR Newswire repost](https://www.webull.com/news/15678771187762176) [opened; aggregator of a press release]

**Rocicorp Zero / Replicache**
- "As of March 2026, Zero is generally available and fully-supported."
  - 2026 plans: Cloud Zero to full public availability, column permissions.
  - The page states no prices. — [Zero project status](https://zero.rocicorp.dev/docs/status.mdx.md) [opened]
- Offline: Zero is not designed for long periods offline.
  - Reads are allowed while `disconnected`, but writes are not.
  - Writes are queued only briefly while in the `connecting` state. — [Zero connection docs](https://zero.rocicorp.dev/docs/connection) [snippet]
- Mutators run optimistically on the client, then the server push endpoint runs the server-side mutator in a transaction against your DB, so the server is authoritative. — [Zero mutators](https://zero.rocicorp.dev/docs/mutators.md) [snippet]

**RxDB**
- HTTP replication works with any backend language through custom pull/push handlers:
  - The server defines the checkpoint (for example, `updatedAt` + `id`).
  - Push sends `newDocumentState` + `assumedMasterState`.
  - The server returns conflicting docs with the real master state, so **the server can reject writes**.
  - An SSE stream with `RESYNC` handles realtime updates. — [RxDB HTTP replication](https://rxdb.info/replication-http.html) [opened]
- RxDB v17 was released in March 2026. The core is open source and paid Pro is reported at about €1,300/year. — [buildmvpfast guide](https://www.buildmvpfast.com/blog/local-first-software-saas-rxdb-pouchdb-sync-2026) [snippet; third-party]

**PouchDB / CouchDB**
- One 2026 guide recommends migrating away from PouchDB unless you are tied to CouchDB, because revision-tree overhead hurts performance on larger datasets. — [buildmvpfast guide](https://www.buildmvpfast.com/blog/local-first-software-saas-rxdb-pouchdb-sync-2026) [snippet; third-party]

**InstantDB**
- Offline support is described as cache-like rather than a full database sync, with a Clojure backend and Datalog-style queries. — [RxDB's InstantDB-alternative article](https://rxdb.info/articles/alternatives/instantdb-alternative.html) [snippet; competitor-authored]

**Triplit**
- Supabase announced "Triplit joins Supabase" (Oct 2025) as an acqui-hire. Supabase will not integrate Triplit directly, and the code stays open source. — [Supabase blog](https://supabase.com/blog/triplit-joins-supabase) [snippet]

**General local-first caveats (Ink & Switch)**
- The seven ideals are: no spinners; not trapped on one device; network optional; seamless collaboration; the Long Now; security and privacy by default; ultimate ownership and control.
- A CRDT "cannot automatically resolve … when multiple users concurrently update the same property of the same object."
- "CRDTs accumulate a large change history."
- It is "not yet advisable to replace a proven product" with an experimental CRDT library. — [Ink & Switch, Local-first software](https://www.inkandswitch.com/essay/local-first/) [opened]

### Inferences
- **Go backend fit:**
  - PowerSync, Zero, RxDB and Electric all route writes through a developer-owned HTTP endpoint, so a Go server can be the authoritative validator.
  - Only Turso Sync offers a *Go client* (an embedded local DB in a Go binary).
  - PowerSync's client is JS/.NET/etc., not Go.
- **Money and stock:**
  - Engines whose server re-validates each mutation (PowerSync's upload queue to your API, Zero's server mutators, RxDB's push handler) are safe for invariants.
  - Turso Sync's "last push wins" over row state is unsafe for a mutable `stock_qty` column. It would be acceptable only if sales and stock movements are insert-only rows with UUID keys.
- **Not a fit for an offline cashier:**
  - Zero's design (no writes while disconnected) disqualifies it for requirement (a), "keep selling with no internet".
  - Electric needs you to build the write path yourself, so it adds little over a custom outbox for this use case.
- **Rp0 risk:** PowerSync's free tier deactivates after 1–2 weeks of inactivity. That is fine for a store that syncs daily, but you need to know about it.
- **Vendor churn:** Supabase now absorbs both Triplit and Turso. Plan for vendor churn: keep your own schema and event log portable.

### Gaps
- PowerSync: whether the unlabeled SDKs (JS Web, Flutter, etc.) are officially "stable" vs beta was not stated on the SDK page.
- Zero: Cloud Zero prices, self-host requirements, and Replicache's current maintenance status were not confirmed (the status page did not cover them).
- Turso Sync: GA vs beta is not stated. Post-acquisition roadmap for libSQL/Turso Sync is unknown.
- ElectricSQL: GA status and the scope of the "electric.ax" rebrand are not confirmed.
- InstantDB pricing and free tier, CouchDB hosting options, and RxDB storage premium/free split were not verified from primary pages.

---

## Q2. What practitioners recommend for POS data modeling: append-only sales, client UUIDs, idempotency, stock consistency

### Takeaway
The consistent pattern across practitioner sources:
- Every sale/return/payment carries a **client-generated UUID (v4/v7) used as the idempotency key**, enforced by a UNIQUE constraint server-side.
- Each sale is written locally first and marked synced only after server confirmation.
- Inventory is treated as a **ledger of movements/adjustments**, not a single mutable number.
- Offline overselling is allowed and flagged for review rather than blocked.

Primary, authoritative engineering-blog sources were thin. Most evidence is from open-source PRs.

### Cited Findings
- A Flutter POS adds a UUID v4 `client_uuid` to sales, returns, payments and cash-drawer moves:
  - The table has a UNIQUE column, so retries return the original result instead of duplicating it.
  - A pre-check handles concurrent retries. — [BMS PR #2163](https://github.com/wamburamuhere-afk/BMS/pull/2163) [snippet]
- An offline outbox for sale sync stores each sale locally first, with a UUIDv7 idempotency key, and marks it synced only after the server confirms. — [tillflow PR #24](https://github.com/Ahmadkamran73/tillflow/pull/24) [snippet]
- An offline POS sales design uses a separate idempotency table rather than a per-row unique column, because one sale inserts several rows. — [barstock PR #7](https://github.com/CarlosDevSanchez/barstock/pull/7) [snippet]
- Server-side key handling: keys are scoped per user and expire after a TTL. Client errors are cached; on 5xx the key is released so retries can run. — [FindMyStuff PR #8](https://github.com/abhi0303/FindMyStuff/pull/8) [snippet]
- Inventory should be a ledger of adjustments plus physical counts, not one number. Deterministic idempotency keys protect against your own retries. — [Modracx Square POS integration blog](https://www.modracx.com/blog/square-point-of-sale-pos-integration/) [snippet; vendor blog]
- One offline-tolerant cashier spec uses server-wins plus manual review when stock conflicts. — [retailmind issue #46](https://github.com/ZeachDev01/retailmind/issues/46) [snippet]
- The transactional-outbox relay "may publish a message more than once", so consumers must be idempotent, for example by tracking processed message IDs. — [microservices.io Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html) [opened]
- RxDB's conflict model compares `assumedMasterState` to the real master state. This is optimistic concurrency, which a naive "decrement stock" update would trip constantly with multiple terminals. — [RxDB HTTP replication](https://rxdb.info/replication-http.html) [opened]

### Inferences
- **Recommended model for kasir sembako:**
  - `sales` and `sale_items` are immutable, keyed by a client UUIDv7.
  - A `stock_movements` table is append-only (sale, purchase/receiving, adjustment, opname/stock-take, transfer between branches), each row with a UUID and `branch_id`.
  - Current stock = SUM(movements), optionally cached in a projection table that is rebuilt or updated server-side.
  - Append-only inserts with unique UUIDs never conflict, so even "last write wins" engines become safe.
- Store money as integer rupiah (BIGINT), never float. Corrections are new rows (void/refund), never edits.
- Multiple offline terminals can oversell. Accept the sale, let stock go negative or flag it, and surface it in an owner review screen. Do not block the cashier.

### Gaps
- I found no authoritative engineering blog (e.g., Square, Shopify, Toast, Loyverse, Moka/Majoo) describing their offline POS sync internals end to end. The evidence is from OSS PRs and one vendor blog, which were not opened.

---

## Q3. Pitfalls of PWA + IndexedDB / service-worker-only offline for business-critical data

### Takeaway
Browser storage is "best effort" by default and can be evicted under storage pressure (LRU). Safari/WebKit also evicts after inactivity under ITP. web.dev cites a 7-day cap that does not apply to installed PWAs. `navigator.storage.persist()` is granted heuristically, not guaranteed. For a cashier's unsynced sales this is a real durability risk compared with a SQLite file on disk.

### Cited Findings
- Quotas:
  - Chrome: the browser can use up to 80% of total disk and an origin up to 60%; incognito is about 5%.
  - Firefox: up to 50% of free disk, with 2 GB per eTLD+1 group.
  - Safari: "appears to allow about 1GB" (web.dev says it found no official documentation). — [web.dev Storage for the web](https://web.dev/articles/storage-for-the-web) [opened]
- WebKit (Safari 17 / iOS 17): origin quota is up to 60% of disk for browser apps, overall up to 80%, and Safari 17 stopped prompting for more space. — [WebKit: Updates to storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) [opened]
- Best-effort data "can be cleared by the browser without interrupting the user." Chromium and Firefox evict the least-recently-used origin first under pressure. — [web.dev](https://web.dev/articles/storage-for-the-web) [opened]
- Safari applies "a seven-day cap on all writable storage" (IndexedDB, service worker registrations, Cache API) if the user doesn't interact with the site; this "does not apply to installed PWAs." — [web.dev](https://web.dev/articles/storage-for-the-web) [opened]
  - The WebKit post itself only says ITP can evict sites not interacted with "for some time" and does not state 7 days. — [WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/) [opened]
- WebKit grants `navigator.storage.persist()` "based on heuristics" (e.g., whether the site is opened as a Home Screen Web App), with no guarantee. — [WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/) [opened]
- Once an origin is over quota "further attempts to write data will fail". Recommended practices:
  - Catch `QuotaExceededError`.
  - Request persistent storage.
  - Consider the Storage Buckets API for eviction priority. — [web.dev](https://web.dev/articles/storage-for-the-web) [opened]
- In Electric's "shared persistent optimistic state" pattern, pending writes are stored in localStorage. That is a pragmatic but browser-bound store. — [Electric writes guide](https://electric.ax/docs/guides/writes) [opened]

### Inferences
- A PWA cashier on a Windows PC with Chrome and plenty of disk is unlikely to be evicted in practice, but there is no hard guarantee. Clearing browser data, a profile reset, or a browser reinstall loses unsynced sales.
- A local server writing SQLite to disk (Architecture 1), or a native/.NET client with SQLite, removes this class of risk.
- Service-worker-only offline (cache app shell plus queue fetches) has more problems:
  - Background Sync support is uneven.
  - Queued requests are opaque, so you can't query today's sales or stock while offline.
  - You still need IndexedDB for real local reads.
- Owner dashboard on a phone: that is read-only and online, so browser-storage eviction is irrelevant there.

### Gaps
- I did not open MDN's "Storage quotas and eviction criteria" page or the Background Sync API compatibility data. The Safari 7-day figure rests on web.dev only.

---

## Q4. Architecture comparison for the POS (local server, cloud-first PWA, sync engine, hub-and-spoke) and custom outbox vs sync engine for a solo dev

### Takeaway
For one store and one cashier, a Go single binary with embedded SQLite serving a React UI on localhost (Architecture 1) gives the strongest offline guarantee at Rp0. An outbox table written in the same transaction as each sale then pushes events to a free-tier cloud DB for the owner's phone dashboard.

This naturally becomes hub-and-spoke (Architecture 4) when branches are added: each store is a spoke with its own SQLite and outbox, and the cloud is the hub aggregating idempotent events. A sync engine (PowerSync, or Turso Sync for a Go-embedded client) is the main alternative if you want two-way sync of master data (products and prices pushed from HQ) without writing it yourself.

### Cited Findings
- Transactional outbox:
  - Store each message in an outbox table "within the same database transaction" as the business update. A relay publishes it later.
  - Messages are "guaranteed to be sent if and only if the database transaction commits" and keep their order.
  - Relay options: polling publisher or transaction log tailing.
  - Drawback: duplicates are possible, so consumers must be idempotent. — [microservices.io](https://microservices.io/patterns/data/transactional-outbox.html) [opened]
- PowerSync essentially packages this: a local SQLite plus a persisted, ordered upload queue that blocks until your backend acknowledges, plus server-to-client sync via "sync streams". — [PowerSync consistency](https://docs.powersync.com/architecture/consistency) [opened]; [PowerSync pricing](https://www.powersync.com/pricing) [opened]
- Turso Sync gives a Go program a local database file that holds writes offline and syncs with explicit `push()`/`pull()` to Turso Cloud. The free tier includes 3 GB of syncs per month. — [Turso Sync](https://docs.turso.tech/sync) [opened]; [Turso pricing](https://turso.tech/pricing) [opened]
- Electric's full-offline pattern (PGlite plus shadow tables, triggers and a change log) is described as the most complex option, and it "makes rollback context harder to reconstruct". — [Electric writes guide](https://electric.ax/docs/guides/writes) [opened]
- Zero allows no writes while disconnected. — [Zero connection docs](https://zero.rocicorp.dev/docs/connection) [snippet]

### Inferences

**Architecture fit for this POS**

| Architecture | Offline selling (a) | Owner phone dashboard (b) | Rp0 start (c) | Multi-branch (d) | Notes |
|---|---|---|---|---|---|
| 1. Go binary + SQLite on cashier PC, outbox → cloud | Strongest (disk-durable, no browser eviction) | Needs cloud push; dashboard reads the cloud copy | Yes (local only; free cloud tier later) | Becomes hub-and-spoke | Need a Windows service, backups and auto-update; the PC is a single point of failure |
| 2. Cloud Postgres + PWA with IndexedDB queue | Weaker (browser storage best-effort; queued writes opaque) | Native | Yes on free tiers | Native (single central DB) | Easiest multi-branch; offline is the hard part; the cloud free tier is the system of record |
| 3. Local-first sync engine (PowerSync / Turso Sync / RxDB) | Good (local SQLite / IndexedDB) | Via the central DB | Yes (free tiers; PowerSync inactivity pause) | Good (partial sync by branch) | Vendor dependency; PowerSync .NET is beta; Turso is LWW; Zero is not offline-capable |
| 4. Hub-and-spoke (store DB + central aggregator) | Strong | Via the hub | Yes | Designed for it | Fits Architecture 1 plus outbox; master data (products/prices) needs HQ→store downsync |

**Custom outbox vs adopting a sync engine (solo dev)**
- Custom outbox costs:
  - Store → cloud: an outbox table, a Go goroutine relay with backoff, an idempotent cloud `POST /events` (UNIQUE event UUID), and a `last_acked_seq`.
  - HQ → store (products, prices): one more pull endpoint with a cursor/checkpoint, similar to RxDB's checkpoint model.
  - The scope is small because sales and movements are append-only. The hard parts (conflict resolution on mutable rows) are mostly designed away.
- A sync engine earns its keep when many tables are edited on both sides, or when there are many clients (several cashiers, mobile staff apps). For one cashier plus a read-only owner dashboard, its main benefit is less code. The cost is vendor and free-tier dependency, plus a still-beta .NET/Windows SDK for PowerSync.

**Suggested path**
1. Start with Architecture 1, with the schema designed for Architecture 4 from day one:
   - UUIDv7 primary keys and a `branch_id`.
   - Append-only sales and stock movements.
   - An outbox table.
2. Add the cloud relay to a free Postgres (or Turso) when the owner dashboard is needed.
3. Re-evaluate PowerSync only if multiple editable terminals per store appear.

### Gaps
- I found no primary engineering write-up of how real retail chains do store-to-HQ sync (hub-and-spoke). The table above rests on general patterns, not cited case studies.
- No quantitative estimates (hours or LOC) of building a custom outbox vs integrating a sync engine were found. The complexity comparison above is inference.
- Free-tier specifics for central Postgres hosts (Supabase, Neon, etc.) were not researched here; another researcher likely covers them.

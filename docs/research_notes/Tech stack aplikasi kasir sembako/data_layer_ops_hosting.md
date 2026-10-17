# Data layer, backend language, backup, remote access and hosting for a small offline-capable POS (kasir sembako)

Context: 1 cashier, server on the cashier's Windows PC, up to ~20,000 products, owner dashboard on a phone, Rp0 hosting at first, possible later move to cloud Postgres for multiple branches. Research date: 2026-10-15. All "latest version" facts come from pages/APIs fetched on that date.

## 1. SQLite vs PostgreSQL as the local database for a single-terminal POS

### Takeaway
SQLite's official guidance fits this workload: one machine, low write concurrency, data far below 1 TB, and the app server on the same host as the file. Use WAL mode. For a till, choose `synchronous=FULL` rather than NORMAL, because NORMAL in WAL mode can lose the last committed sales if the power fails. PostgreSQL would work, but it adds a separate server to run as a Windows service, plus a major-version upgrade (dump/reload or pg_upgrade) at least every 5 years.

### Cited Findings
- SQLite's framing: "SQLite does not compete with client/server databases. SQLite competes with fopen()." — [sqlite.org/whentouse](https://www.sqlite.org/whentouse.html)
- Concurrency: "SQLite supports an unlimited number of simultaneous readers, but it will only allow one writer at any instant in time… in most cases, a write transaction only takes milliseconds and so multiple writers can simply take turns." — [sqlite.org/whentouse](https://www.sqlite.org/whentouse.html)
- Decision checklist: use client/server when (1) the data is separated from the application by a network, (2) there are many concurrent writers that "cannot queue up and take turns", or (3) the data approaches the terabyte range. Otherwise: "For device-local storage with low writer concurrency and less than a terabyte of content, SQLite is almost always a better solution." If the app server and the database share one machine, "SQLite might still be appropriate even though the end user is another network hop away." — [sqlite.org/whentouse](https://www.sqlite.org/whentouse.html)
- Rule of thumb: "avoid using SQLite in situations where the same database will be accessed directly (without an intervening application server) and simultaneously from many computers over a network"; "file locking logic is buggy in many network filesystem implementations." — [sqlite.org/whentouse](https://www.sqlite.org/whentouse.html)
- Websites with "fewer than 100K hits/day should work fine with SQLite", described as a conservative estimate. — [sqlite.org/whentouse](https://www.sqlite.org/whentouse.html)
- WAL: "readers do not block writers and a writer does not block readers… there can only be one writer at a time." SQLITE_BUSY can still occur in edge cases, such as recovery or an exclusive lock. — [sqlite.org/wal](https://www.sqlite.org/wal.html)
- WAL limits: all processes must be on the same host ("WAL does not work over a network filesystem"). The `-wal` and `-shm` files must stay with the database file. Long-running readers can starve checkpoints and let the WAL grow without bound. The default auto-checkpoint runs at 1000 pages. — [sqlite.org/wal](https://www.sqlite.org/wal.html)
- WAL-reset corruption bug (a race when two or more connections write or checkpoint at the same moment) is fixed in 3.51.3+, with backports to 3.44.6 and 3.50.7. Upgrading is recommended. — [sqlite.org/wal](https://www.sqlite.org/wal.html)
- Durability: "A transaction committed in WAL mode with synchronous=NORMAL might roll back following a power loss or system crash." "With synchronous=FULL in WAL mode, an additional sync operation of the WAL file happens after each transaction commit… helps ensure that transactions are durable across a power loss." In WAL mode, FULL is ACID and EXTRA behaves the same as FULL. — [sqlite.org/pragma#pragma_synchronous](https://www.sqlite.org/pragma.html)
- SQLite also says NORMAL "provides the best balance between performance and safety for most applications running in WAL mode… You lose durability across power lose… but that is not important for most applications." — [sqlite.org/pragma](https://www.sqlite.org/pragma.html)
- `journal_mode=WAL` is persistent across connections. `busy_timeout` sets the busy handler (maximum 2147483647 ms). — [sqlite.org/pragma](https://www.sqlite.org/pragma.html)
- PostgreSQL supports each major version for 5 years. "A dump/reload of the database or use of the pg_upgrade application is required for major upgrades." Minor upgrades only replace binaries and restart. — [postgresql.org/support/versioning](https://www.postgresql.org/support/versioning/)
- Currently supported versions: PG 18 (18.6, EOL 2030-11-14), 17 (EOL 2029-11-08), 16 (2028-11-09), 15 (2027-11-11). PG 14 reaches EOL on 2026-11-12. — [postgresql.org/support/versioning](https://www.postgresql.org/support/versioning/)
- The Windows installer is "certified by EDB" and hosted by EDB, not on the community servers. It bundles the server, pgAdmin and StackBuilder, and is tested on Windows Server-class platforms (PG 18: 2025, 2022). — [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)

### Inferences
- The POS meets every "choose SQLite" criterion: one host, one writer (the Go server), well under 1 GB of data at 20k products. The owner's phone reaches the app server over HTTP and never touches the DB file, which is the "app server on the same machine" case the checklist approves.
- Recommended pragmas: `journal_mode=WAL`, `synchronous=FULL` (a till must not lose committed sales on a blackout, and PLN power cuts are a real risk), `busy_timeout=5000`, `foreign_keys=ON`. The cost of FULL is one extra fsync per commit, which is negligible at cashier transaction rates. Pair it with a UPS if possible.
- Serialize writes through one write connection, or `SetMaxOpenConns(1)` on a dedicated writer pool, to avoid SQLITE_BUSY. Use a separate read pool for dashboard queries.
- PostgreSQL on the cashier PC adds a second service to monitor, a superuser password, a pg_hba config, an EDB installer dependency, and a forced major upgrade on a non-technical shop's PC within 5 years. That operational burden matters more than any performance difference at this scale. The PostgreSQL docs reviewed here don't say this directly.
- Bundle a SQLite build at 3.51.3 or later (or a patched backport) because of the WAL-reset bug.

### Gaps
- The pragma page doesn't state the compile-time default for `synchronous` in WAL mode. It depends on the build. Verify at runtime with `PRAGMA synchronous;`.
- I didn't find an official PostgreSQL or EDB source on how often the Windows service fails or what happens to it after Windows updates. The "operational burden" point is inference.

## 2. Go SQLite drivers in 2026: modernc vs mattn vs ncruces

### Takeaway
All three are actively maintained in 2026. modernc.org/sqlite is pure Go (no CGO), bundles SQLite 3.53.4, and its build enables FTS5 and JSON1 by default (verified in the generator source). It is the easiest choice for Windows builds and cross-compiling. mattn is generally faster but needs CGO and gcc on Windows, and FTS5 requires a build tag. ncruces (Wasm translated to Go) needs no CGO but uses more memory, and FTS5 comes from an opt-in `ext/fts5` package. At POS scale, the speed differences don't matter.

### Cited Findings
- modernc.org/sqlite: v1.60.1 published 2026-09-29 on pkg.go.dev (the page notes a newer version exists). It bundles SQLite 3.53.4 and lists windows/amd64, windows/arm64 and windows/386. — [pkg.go.dev/modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite)
- modernc performance self-reported against native C SQLite: CPU-time ratios of 2.0x (unindexed ORDER BY … LIMIT), 1.9x (GROUP BY aggregate) and 1.3x (correlated subquery). The gap is mostly in CPU-bound work. — [pkg.go.dev/modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite)
- modernc compile options live in modernc.org/libsqlite3 (v1.15.0, 2026-09-28, SQLite 3.53.4). — [pkg.go.dev/modernc.org/libsqlite3](https://pkg.go.dev/modernc.org/libsqlite3)
- **Verified: modernc enables FTS5 and JSON1.** The libsqlite3 `generator.go` passes `-DSQLITE_ENABLE_FTS5`, `-DSQLITE_ENABLE_JSON1`, `-DSQLITE_ENABLE_MATH_FUNCTIONS`, `-DSQLITE_ENABLE_RTREE`, `-DSQLITE_ENABLE_GEOPOLY`, `-DSQLITE_ENABLE_SESSION`, `-DSQLITE_ENABLE_STAT4`, `-DSQLITE_THREADSAFE=1` and others. — [gitlab.com/cznic/libsqlite3 generator.go](https://gitlab.com/cznic/libsqlite3/-/raw/master/generator.go)
- modernc is developed on GitLab (cznic/sqlite) with an official GitHub mirror, modernc-org/sqlite. — [github.com/modernc-org/sqlite](https://github.com/modernc-org/sqlite)
- mattn/go-sqlite3 "requires the `CGO_ENABLED=1` environment variable… and the presence of the `gcc` compiler". On Windows you install a gcc toolchain such as TDM-GCC and add it to PATH. FTS5 needs the `sqlite_fts5` tag (the README example uses `fts5`) and JSON needs `sqlite_json` (example: `json1`). Cross-compiling needs a cross C compiler or xgo. — [github.com/mattn/go-sqlite3](https://github.com/mattn/go-sqlite3)
- mattn latest release: v1.14.52, published 2026-09-05. — [GitHub API releases/latest](https://api.github.com/repos/mattn/go-sqlite3/releases/latest)
- ncruces/go-sqlite3 is cgo-free: "wraps a Wasm build of SQLite, and uses wasm2go to translate it to Go". It replaces the OS layer with a pure-Go VFS. "Because each database connection executes within a Wasm sandboxed environment, memory usage will be higher than alternatives." Every commit is tested on Windows amd64 and arm64. Features include JSON, math functions and online backup. — [github.com/ncruces/go-sqlite3](https://github.com/ncruces/go-sqlite3)
- ncruces latest release: v0.35.6, 2026-09-23. — [GitHub API releases/latest](https://api.github.com/repos/ncruces/go-sqlite3/releases/latest)
- ncruces FTS5 comes from the optional `github.com/ncruces/go-sqlite3/ext/fts5` package ("provides full-text search"). The extensions README describes these as "optional SQLite extensions you can load into your database connections." — [ncruces ext/README.md](https://raw.githubusercontent.com/ncruces/go-sqlite3/main/ext/README.md)
- Independent benchmark (cvilsmeier/go-sqlite-bench, run 2026-03-23, Linux amd64, journal_mode=DELETE, synchronous=FULL; times in ms, lower is better):
  - "Real" (100 users × 20 articles × 20 comments, one transaction per user): insert/query mattn 1586/104, modernc 1759/130, ncruces 1469/129.
  - "Simple" (insert 1M rows in one transaction): insert mattn 1480, modernc 2419, ncruces 2719.
  - "Large" reads (N=200000): mattn 376, ncruces 528, modernc 1094.
  - Author's summary: "We cannot declare a clear winner, it all depends on the use case… SQLite without CGO is possible nowadays." The author also warns: "Do not trust benchmarks, write your own." The benchmark doesn't test Windows. — [go-sqlite-bench README](https://raw.githubusercontent.com/cvilsmeier/go-sqlite-bench/master/README.md)

### Inferences
- For this project, modernc.org/sqlite is the lowest-friction default. `GOOS=windows go build` works from any machine without a C toolchain, produces a single static .exe, includes FTS5 for product-name search, and includes JSON1. Expect roughly 1.2–2x slower CPU-bound queries than native C, which is irrelevant for 20k products. In the "Real" benchmark, a per-transaction insert costs about 17 ms per user batch.
- Choose mattn only if profiling shows a real bottleneck. The price is a gcc/MinGW toolchain in CI and on dev machines.
- ncruces is a credible second pure-Go option (Windows is CI-tested). Its higher per-connection memory and opt-in FTS5 make it slightly less convenient than modernc here.
- Pin the modernc.org/sqlite and modernc.org/libc versions together. The changelog (via search snippet) says downstream modules must pin the same libc version (GitLab issue #177). I could not open the changelog page directly.

### Gaps
- No Windows-specific benchmark for any driver was found.
- I couldn't open the modernc CHANGELOG (GitLab page rendered empty). The libc-pinning note comes from a search snippet only.
- The ncruces README doesn't say whether FTS5 is compiled into the default Wasm build or only exposed through `ext/fts5`. Test it with `SELECT fts5(...)` or `PRAGMA compile_options`.

## 3. sqlc and goose status (SQLite and PostgreSQL)

### Takeaway
sqlc supports PostgreSQL (Stable) and SQLite (Beta) for Go. SQLite has many open edge-case issues, including several that affect FTS5 tables. goose supports both engines, embedded migrations through `embed.FS`, and Go-function migrations, and it is actively released (v3.29.0, 2026-10-11).

### Cited Findings
- sqlc language support: Go built-in generator and `sqlc-gen-go` plugin are PostgreSQL **Stable**, MySQL **Stable**, SQLite **Beta**. — [docs.sqlc.dev language support](https://docs.sqlc.dev/en/latest/reference/language-support.html)
- sqlc latest release: v1.31.1, published 2026-04-22. — [GitHub API sqlc releases/latest](https://api.github.com/repos/sqlc-dev/sqlc/releases/latest)
- 64 open sqlc issues carry the "sqlite" label. Examples:
  - [#3901](https://github.com/sqlc-dev/sqlc/issues/3901) "`rowid` doesn't work with SQLite FTS5 tables"
  - [#3204](https://github.com/sqlc-dev/sqlc/issues/3204) "SQLite: Add support for WHERE clause on the FTS5 Table Name"
  - [#3574](https://github.com/sqlc-dev/sqlc/issues/3574) "Type casting not supported in SQLite"
  - [#2452](https://github.com/sqlc-dev/sqlc/issues/2452) "`sqlc.slice()` breaks SQLite queries that contain other parameters"
  - [#3788](https://github.com/sqlc-dev/sqlc/issues/3788) "Args in sqlite ORDER BY not respected"
  - [#3624](https://github.com/sqlc-dev/sqlc/issues/3624) "sqlc ignores parameters following a HAVING clause"
  - [#3580](https://github.com/sqlc-dev/sqlc/issues/3580) "JSON objects in SQLite are returned as strings"

  — [GitHub issue search](https://api.github.com/search/issues?q=repo:sqlc-dev/sqlc+is:issue+is:open+label:%22:books:%20sqlite%22&per_page=20&sort=reactions)
- goose is "a database migration tool. Both a CLI and a library." It supports sqlite3 and postgres, among others. Migrations can be embedded with Go's embed feature ("can be used only for applying existing migrations") or written as Go functions registered with `goose.AddMigration`. — [github.com/pressly/goose](https://github.com/pressly/goose)
- goose latest release: v3.29.0, published 2026-10-11. — [GitHub API goose releases/latest](https://api.github.com/repos/pressly/goose/releases/latest)

### Inferences
- sqlc + SQLite is workable for standard CRUD and reporting queries. Plan to hand-write the FTS5 search queries and any dynamic ORDER BY or IN-list queries, either directly with `database/sql` or with a small query builder.
- Migrating to cloud Postgres later means a second schema and query set. The SQL dialects differ (types, `RETURNING`, upserts, date functions), so sqlc would generate a separate package per engine. Keep the domain layer behind repository interfaces so the storage implementation can be swapped.
- Embed the goose migrations in the .exe and run them at service start. That keeps distribution to a single binary.

### Gaps
- I didn't check which goose SQLite dialect works with modernc. The goose README doesn't name a driver. Goose works on `*sql.DB`, so any driver should work, but this is unverified.

## 4. Litestream and other SQLite backup options

### Takeaway
Litestream is actively maintained (v0.5.17, 2026-08-31) and publishes Windows zips (x86_64 and arm64). Its docs include a "Running as a Windows Service" guide using `sc.exe`. Windows is still **not officially supported**: the release notes say Windows binaries are "for convenience… at your own risk". For a Windows POS, an in-app scheduled `VACUUM INTO` snapshot uploaded to R2 is the safer primary backup. Litestream can be an optional extra for continuous replication.

### Cited Findings
- Latest Litestream: v0.5.17, published 2026-08-31. Release assets include `litestream-0.5.17-windows-x86_64.zip` and `litestream-0.5.17-windows-arm64.zip`. — [GitHub API litestream releases/latest](https://api.github.com/repos/benbjohnson/litestream/releases/latest)
- Recent cadence: v0.5.11 (Apr), v0.5.12 (Jun), v0.5.13 (Jun 30), v0.5.14 (Jul 6), v0.5.15 (Jul 21), v0.5.16 (Aug 5), v0.5.17 (Aug 31). — [github.com/benbjohnson/litestream/releases](https://github.com/benbjohnson/litestream/releases)
- The release notes call Windows binaries "for convenience", say Windows is not officially supported, and say to use them "at your own risk". Officially supported platforms are Linux (amd64, arm64, armv6, armv7) and macOS. — [github.com/benbjohnson/litestream/releases](https://github.com/benbjohnson/litestream/releases)
- The install page lists macOS, Linux and build-from-source, not Windows. — [litestream.io/install](https://litestream.io/install/)
- Windows service guide: copy `litestream.exe` to `C:\Litestream`, put the config in `C:\Litestream\litestream.yml`, then run `sc.exe create Litestream binPath= "C:\Litestream\litestream.exe" start= auto`. "v0.3.x used an .msi installer that registered the service automatically. Starting with v0.5.x, you register the service manually." — [litestream.io/guides/windows](https://litestream.io/guides/windows/)
- S3-compatible improvements in 0.5.x: storage class option (v0.5.14), single PutObject for small LTX files (v0.5.16), Hetzner endpoint detection (v0.5.16), disabling accept-encoding signing (v0.5.17). A v0.5.9 docs change updated "R2 detection defaults." — [github.com/benbjohnson/litestream/releases](https://github.com/benbjohnson/litestream/releases)
- Litestream VFS (read-only access to replicas) is experimental and Linux/macOS only. — [github.com/benbjohnson/litestream/releases](https://github.com/benbjohnson/litestream/releases)
- `VACUUM INTO` "is an alternative to the backup API for generating backup copies of a live database". The output is "a consistent snapshot" and minimal in size, but it "might be incomplete and corrupt" if interrupted by power loss. When the source runs with synchronous NORMAL or FULL, the output is fsynced. The target file must not already exist. Unlike plain VACUUM, VACUUM INTO is not a write operation. — [sqlite.org/lang_vacuum](https://www.sqlite.org/lang_vacuum.html)
- Online Backup API: incremental copying locks the source only briefly. The result is "a bit-wise identical copy… as it was when the copying commenced". Writes from another connection restart the backup, and frequent restarts can stop it from ever finishing. The page also mentions `VACUUM INTO` and `sqlite3_rsync` as alternatives. — [sqlite.org/backup](https://www.sqlite.org/backup.html)
- ncruces/go-sqlite3 exposes the online backup API through its driver. — [github.com/ncruces/go-sqlite3](https://github.com/ncruces/go-sqlite3)
- LiteFS "is actively maintained but is currently in a beta state" and is "FUSE-based". — [github.com/superfly/litefs](https://github.com/superfly/litefs). Its latest release is v0.5.14 from 2025-04-22, about 18 months old. — [GitHub API litefs releases/latest](https://api.github.com/repos/superfly/litefs/releases/latest)

### Inferences
- LiteFS is not an option here. It depends on FUSE, which effectively means Linux (platform inferred from FUSE, not stated in the README), and it has had no release since April 2025.
- Recommended backup design (inference):
  1. The Go service runs `VACUUM INTO 'backup-YYYYMMDD-HHMM.db.tmp'`, then renames the file, every N hours and at end of day (*tutup kasir*).
  2. Optionally gzip the snapshot, then upload it to R2 through the S3 API.
  3. Keep the last X snapshots locally, ideally on a USB drive or second disk too.

  This has no external service dependency and is fully under the app's control.
- Litestream on Windows can be added for near-continuous replication. Because Windows is officially unsupported, treat it as best-effort and still keep scheduled snapshots.
- I did not verify whether `litestream.exe` implements the Windows Service Control Manager protocol, which a bare `sc.exe create` needs to avoid a "service did not respond" (error 1053) failure. Test it on a real Windows box, or wrap it with a service wrapper.

### Gaps
- Litestream's default sync interval and its per-sync S3 PUT count weren't checked. These determine R2 Class A usage (see section 5).
- I didn't open the Litestream R2-specific config guide.

## 5. Cloudflare R2 free tier (2026)

### Takeaway
The R2 free tier is 10 GB-month of Standard storage, 1 million Class A operations per month, 10 million Class B operations per month, and free egress. Daily SQLite snapshots of a small POS database fit easily. Continuous replication (Litestream) is what could push Class A writes up.

### Cited Findings
- Free tier (Standard storage only): 10 GB-month storage, 1 million Class A operations per month, 10 million Class B operations per month, egress free. The free tier doesn't apply to Infrequent Access. — [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/)
- Paid: Standard storage $0.015/GB-month, Class A $4.50/million, Class B $0.36/million. Infrequent Access storage $0.01/GB-month, Class A $9.00/million, Class B $0.90/million, retrieval $0.01/GB, 30-day minimum storage. Egress is free in both classes. — [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/)

### Inferences
- A 20k-product database plus a few years of transactions is likely tens to low hundreds of MB. Even 30 daily snapshots of 50 MB is 1.5 GB, within the 10 GB free tier.
- Snapshot uploads use only tens of PUTs per month, which is negligible. If Litestream syncs every few seconds during 12-hour shop days, monthly PUTs could approach the 1M Class A limit. Configure a longer sync interval if both are used. The sync behavior itself wasn't verified.

### Gaps
- Whether an R2 account requires a payment method on file even for free-tier use wasn't checked.

## 6. Remote access: Tailscale vs Cloudflare Tunnel + Access

### Takeaway
**Correction to the "Tailscale is free" assumption:** the free Personal plan (6 users, unlimited user devices) is officially "only suitable for non-commercial use". A shop's POS is commercial, so the compliant plan is Standard at $8/user/month (14-day free trial). Technically Tailscale fits well: Windows unattended/service mode, Android and iOS apps, MagicDNS, and Let's Encrypt certificates through `tailscale cert`. Cloudflare Tunnel + Access is free for up to 50 users, but publishing an app requires a domain on Cloudflare. Quick Tunnels (trycloudflare.com) are for testing only.

### Cited Findings
- Tailscale Personal plan: $0, "Up to 6 users", "Unlimited user devices", 50 tagged resources, up to 3 ACL groups. The FAQ says the Personal plan "is only suitable for non-commercial use of Tailscale… not intended for commercial use." — [tailscale.com/pricing](https://tailscale.com/pricing)
- A tailnet created with a custom domain "is considered business use" and is enrolled in a free trial. Business customers get a "14-day free trial… with no user limit." The Standard plan is $8 per user per month. Former Personal Plus users can keep their plan, and Starter plans migrate to Standard. — [tailscale.com/pricing](https://tailscale.com/pricing)
- `tailscale cert` requests a Let's Encrypt certificate using a DNS-01 challenge that Tailscale handles. MagicDNS must be enabled and HTTPS turned on in the admin console. Names have the form `machine-name.tailXXXX.ts.net`, and bare hostnames can't get certificates. Certificates appear in public Certificate Transparency logs, exposing machine names and the tailnet name. Certificates last 90 days, and renewal for `tailscale cert` files is the user's responsibility (Caddy and similar integrations renew automatically). — [tailscale.com/kb/1153/enabling-https](https://tailscale.com/kb/1153/enabling-https)
- On Windows, Tailscale runs in the user session by default. "Run unattended" (`tailscale set --unattended=true`, or the `UnattendedMode` policy) keeps it connected after logout or reboot. The "Tailscale" service should be set to Automatic. Requires Windows 10+ or Windows Server 2016+. — [tailscale.com/kb/1088/run-unattended](https://tailscale.com/kb/1088/run-unattended)
- Tailscale clients exist for macOS, iOS, Windows, Linux and Android. — [tailscale.com/download](https://tailscale.com/download)
- Cloudflare Tunnel: "Before you publish an application through your tunnel, you must add a website to Cloudflare." That means a domain on Cloudflare. — [developers.cloudflare.com create-remote-tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/)
- `cloudflared` makes "outbound-only connections", so no inbound port needs to be open. — [developers.cloudflare.com connect-networks](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- Quick Tunnels: "no uptime guarantee", up to 200 in-flight requests, no SSE, "for testing and development", and the hostname changes every time a tunnel is created. — [developers.cloudflare.com trycloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
- Cloudflare Zero Trust Free plan "protects up to 50 users at no cost… up to 50 seats of Access and Gateway", with 24-hour log retention (blog post dated 2020-10-13). — [blog.cloudflare.com/teams-plans](https://blog.cloudflare.com/teams-plans). Cloudflare's current plans page didn't render the figures. A search summary attributed "Free plan $0… teams under 50 users" and "Pay-as-you-go $7 per user per month" to the official pricing page, but I couldn't open it. — [cloudflare.com/plans/zero-trust-services](https://www.cloudflare.com/plans/zero-trust-services/)
- Zero Trust account limits: 500 Access applications by default. — [developers.cloudflare.com account-limits](https://developers.cloudflare.com/cloudflare-one/account-limits/)

### Inferences
- **Tailscale.** Two people (owner and cashier PC) is technically trivial on Personal, but the ToS rules out commercial use. The compliant cost is about $8/user/month. Whether the cashier PC needs a user seat or can be a tagged resource wasn't verified. For an MVP, the owner may run the tailnet on a personal account, but that is a licensing risk the report should state openly, not hide.
- **Cloudflare Tunnel + Access.** Runtime cost is Rp0 for up to 50 users. Two prerequisites:
  - A domain on Cloudflare (yearly fee; price not researched).
  - Access configured (e.g. email one-time PIN) so the dashboard isn't public.

  The owner's phone needs only a browser, no VPN app. The trade-off is that traffic and authentication go through Cloudflare, and the dashboard needs internet on both ends. That is true for Tailscale too, unless both devices share the LAN.
- **Recommendation.** For a commercial shop that wants Rp0 recurring cost, a cheap domain + Cloudflare Tunnel + Access is the compliant zero-subscription path. Tailscale is the simplest UX, but it's either a ToS grey area (Personal) or paid (Standard).
- If Tailscale is used, run unattended mode on the cashier PC, use the MagicDNS name, and either renew `tailscale cert` on a schedule or use `tailscale serve`/Caddy for automatic renewal.

### Gaps
- I couldn't load the current Cloudflare Zero Trust pricing page. The 50-user free figure is from a 2020 official blog post plus a 2026 search summary, so treat it as likely but not confirmed current.
- Not verified: `cloudflared` install-as-a-Windows-service steps (`cloudflared service install`) on the current docs page.
- Not verified: whether a Tailscale tagged device (the cashier PC) counts against Standard plan user seats.

## 7. Backend language: Go vs Node.js/Bun vs Rust vs C#/.NET for a Windows-hosted POS server

### Takeaway
Go has the cleanest fit: a single static .exe with no CGO when using modernc, first-party Windows service support (`golang.org/x/sys/windows/svc`, v0.49.0 Oct 2026), the cross-platform `kardianos/service`, and sqlc/goose tooling. .NET 10 is equally capable on Windows (Worker Service + `AddWindowsService`, single-file self-contained publish, documented SCM recovery). Bun can compile a single Windows .exe, but its runtime binary is large (Bun's own docs say "way too big"). Node's single-executable apps are still "Active development" and can't load native addons directly from the bundle, which complicates better-sqlite3. I didn't research Rust in depth.

### Cited Findings
- `golang.org/x/sys/windows/svc` "provides everything required to build Windows service". It has a `Handler` interface, `Run`, and `IsWindowsService()`. The related `mgr` package manages services and `eventlog` writes to the Windows event log. v0.49.0, published 2026-10-06. — [pkg.go.dev/golang.org/x/sys/windows/svc](https://pkg.go.dev/golang.org/x/sys/windows/svc)
- kardianos/service: "Run go programs as a service on major platforms… Currently supports Windows XP+, Linux/(systemd | Upstart | SysV), and OSX/Launchd". Zlib license, about 4.8k stars, no tagged releases. — [github.com/kardianos/service](https://github.com/kardianos/service). Repo last pushed 2026-08-29 and not archived. — [GitHub API kardianos/service](https://api.github.com/repos/kardianos/service)
- .NET: a Worker Service plus the `Microsoft.Extensions.Hosting.WindowsServices` package; the docs example uses package version 10.0.12 and `net10.0-windows`. `builder.Services.AddWindowsService(...)`. Microsoft recommends publishing "as a single file executable… self-contained". Install with `sc.exe create`. Recovery uses `sc.exe failure … actions= restart/60000/…`. You must `Environment.Exit(1)` on a fatal error so that SCM recovery restarts the service. — [learn.microsoft.com windows-service](https://learn.microsoft.com/en-us/dotnet/core/extensions/windows-service)
- Bun: `bun build --compile --target=bun-windows-x64` cross-compiles a Windows .exe. A SQLite database can be embedded, but an embedded DB is in-memory and "all changes are lost when the executable exits", so a real POS DB must be an external file. There are Windows options for icon, hide-console and metadata. The docs say "Bun's binary is still way too big and we need to make it smaller." — [bun.sh/docs/bundler/executables](https://bun.sh/docs/bundler/executables)
- Node.js single executable applications (docs for v26.12.0): "Stability: 1.1 - Active development". "Native addons (`.node` files) cannot be loaded directly from the VFS"; the workaround is extracting them to a temp file and calling `process.dlopen()`. `import.meta.resolve` isn't supported. — [nodejs.org/api/single-executable-applications](https://nodejs.org/api/single-executable-applications.html)

### Inferences
- **Go.** One `GOOS=windows` build gives a single .exe, around tens of MB (size not measured). The same binary can install itself as a service via kardianos/service (`app.exe install`) and embeds migrations and the web dashboard with `embed`. The same code later deploys to a Linux cloud VM or container for the multi-branch phase. This matches the PRD constraints best.
- **.NET 10.** A strong alternative if the developer prefers C#. The trade-offs are larger self-contained binaries and a less natural path to the Linux-container cloud phase, although .NET runs on Linux too.
- **Node/Bun.** Workable, but the most common fast SQLite driver for Node (better-sqlite3) is a native addon, which conflicts with Node SEA. Bun's built-in `bun:sqlite` avoids that, at the cost of a large runtime binary. Windows service hosting would need a wrapper such as NSSM or WinSW (not researched).
- **Rust.** Gives the smallest footprint and a native .exe, but development speed is slower for a CRUD/POS app. Not verified with sources here.

### Gaps
- No sourced memory-footprint numbers (idle RSS) for Go, .NET, Bun or Node services on Windows. Measure them in a prototype.
- ESC/POS library ecosystems per language and Rust's `windows-service` crate weren't researched in this pass (receipt printing is probably covered by another researcher).
- No sourced binary-size figures for a Go or .NET single-file build.

## 8. Cheap or free hosting for a later cloud phase (Go API + Postgres)

### Takeaway
For managed Postgres at Rp0: Neon Free (**1 GB storage per project**, scale-to-zero after 5 min) is the best free option. Supabase Free (500 MB DB) pauses after 1 week of inactivity, and Render's free Postgres expires after 30 days, so neither suits production. For the Go API, Cloud Run's free tier (2M requests/month) or Oracle Always Free Ampere A1 (equivalent to 2 OCPUs and 12 GB RAM in total) cost nothing. Fly.io has no free allowance for new customers. Indonesian VPS start at about Rp59k/month (Biznet Gio NEO Lite) or Rp116.9k/month promo (Hostinger KVM 1, with a Jakarta location).

### Cited Findings
- **Neon Free:**
  - 100 projects; 1 GB storage per project, 20 GB across all projects.
  - 100 CU-hours per project; autoscaling up to 2 CU (8 GB RAM).
  - Scale-to-zero after 5 minutes, "Always enabled on Free… cannot be turned off".
  - 5 GB egress per project; 6-hour history window.

  Launch (pay-as-you-go, no monthly minimum): $0.106 per CU-hour, $0.35 per GB-month, 500 GB egress included then $0.10/GB. — [neon.com/pricing](https://neon.com/pricing)
- **Supabase Free:** 500 MB database (shared CPU, 500 MB RAM), 5 GB egress plus 5 GB cached egress, 50,000 MAU, "Limit of 2 active projects", "Free projects are paused after 1 week of inactivity". Pro is "from $25/month". — [supabase.com/pricing](https://supabase.com/pricing)
- **Google Cloud Run free tier** (request-based billing, per billing account, monthly): 2 million requests, 360,000 GB-seconds memory, 180,000 vCPU-seconds, 1 GB outbound from North America. Compute Engine free tier: one non-preemptible e2-micro in us-west1, us-central1 or us-east1, 30 GB-months of standard persistent disk. Google may change the Free Tier with 30 days' notice. — [docs.cloud.google.com free-cloud-features](https://docs.cloud.google.com/free/docs/free-cloud-features)
- **Fly.io:** "New organizations get no free tier or monthly free usage allowance". They get a trial of 2 hours of machine runtime or 7 days. Running continuously in iad/ewr, shared-cpu-1x costs $2.19/month (256 MB), $3.69 (512 MB) or $6.70 (1 GB). Volumes are $0.15/GB-month. Managed Postgres Basic is $38/month plus $0.28/GB-month. Legacy plans keep their allowances. — [docs.fly.io/about/pricing](https://docs.fly.io/about/pricing)
- **Render Free:** web services spin down after 15 minutes without inbound traffic, with a cold start of "about one minute"; 750 free instance hours per workspace per month. Free Postgres "expire 30 days after creation" (14-day grace period) and has a fixed 1 GB. — [render.com/docs/free](https://render.com/docs/free)
- **Oracle Cloud Always Free:**
  - Ampere A1: 1,500 OCPU-hours and 9,000 GB-hours per month, equal to 2 OCPUs and 12 GB of memory.
  - Up to two AMD E2.1.Micro VMs (1/8 OCPU, 1 GB each).
  - 200 GB block storage; 10 TB/month outbound; two Autonomous AI Databases (20 GB each, Oracle DB, not Postgres).
  - Idle instances may be reclaimed when, over 7 days, 95th-percentile CPU is below 20%, network is below 20%, and (A1 only) memory is below 20%. "Out of host capacity" errors can occur.

  — [docs.oracle.com Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- **Biznet Gio NEO Lite** (prices as listed; PPN status not stated): XS 1.1 (1 core/1 GB/60 GB) Rp59.000/month; SS 2.1 (1/2 GB) Rp80.000; SS 2.2 (2/2 GB) Rp109.000; MS 4.2 (2/4 GB) Rp139.000. NEO Lite Pro (NVMe): SS.1.1 Rp209.000; SS.2.1 Rp309.000; MS.2.2 Rp389.000; MS.4.2 Rp559.000. — [biznetgio.com/pricelist](https://biznetgio.com/pricelist). Search snippets of the same and English pages showed different figures (XS 1.1 at Rp50.000; Lite Pro SS.1.1 at Rp119.000 or Rp198.000), so the price list appears to change often. Confirm at purchase time.
- **Hostinger Indonesia KVM VPS** (promo / renewal per month, paid upfront for the term): KVM 1 (1 vCPU/4 GB/50 GB NVMe/4 TB) Rp116.900 / Rp193.900; KVM 2 (2/8 GB/100 GB) Rp155.900 / Rp232.900; KVM 4 (4/16 GB/200 GB) Rp213.900 / Rp465.900. Jakarta is one of the data center locations. — [hostinger.com/id/vps-hosting](https://www.hostinger.com/id/vps-hosting)

### Inferences
- **Zero-cost cloud phase:** Go API on Cloud Run (or an Oracle A1 VM) plus Neon Free Postgres (1 GB, 5 GB egress). Because Neon always scales to zero on Free, the first query after idle has a cold-start delay (duration not quantified here). That's acceptable for sync and dashboard traffic, not for the till, which stays local anyway.
- Avoid Supabase Free and Render Free Postgres for production data. One pauses after 7 days idle and the other is deleted after 30 days.
- **Budget paid option:** a Biznet Gio NEO Lite 2 GB at about Rp80–109k/month, or Hostinger KVM 1 (4 GB) at Rp116.9k/month on promo (Rp193.9k on renewal), running Go and self-managed Postgres in Jakarta. Lowest latency to Indonesian shops, but the owner manages backups and upgrades.
- Oracle Always Free is the most generous compute, but it brings reclamation and capacity risk. A low-traffic POS sync server could fall under the "idle" thresholds.

### Gaps
- IDCloudHost's pricing page returned HTTP 403, so no verified IDCloudHost prices. Niagahoster now redirects to Hostinger branding (not verified with a source).
- Cloud Run instance-based billing free-tier limits and the eligible regions for Jakarta (asia-southeast2) aren't covered by the free-features page. Egress allowance is stated only "from North America".
- Biznet Gio PPN (11%) inclusion is unconfirmed, and the prices conflict between page versions.
- Neon cold-start latency figures weren't sourced.

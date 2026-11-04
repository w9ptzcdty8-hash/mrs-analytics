# MRS Analytics — app-level analytics foundation

Cloudflare Workers + D1による小規模アクセス解析。2026-11-03時点で共通Worker・D1の17サイト対応は本番/プレビューとも反映済み。従来のTOOLS/WORKS/GAMESホーム3サイトは本番で有効、新規14サイトは本番では無効です。Photo MemoのみプレビューDBで有効化して1PV/1UUの実測を確認済み。アプリ本番への計測タグ導入は別PR・別承認とします。

## Deployed resources

- Production Worker: https://mrs-analytics.mrsworkspjt.workers.dev (production: 3 home sites enabled; 14 new sites disabled)
- Preview Worker: https://mrs-analytics-preview.mrsworkspjt.workers.dev
- Production D1: mrs-analytics-production / 39f5c8c5-de11-40af-ae0e-4a47182f06e4
- Preview D1: mrs-analytics-preview / 9fe49965-1e44-462a-8e72-2bdddc993938
- Photo Memo pilot preview: https://556e5aef.photo-memo-epu.pages.dev/ (2026-11-03: 1PV/1UU observed in preview D1)
- Photo Memo integration: https://github.com/MRS-TOOLS/photo-memo/pull/6 (draft; **not merged**)
- Analytics foundation: https://github.com/w9ptzcdty8-hash/mrs-analytics/pull/5 (draft; cloud resources updated directly ahead of GitHub merge)

ソースコードの管理先は https://github.com/w9ptzcdty8-hash/mrs-analytics です。CloudflareへはAPIで配置済み。GitHubからCloudflareへの自動デプロイ連携は未設定です。

## Measurement contract

- Page new load/reload only. No resume, clicks, duration, offline queue or retry.
- The browser sends site_id, random event_id, JST day, daily random visitor_id or null.
- LocalStorage key: mrs.analytics.daily.<site_id>. A new JST day replaces the identifier on next load.
- No visitor opt-out UI. The policy discloses transmitted fields, recipients, purpose and retention. Only the daily identifier is stored by the client.
- No raw IP, IP hash, UA, referrer, query string, device info, country, PWA mode or tool content in D1.
- Cloudflare may process network metadata independently. Persisted Worker observability is disabled.
- Daily unique = per site/browser storage/day approximation, never cross-site people or monthly people.
- Count unclassified_pageviews separately when storage cannot be used.
- Fixed daily cap: 1,000/site/JST day in each environment. 429 after the cap; counts become incomplete. This is a pilot safety cap, not traffic-independent abuse protection.
- Origin checks cannot prevent clients spoofing Origin. Worker request/read quota can still be exhausted by abuse; D1 caps are shared with existing ranking DBs.
- Accepted server time defines UTC timestamp and JST day. A stale client day is rejected with 409, without retry.

## Storage and consistency

Three tables: sites, access_events, daily_stats. A trigger in the INSERT transaction handles unique lookup and daily upsert. event_id conflict avoids duplicate increments. Quota check is part of that same statement. Parameter binding only, no public SQL/report endpoint.

Hourly Cron deletes up to 750 events older than 30 days and up to 100 daily rows older than approximately 3 years (1,096 days). Aggregates are retained when events are deleted. Deletion can lag during errors. Daily unique is not recomputed after retention. Closed-day statistics should be read using JST date ranges.

The current 17-site allowlist allows at most 17,000 accepted events/day at cap=1,000/site. Hourly cleanup of up to 750 events provides a nominal 18,000/day deletion capacity; actual limits, retention lag and quota consumption must be monitored before broader activation. Increase neither cap nor scope without reviewing usage, privacy and approval.

## Test and deploy

Node.js 24+: npm test. Uses built-in node:sqlite, no installed dependencies.

**Existing production and preview D1 databases already had migrations 0001 and 0002; migration 0003 was applied directly through the Cloudflare D1 query API on 2026-11-02 to preview and 2026-11-03 to production (JST). Do not replay 0001, 0002, or 0003 on either existing database.** Their migration-history table (`d1_migrations`) is not present in the production DB; the 0003 API application did not register a Wrangler migration history entry. Do not run `wrangler d1 migrations apply` against these databases without first inspecting and reconciling actual schema/data and migration bookkeeping. To provision an entirely new database, review and apply the migrations in sequence under the appropriate tooling. Keep an out-of-band record of the already-applied migrations.
wrangler.jsonc contains resource IDs, not secrets. Use a separately authenticated Wrangler CLI if deploying from the dedicated repo. Load current Cloudflare Wrangler instructions first. Generate Worker types and validate the current Wrangler schema when adding that toolchain; this initial plain JS build is deployed through Cloudflare's multipart API.

## Read from ChatGPT

Use the connected Cloudflare D1 query endpoint with SELECT only. queries/reports.sql provides parameterized examples. Use daily_stats rather than scanning raw events. Do not interpret SUM(unique_visitors) as period-unique people.
Week: Monday 00:00 to next Monday 00:00 JST; compare equal elapsed periods if this week is incomplete.
As of 2026-11-03, production has 3 enabled home sites and 14 disabled new sites; disabled/uninstrumented apps are unavailable, not zero-use. Preview additionally enables `photo-memo` for testing.

## Release / rollback (current state)

- **Completed with explicit approval:** preview D1 0003 schema migration, preview collector deployment, Photo Memo preview pilot verification; production D1 0003 schema migration, production collector deployment. D1 0003 applied as SQL via API, not by a migration runner.
- **Pre-production counts (2026-11-03):** 3 sites, 110 raw access events, 26 daily aggregate rows. **Post-migration:** 17 sites, 110 raw events, 26 aggregates, empty `PRAGMA foreign_key_check`, aggregate trigger and event indexes present. Existing start dates preserved. A Time Travel bookmark was obtained and an SQL export reported complete before applying 0003 (export file was not locally downloaded).
- **Pending:** merge PR #5 to align GitHub source with the already deployed foundation; review Photo Memo privacy disclosure, production activation, then independently approve and merge its draft PR #6. Verify production collection before expanding to other apps. Merging PR #5 does not redeploy automatically.
- **No migration replay:** first compare current schema and the actual D1 resource ID. Do not manually run 0003 again; a second application would collide with existing tables/rows. Do not use `d1_migrations` as evidence of completed migrations on this preexisting DB.
- Emergency stop: set Worker ENABLED=false or remove the app analytics script tag after explicit approval. Existing app data remains intact. Do not delete D1 as a rollback. Time Travel restoration is destructive, time-limited and requires separate explicit approval.

## Admin dashboard

URL: https://mrs-analytics-admin.mrsworkspjt.workers.dev/
The dashboard Worker is separate from the collection Worker and reads existing production daily_stats through the D1 binding. It has no collection, update or arbitrary SQL endpoint. The account owner must review the feature branch before merging.

Cloudflare Access protects the whole hostname with a single-email Allow policy and an explicitly configured one-time PIN identity provider. The Worker also verifies RS256 JWT signatures, issuer, audience, expiry and the allowed email. Configure ADMIN_EMAIL as a Worker secret; never add it to browser files or commit a login credential. Tokens and identity are not logged. Preview URLs are disabled. No public analytics endpoints or administrative write endpoints are added to the collection Worker.

`npm ci` and `npm run build:admin` build HTML/CSS/browser JS into the management Worker through esbuild. `npm test` builds then runs aggregation and authentication tests on Node 24+. The bundle is generated in admin/.build and excluded from Git. No browser CDN dependencies, Service Worker, analytics beacon, ads or offline data cache are used in the admin page.

`wrangler.admin.jsonc` is the management Worker config, not the collection Worker config. Use it only for management deployments and preserve the ADMIN_EMAIL secret. The initial deployment is performed through the Cloudflare API, not GitHub automatic deployment.

The screen displays today's and yesterday's counts, 7/30-day or custom daily trends, and per-site totals. Dates use JST. Dates before the pilot started (2026-10-11) show as unmeasured. A custom period is limited to 366 days and retained dates. Summed daily/site unique counts are not distinct people over a period. The initial production check contributed one access on 2026-10-11. Each enabled site has its own measured_since date; all-site totals combine records from each site’s measurement start.

Rollback: disable only the admin Worker's workers.dev subdomain. Leave Access enabled until the management endpoint is disabled; do not touch the collection Worker or delete D1.


## WORKS / GAMES home rollout (historical guidance)

- Migration `0002_home_sites.sql` previously added `measured_since` and registered WORKS/GAMES. It is already applied to the current production and preview DBs; do not replay.
- All three home sites are now enabled in production. Their site/origin separation and day-specific identifiers are preserved in the 17-site collector. `measured_since` remains per site; avoid inventing backfilled counts.
- App-specific production tracking requires individual approval and an appropriate disclosure. Activate a newly integrated site with `UPDATE sites SET enabled=1,measured_since=? WHERE site_id=? AND enabled=0`, passing the actual JST activation date. A re-deployment must not overwrite a preexisting start date.
- Preview collection uses only preview Worker and D1; production uses only production Worker and D1. Origin checks limit ordinary browser usage but are not protection against forged HTTP requests.
- Disable only a problematic site or remove its client script to roll back a single app without touching existing homes or deleting historical data.

## All-app foundation (cloud resources deployed; PR #5 remains draft)

- The collection Worker and shared browser client allowlist 17 specific production hosts across WORKS, TOOLS, GAMES and KIDS. App IDs not yet validated remain excluded.
- `migrations/0003_app_sites.sql` extends the `sites.service` constraint to KIDS, recreates linked tables and the aggregate trigger/indexes, and registers 14 new sites disabled. **Applied successfully once** to preview D1 (2026-11-02 JST) and production D1 (2026-11-03 JST). DO NOT RE-EXECUTE on those databases. The migration SQL is retained as historical source and for controlled new-database provisioning.
- Existing raw records and aggregates were preserved in both environments. On production, 3 sites/110 events/26 daily rows became 17 sites/110 events/26 daily rows; FK check returned no violations. This validates the migration state, not a complete end-to-end production traffic test.
- Photo Memo preview branch adds `analytics.js` plus PWA shell caching and the preview D1 `photo-memo` row is enabled. The user opened its preview on 2026-11-03 and observed 1 PV/1 UU in D1. **The Photo Memo production app remains unchanged and the production D1 row remains disabled.**
- Max accepted volume across all 17 enabled sites would be 17,000/day at 1,000 per site. Cleanup is bounded at 750 events/hour (~18,000/day nominal), with Worker/D1 free quotas and abuse exposure still needing observation as more sites are activated. This is not a security guarantee.
- Use `client/analytics.js` with the matching `data-site-id`; it counts initial visible loads/reloads only and does not transmit photo content, location, clicks or app data. Ensure analytics failure never blocks functionality. Review privacy text before enabling production for each app.
- **Not yet verified:** full `npm test` run in a Node 24 environment; end-to-end production ingestion after the collector update; 10 deferred app hostnames. Their URLs must be checked before allowlisting: multi-stopwatch, multi-timer, multi-counter, qr-maker, thanks-diary, world-time-clock, roulette, image-color-picker, bug-beat-blocks, bongo-bongo.

## Central client delivery pilot (2026-11-04, preview only)

- The preview Worker now serves the shared classic browser script at `https://mrs-analytics-preview.mrsworkspjt.workers.dev/client.js` (`GET` only; JavaScript MIME; `nosniff`; `Cache-Control: no-store`). Existing `/v1/collect` logic and D1 schema are unchanged.
- `client/analytics.js` remains the canonical client logic. The generated `src/client-source.js` embeds the same bytes in a Worker JavaScript module; after editing the canonical file, run `node scripts/sync-client.mjs`. Tests compare them byte-for-byte.
- Photo Memo draft PR [#6](https://github.com/MRS-TOOLS/photo-memo/pull/6) uses a single external `<script defer src="https://mrs-analytics-preview.mrsworkspjt.workers.dev/client.js" data-site-id="photo-memo"></script>` on its **preview branch only**. It removes the duplicated local `analytics.js` and stops treating it as a PWA shell asset (cache v43). If external loading fails or the user is offline, Photo Memo still functions and the visit is not counted.
- **Never merge the Photo Memo pilot with the preview script URL.** Before production release, deploy the reviewed shared client feature to the **production** collector under separate GO and replace the Photo Memo tag with `https://mrs-analytics.mrsworkspjt.workers.dev/client.js`. Production `photo-memo` remains disabled pending separately approved activation.
- For future apps use one nonblocking classic script tag with the site-specific `data-site-id`, after confirming allowlisted hostnames, section privacy notice, preview measurement, and explicit approval. The automatic injection/registration of arbitrary sites is **not** enabled.
- Preview Worker uploaded directly on 2026-11-04 JST. Existing production Worker and both database schemas are unchanged by this pilot. A successful Cloudflare API deployment / Pages build does not by itself confirm the public JS response or a new preview D1 event: verify in a browser and D1 before production approval.

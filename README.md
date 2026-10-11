# MRS Analytics — Phase 2 pilot

Cloudflare Workers + D1による小規模アクセス解析。現時点の対象はTOOLSトップのみ。

## Deployed resources

- Production Worker: https://mrs-analytics.mrsworkspjt.workers.dev (collection enabled: TOOLS home only)
- Preview Worker: https://mrs-analytics-preview.mrsworkspjt.workers.dev
- Production D1: mrs-analytics-production / 39f5c8c5-de11-40af-ae0e-4a47182f06e4
- Preview D1: mrs-analytics-preview / 9fe49965-1e44-462a-8e72-2bdddc993938
- Preview home: https://feature-mrs-analytics.mrs-tools.pages.dev/
- Home PR: https://github.com/MRS-TOOLS/TOOLS-home/pull/15
- Privacy PR: https://github.com/w9ptzcdty8-hash/MRS-WORKS/pull/1

ソースコードの管理先は https://github.com/w9ptzcdty8-hash/mrs-analytics です。CloudflareへはAPIで配置済み。GitHubからCloudflareへの自動デプロイ連携は未設定です。

## Measurement contract

- Page new load/reload only. No resume, clicks, duration, offline queue or retry.
- The browser sends site_id, random event_id, JST day, daily random visitor_id or null.
- LocalStorage key: mrs.analytics.daily.tools-home. A new JST day replaces the identifier on next load.
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

Hourly Cron deletes up to 250 events older than 30 days and up to 100 daily rows older than approximately 3 years (1,096 days). Aggregates are retained when events are deleted. Deletion can lag during errors. Daily unique is not recomputed after retention. Closed-day statistics should be read using JST date ranges.

The 1,000/day cap fits the 6,000/day cleanup capacity. Increase neither the cap nor scope without checking writes, retention capacity, limits, privacy and approval.

## Test and deploy

Node.js 24+: npm test. Uses built-in node:sqlite, no installed dependencies.

Schema is already applied remotely; do not replay 0001 on existing DBs. New databases use migrations/0001_initial.sql.
wrangler.jsonc contains resource IDs, not secrets. Use a separately authenticated Wrangler CLI if deploying from the dedicated repo. Load current Cloudflare Wrangler instructions first. Generate Worker types and validate the current Wrangler schema when adding that toolchain; this initial plain JS build is deployed through Cloudflare's multipart API.

## Read from ChatGPT

Use the connected Cloudflare D1 query endpoint with SELECT only. queries/reports.sql provides parameterized examples. Use daily_stats rather than scanning raw events. Do not interpret SUM(unique_visitors) as period-unique people.
Week: Monday 00:00 to next Monday 00:00 JST; compare equal elapsed periods if this week is incomplete.
Only tools-home is registered. Apps not yet instrumented are unavailable, not zero-use.

## Release / rollback

1. Review both Pages previews and D1 results.
2. Review the dedicated analytics repository and preserve the deployed source.
3. On explicit merge approval, merge privacy PR before the home PR.
4. Enable production Worker ENABLED=true, keeping production MODE and DB unchanged. Save that setting in wrangler.jsonc as well.
5. Verify production collection and SELECT. No expansion to other tools in this phase.

Emergency stop: set Worker ENABLED=false or remove the analytics script tag. Existing app data remains intact. Do not delete D1 as a rollback.

## Admin dashboard

URL: https://mrs-analytics-admin.mrsworkspjt.workers.dev/
The dashboard Worker is separate from the collection Worker and reads existing production daily_stats through the D1 binding. It has no collection, update or arbitrary SQL endpoint. The account owner must review the feature branch before merging.

Cloudflare Access protects the whole hostname with a single-email Allow policy and an explicitly configured one-time PIN identity provider. The Worker also verifies RS256 JWT signatures, issuer, audience, expiry and the allowed email. Configure ADMIN_EMAIL as a Worker secret; never add it to browser files or commit a login credential. Tokens and identity are not logged. Preview URLs are disabled. No public analytics endpoints or administrative write endpoints are added to the collection Worker.

`npm ci` and `npm run build:admin` build HTML/CSS/browser JS into the management Worker through esbuild. `npm test` builds then runs aggregation and authentication tests on Node 24+. The bundle is generated in admin/.build and excluded from Git. No browser CDN dependencies, Service Worker, analytics beacon, ads or offline data cache are used in the admin page.

`wrangler.admin.jsonc` is the management Worker config, not the collection Worker config. Use it only for management deployments and preserve the ADMIN_EMAIL secret. The initial deployment is performed through the Cloudflare API, not GitHub automatic deployment.

The screen displays today's and yesterday's counts, 7/30-day or custom daily trends, and per-site totals. Dates use JST. Dates before the pilot started (2026-10-11) show as unmeasured. A custom period is limited to 366 days and retained dates. Summed daily/site unique counts are not distinct people over a period. The initial production check contributed one access on 2026-10-11. Later site rollout requires revisiting per-site measurement start dates.

Rollback: disable only the admin Worker's workers.dev subdomain. Leave Access enabled until the management endpoint is disabled; do not touch the collection Worker or delete D1.

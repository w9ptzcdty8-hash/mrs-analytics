# Phase 2 validation — 2026-10-11 JST

## Passed

- 7 Node/SQLite tests: pageview and daily unique aggregation, duplicate event, missing daily ID, source isolation, malformed/stale payload, quota, retention, JST midnight, browser-code offline and localStorage failure paths.
- Live Cloudflare browser: load then reload of TOOLS preview -> D1 shows 2 pageviews and 1 daily unique.
- Previous stop-button check has been superseded: visitor opt-out UI and its client logic were removed on 2026-10-11.
- D1 read from ChatGPT: works for new preview and production databases. Production daily_stats is empty.
- Both Pages previews deployed successfully. Production Worker collection returns 503 while disabled.

- Live Worker concurrent duplicate: two 204 responses for the same event. Together with same-ID repeat and no-ID event, D1 confirms final totals of 5 pageviews, 2 daily unique visitors and 1 unclassified pageview (3 new pageviews, 1 new unique, 1 new unclassified).

## Not verified

- iPhone/Safari verification of the updated preview after removing the stop button (the previous preview was confirmed by the user).
- Live hourly Cron execution and expiry after 30 days (the cleanup code was verified locally).
- Production collection, pending explicit merge/activation approval.
- Account plan and total existing quota usage (subscription read lacks permission).
- Automated Playwright browser test in test/preview-browser.cjs: not run because the local browser binary is unavailable. Use the supplied harness with an installed official Playwright Chromium browser; cloud-browser checks above were run separately.

Raw test visits reside only in the preview DB and will age out. They are not production traffic.


## Admin dashboard validation — 2026-10-11 JST

- Dedicated mrs-analytics-admin Worker deployed to https://mrs-analytics-admin.mrsworkspjt.workers.dev/ using the production D1 binding. Collection Worker unchanged.
- 12 Node tests passed (7 collection, 5 admin): signed JWT/issuer/audience/email/expiry checks, unauthenticated routes and assets, date/site validation, daily aggregates, gaps before measurement, read-only methods and generic error responses.
- Live cloud browser: both dashboard root and /api/report redirect unauthenticated visitors to the configured Cloudflare Access email/PIN sign-in page. No counts are exposed in that page. No PIN was requested during verification.
- Access configuration read back: full-host protection; one exact-email Allow policy; one-time PIN provider only; HttpOnly cookie; admin preview URLs disabled. ADMIN_EMAIL is a Worker secret. Existing collection workers.dev remains enabled.
- Terminal HTTP checks were blocked by the execution environment and are not treated as evidence of the site's response.
- Authenticated live dashboard/API and physical iPhone/Safari display remain pending the owner's email/PIN login. Local Chromium download was unavailable, so no local rendered-browser test is claimed.
- No production analytics events were added by these admin checks. No D1 schema/data writes or collection-client changes were made.
- Source is submitted as a review branch/draft PR; main is not merged automatically. GitHub automatic deployment remains unconfigured.

Earlier Phase 2 production-pending notes above describe the pre-activation checkpoint. Production collection has since been approved, merged and enabled; the initial production verification added one test pageview on 2026-10-11.


## Three-home rollout preview — 2026-10-11 JST

- Common Worker/client supports exact site-to-host pairs for TOOLS, WORKS and GAMES homes; nested apps and policy pages are excluded by client path checks.
- 15 tests passed, including independent per-site caps/uniques, cross-site payload rejection, matching production/preview hosts, offline/storage failure, JWT protection, and per-site measurement start dates.
- Migration 0002 adds sites.measured_since and registers WORKS/GAMES as disabled until separate activation. Only preview D1 has received it during review; production D1, collector, admin and TOOLS page are unchanged.
- WORKS preview https://32e4b885.mrs-works.pages.dev/ deployed from 0d694e9c1fa975e690ddeb383791b8cf389d7625. Cloud browser first load + reload recorded 2 pageviews and 1 daily unique in preview D1 for works-home. Existing visible links/content remained available.
- Maximum three-home accepted events: 3,000/day; existing bounded cleanup capacity 6,000/day. Other account quota usage is still not established; no guarantee is made for abusive request loads.
- Production release must use the actual JST activation date per site. Keep new sites disabled before Pages release and verify each independently; no fabricated backfill.
- Physical iPhone/Safari verification and production release remain pending owner preview review/merge instruction. Automated local rendered-browser checks unavailable; cloud-browser checks are recorded separately.

- GAMES preview https://eb69c5aa.mrs-games.pages.dev/ deployed from c28d0294335105da2088557f074e14e28794349d. Cloud browser first load + reload recorded 2 pageviews and 1 daily unique in preview D1 for games-home. Existing game links/content remained available.

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

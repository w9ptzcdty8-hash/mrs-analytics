# Phase 2 validation — 2026-10-11 JST

## Passed

- 7 Node/SQLite tests: pageview and daily unique aggregation, duplicate event, missing daily ID, source isolation, malformed/stale payload, quota, retention, JST midnight, browser-code offline and localStorage failure paths.
- Live Cloudflare browser: load then reload of TOOLS preview -> D1 shows 2 pageviews and 1 daily unique.
- Stop button: state retained across reload, D1 counts unchanged.
- D1 read from ChatGPT: works for new preview and production databases. Production daily_stats is empty.
- Both Pages previews deployed successfully. Production Worker collection returns 503 while disabled.

- Live Worker concurrent duplicate: two 204 responses for the same event. Together with same-ID repeat and no-ID event, D1 confirms final totals of 5 pageviews, 2 daily unique visitors and 1 unclassified pageview (3 new pageviews, 1 new unique, 1 new unclassified).

## Not verified

- iPhone/Safari physical device and mobile viewport layout.
- Live hourly Cron execution and expiry after 30 days (the cleanup code was verified locally).
- Production collection, pending explicit merge/activation approval.
- Account plan and total existing quota usage (subscription read lacks permission).
- Automated Playwright browser test in test/preview-browser.cjs: not run because the local browser binary is unavailable. Use the supplied harness with an installed official Playwright Chromium browser; cloud-browser checks above were run separately.

Raw test visits reside only in the preview DB and will age out. They are not production traffic.

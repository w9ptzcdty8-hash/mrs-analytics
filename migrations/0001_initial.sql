PRAGMA foreign_keys = ON;
CREATE TABLE sites (
  site_id TEXT PRIMARY KEY,
  service TEXT NOT NULL CHECK(service IN ('WORKS','GAMES','TOOLS')),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('home','app')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE access_events (
  event_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(site_id),
  received_at INTEGER NOT NULL,
  day_jst TEXT NOT NULL,
  visitor_id TEXT
);
CREATE INDEX events_unique_lookup ON access_events(site_id, day_jst, visitor_id);
CREATE INDEX events_retention ON access_events(received_at);
CREATE TABLE daily_stats (
  day_jst TEXT NOT NULL,
  site_id TEXT NOT NULL REFERENCES sites(site_id),
  pageviews INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  unclassified_pageviews INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day_jst, site_id)
);
-- Runs only for a genuinely new event. All work is in the INSERT transaction.
CREATE TRIGGER aggregate_access AFTER INSERT ON access_events BEGIN
  INSERT INTO daily_stats(day_jst, site_id, pageviews, unique_visitors, unclassified_pageviews)
  VALUES (NEW.day_jst, NEW.site_id, 1,
    CASE WHEN NEW.visitor_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM access_events
      WHERE site_id=NEW.site_id AND day_jst=NEW.day_jst AND visitor_id=NEW.visitor_id
        AND event_id<>NEW.event_id
    ) THEN 1 ELSE 0 END,
    CASE WHEN NEW.visitor_id IS NULL THEN 1 ELSE 0 END)
  ON CONFLICT(day_jst, site_id) DO UPDATE SET
    pageviews=pageviews+excluded.pageviews,
    unique_visitors=unique_visitors+excluded.unique_visitors,
    unclassified_pageviews=unclassified_pageviews+excluded.unclassified_pageviews;
END;
INSERT INTO sites(site_id, service, name, kind) VALUES ('tools-home','TOOLS','MRS TOOLS トップ','home');

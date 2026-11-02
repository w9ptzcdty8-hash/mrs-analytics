-- Migration 0003: add KIDS service and register known app sites.
-- Apply to a BACKED-UP PREVIEW DB and validate before touching production.
-- D1 migrations use a transaction. Defer FK enforcement during the table rebuild.
-- Recreate the linked tables so existing foreign keys refer to the new sites table.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE sites_new (
 site_id TEXT PRIMARY KEY,
 service TEXT NOT NULL CHECK(service IN ('WORKS','GAMES','TOOLS','KIDS')),
 name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('home','app')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 measured_since TEXT
);
CREATE TABLE access_events_new (
 event_id TEXT PRIMARY KEY,
 site_id TEXT NOT NULL REFERENCES sites(site_id),
 received_at INTEGER NOT NULL,
 day_jst TEXT NOT NULL,
 visitor_id TEXT
);
CREATE TABLE daily_stats_new (
 day_jst TEXT NOT NULL,
 site_id TEXT NOT NULL REFERENCES sites(site_id),
 pageviews INTEGER NOT NULL DEFAULT 0,
 unique_visitors INTEGER NOT NULL DEFAULT 0,
 unclassified_pageviews INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day_jst,site_id)
);
INSERT INTO sites_new SELECT site_id,service,name,kind,enabled,measured_since FROM sites;
INSERT INTO access_events_new SELECT event_id,site_id,received_at,day_jst,visitor_id FROM access_events;
INSERT INTO daily_stats_new SELECT day_jst,site_id,pageviews,unique_visitors,unclassified_pageviews FROM daily_stats;

DROP TABLE access_events;
DROP TABLE daily_stats;
DROP TABLE sites;
ALTER TABLE sites_new RENAME TO sites;
ALTER TABLE access_events_new RENAME TO access_events;
ALTER TABLE daily_stats_new RENAME TO daily_stats;
CREATE INDEX events_unique_lookup ON access_events(site_id,day_jst,visitor_id);
CREATE INDEX events_retention ON access_events(received_at);
CREATE TRIGGER aggregate_access AFTER INSERT ON access_events BEGIN
 INSERT INTO daily_stats(day_jst,site_id,pageviews,unique_visitors,unclassified_pageviews)
 VALUES (NEW.day_jst,NEW.site_id,1,
 CASE WHEN NEW.visitor_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM access_events WHERE site_id=NEW.site_id AND day_jst=NEW.day_jst
 AND visitor_id=NEW.visitor_id AND event_id<>NEW.event_id) THEN 1 ELSE 0 END,
 CASE WHEN NEW.visitor_id IS NULL THEN 1 ELSE 0 END)
 ON CONFLICT(day_jst,site_id) DO UPDATE SET
 pageviews=pageviews+excluded.pageviews,
 unique_visitors=unique_visitors+excluded.unique_visitors,
 unclassified_pageviews=unclassified_pageviews+excluded.unclassified_pageviews;
END;

-- Keep new sites disabled until the corresponding app has been instrumented.
INSERT INTO sites(site_id,service,name,kind,enabled,measured_since) VALUES
('kids-home','KIDS','MRS KIDS トップ','home',0,NULL),
('dice-and-coin','TOOLS','Dice & Coin','app',0,NULL),
('garagara-pon','TOOLS','ガラガラポン','app',0,NULL),
('photo-memo','TOOLS','Photo Memo','app',0,NULL),
('metronome','TOOLS','Metronome','app',0,NULL),
('visual-timer','TOOLS','Visual Timer','app',0,NULL),
('jan-code-reader','TOOLS','JAN CODE READER','app',0,NULL),
('whistle-master','GAMES','Whistle Master','app',0,NULL),
('honki-janken','GAMES','本気じゃんけん','app',0,NULL),
('jigsaw-puzzle','GAMES','Jigsaw Puzzle','app',0,NULL),
('abc-balloons','KIDS','ABCふうせん','app',0,NULL),
('yubisaki-hanabi','KIDS','ゆびさき花火大会','app',0,NULL),
('oto-no-button','KIDS','おとのボタン','app',0,NULL),
('sawatte-english','KIDS','さわってEnglish！','app',0,NULL);
PRAGMA foreign_key_check;

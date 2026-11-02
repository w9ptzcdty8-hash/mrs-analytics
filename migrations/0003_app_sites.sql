-- Migration 0003: broaden site categories to KIDS and register approved app hosts.
-- Apply to PREVIEW first after a backup. PRAGMA foreign_keys=OFF must run
-- outside a transaction; run integrity checks before production release.
PRAGMA foreign_keys=OFF;
CREATE TABLE sites_new (
  site_id TEXT PRIMARY KEY,
  service TEXT NOT NULL CHECK(service IN ('WORKS','GAMES','TOOLS','KIDS')),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('home','app')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  measured_since TEXT
);
INSERT INTO sites_new(site_id,service,name,kind,enabled,measured_since)
SELECT site_id,service,name,kind,enabled,measured_since FROM sites;
DROP TABLE sites;
ALTER TABLE sites_new RENAME TO sites;
PRAGMA foreign_keys=ON;
-- New entries default disabled and are activated only when instrumentation is live.
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

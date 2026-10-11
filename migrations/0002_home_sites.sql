-- Apply once after 0001. Existing counts and raw events are untouched.
-- New sites remain disabled until each production home is released.
ALTER TABLE sites ADD COLUMN measured_since TEXT;
UPDATE sites SET measured_since='2026-10-11' WHERE site_id='tools-home';
INSERT INTO sites(site_id,service,name,kind,enabled,measured_since) VALUES
 ('works-home','WORKS','MRS WORKS トップ','home',0,NULL),
 ('games-home','GAMES','MRS GAMES トップ','home',0,NULL);

-- Parameterized read-only queries. All days use JST.
-- Yesterday / selected date: bind YYYY-MM-DD.
SELECT s.service, s.name, d.* FROM daily_stats d JOIN sites s USING(site_id) WHERE day_jst=?;
-- Period ranking, apps only. Bind inclusive start/end YYYY-MM-DD.
SELECT s.site_id,s.name,SUM(d.pageviews) AS pageviews,SUM(d.unique_visitors) AS daily_unique_sum
FROM daily_stats d JOIN sites s USING(site_id)
WHERE d.day_jst BETWEEN ? AND ? AND s.kind='app'
GROUP BY s.site_id ORDER BY pageviews DESC;
-- Tool trend: bind site ID, inclusive start/end.
SELECT day_jst,pageviews,unique_visitors,unclassified_pageviews FROM daily_stats
WHERE site_id=? AND day_jst BETWEEN ? AND ? ORDER BY day_jst;

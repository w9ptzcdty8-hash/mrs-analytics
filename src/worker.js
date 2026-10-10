const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 512;
export function jstDay(time) {
  return new Date(time + 9 * 3600000).toISOString().slice(0, 10);
}
function allowedOrigin(origin, env) {
  if (env.MODE === 'production') return origin === 'https://mrs-tools.pages.dev';
  // Isolated preview worker/DB: only this project's deployment hosts, never production.
  try {
    const u = new URL(origin);
    return u.origin === origin && u.protocol === 'https:' &&
      /^[a-z0-9-]+\.mrs-tools\.pages\.dev$/.test(u.hostname);
  } catch { return false; }
}
function reply(status, origin, text = '') {
  return new Response(status === 204 ? null : text, {
    status, headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store', 'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
async function smallJson(request) {
  if (!request.body) throw new Error('body');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}
export async function cleanup(env, time) {
  const cutoff = Math.floor(time / 1000) - 30 * 86400;
  const oldDay = jstDay(time - 1096 * 86400000);
  // Hourly, bounded work. 6,000 events/day capacity vs a 1,000/day pilot cap.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM access_events WHERE event_id IN (SELECT event_id FROM access_events WHERE received_at < ? ORDER BY received_at LIMIT 250)').bind(cutoff),
    env.DB.prepare('DELETE FROM daily_stats WHERE rowid IN (SELECT rowid FROM daily_stats WHERE day_jst < ? ORDER BY day_jst LIMIT 100)').bind(oldDay)
  ]);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({service: 'mrs-analytics', mode: env.MODE}, {headers: {'Cache-Control':'no-store'}});
    }
    if (url.pathname !== '/v1/collect' || url.search) return new Response(null, {status:404});
    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigin(origin, env)) return new Response(null, {status:403});
    if (request.method === 'OPTIONS') return reply(204, origin);
    if (request.method !== 'POST') return reply(405, origin);
    if (env.ENABLED !== 'true') return reply(503, origin);
    const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim();
    if (!['text/plain','application/json'].includes(contentType)) return reply(415, origin);
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BYTES) return reply(413, origin);
    let payload;
    try { payload = await smallJson(request); } catch { return reply(400, origin); }
    if (!payload || Array.isArray(payload) || typeof payload !== 'object' ||
      Object.keys(payload).some(k => !['site_id','event_id','visitor_id','day_jst'].includes(k)) ||
      payload.site_id !== 'tools-home' || !UUID.test(payload.event_id || '') ||
      !(payload.visitor_id === null || UUID.test(payload.visitor_id || ''))) return reply(400, origin);
    const now = Date.now(); const day = jstDay(now);
    if (payload.day_jst !== day) return reply(409, origin, 'day_changed');
    const cap = Number(env.DAILY_CAP);
    if (!Number.isSafeInteger(cap) || cap < 1 || cap > 1000) return reply(503, origin);
    try {
      const result = await env.DB.prepare(`INSERT INTO access_events(event_id,site_id,received_at,day_jst,visitor_id)
        SELECT ?,site_id,?,?,? FROM sites WHERE site_id=? AND enabled=1
        AND COALESCE((SELECT pageviews FROM daily_stats WHERE day_jst=? AND site_id=?),0) < ?
        ON CONFLICT(event_id) DO NOTHING`).bind(
          payload.event_id, Math.floor(now / 1000), day,
          payload.visitor_id, payload.site_id, day, payload.site_id, cap
        ).run();
      if (result.meta.changes === 0) {
        const duplicate = await env.DB.prepare('SELECT event_id FROM access_events WHERE event_id=? AND site_id=?').bind(payload.event_id,payload.site_id).first();
        if (!duplicate) return reply(429, origin);
      }
      return reply(204, origin);
    } catch {
      // Do not log payloads, headers, IPs or database errors containing bound data.
      return reply(503, origin);
    }
  },
  async scheduled(controller, env) { await cleanup(env, controller.scheduledTime); }
};

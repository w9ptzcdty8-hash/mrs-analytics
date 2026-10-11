import {createRemoteJWKSet, jwtVerify} from 'jose';
import html from './index.html?text';
import css from './styles.css?text';
import js from './app.js?text';

const ISSUER = 'https://mrsworkspjt.cloudflareaccess.com';
const keys = createRemoteJWKSet(new URL(ISSUER + '/cdn-cgi/access/certs'), {timeoutDuration:3000});
const DAY = 86400000;
const assets = new Map([
  ['/', [html, 'text/html;charset=UTF-8']],
  ['/styles.css', [css, 'text/css;charset=UTF-8']],
  ['/app.js', [js, 'text/javascript;charset=UTF-8']]
]);
const headers = {
  'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex, nofollow',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
function json(data, status=200) {return Response.json(data, {status, headers});}
export function jstDay(time) {return new Date(time + 9*3600000).toISOString().slice(0,10);}
function dateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
  const time=Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===value ? time : NaN;
}
export function range(params, today) {
  const end=params.get('end') || today;
  const start=params.get('start') || new Date(dateTime(end)-6*DAY).toISOString().slice(0,10);
  const a=dateTime(start), b=dateTime(end), now=dateTime(today);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a>b || b>now || a<now-1096*DAY || b-a>365*DAY) throw Error('range');
  const site=params.get('site') || '';
  if (site && !/^[a-z0-9-]{1,80}$/.test(site)) throw Error('site');
  if ([...params.keys()].some(k=>!['start','end','site'].includes(k)) || [...params.keys()].some(k=>params.getAll(k).length!==1)) throw Error('query');
  return {start,end,site};
}
export async function verifyToken(token, env, jwks=keys) {
  if (!token || token.length>16384 || !env.POLICY_AUD || !env.ADMIN_EMAIL) throw Error('auth');
  const {payload}=await jwtVerify(token,jwks,{issuer:ISSUER,audience:env.POLICY_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email']});
  if (typeof payload.email!=='string' || payload.email.toLowerCase()!==env.ADMIN_EMAIL.toLowerCase()) throw Error('identity');
}
export async function report(env, params, time=Date.now()) {
  const today=jstDay(time), yesterday=jstDay(time-DAY);
  const {start,end,site}=range(params,today);
  const sites=await env.DB.prepare('SELECT site_id,service,name,kind,measured_since FROM sites WHERE enabled=1 AND measured_since IS NOT NULL ORDER BY service,name LIMIT 501').all();
  if (sites.results.length>500) throw Error('too_many_sites');
  if (site && !sites.results.some(s=>s.site_id===site)) return {error:'対象サイトが見つかりません。',status:404};
  const filter=site?' AND d.site_id=?':'';
  const bind=(sql,a,b)=>env.DB.prepare(sql).bind(a,b,...(site?[site]:[]));
  const sums='SUM(d.pageviews) AS pageviews,SUM(d.unique_visitors) AS unique_visitors,SUM(d.unclassified_pageviews) AS unclassified_pageviews';
  const [days,cards,ranking]=await env.DB.batch([
    bind(`SELECT d.day_jst,${sums} FROM daily_stats d JOIN sites s ON s.site_id=d.site_id WHERE s.enabled=1 AND d.day_jst BETWEEN ? AND ?${filter} GROUP BY d.day_jst ORDER BY d.day_jst`,start,end),
    bind(`SELECT d.day_jst,${sums} FROM daily_stats d JOIN sites s ON s.site_id=d.site_id WHERE s.enabled=1 AND d.day_jst BETWEEN ? AND ?${filter} GROUP BY d.day_jst ORDER BY d.day_jst`,yesterday,today),
    bind(`SELECT d.site_id,s.name,s.service,${sums} FROM daily_stats d JOIN sites s ON s.site_id=d.site_id WHERE s.enabled=1 AND d.day_jst BETWEEN ? AND ?${filter} GROUP BY d.site_id,s.name,s.service ORDER BY pageviews DESC,d.site_id LIMIT 500`,start,end)
  ]);
  const recorded=new Map(days.results.map(d=>[d.day_jst,d]));
  const since=site ? sites.results.find(s=>s.site_id===site).measured_since : sites.results.map(s=>s.measured_since).sort()[0];
  const daily=[];
  for(let t=dateTime(start);t<=dateTime(end);t+=DAY) {
    const day=new Date(t).toISOString().slice(0,10);
    daily.push(recorded.get(day) || {day_jst:day,pageviews:(!since || day<since)?null:0,unique_visitors:(!since || day<since)?null:0,unclassified_pageviews:(!since || day<since)?null:0});
  }
  const lookup=day=>cards.results.find(d=>d.day_jst===day) || {day_jst:day,pageviews:(!since || day<since)?null:0,unique_visitors:(!since || day<since)?null:0,unclassified_pageviews:(!since || day<since)?null:0};
  const total=daily.reduce((a,d)=>({pageviews:a.pageviews+(d.pageviews || 0),daily_unique_sum:a.daily_unique_sum+(d.unique_visitors || 0),unclassified_pageviews:a.unclassified_pageviews+(d.unclassified_pageviews || 0)}),{pageviews:0,daily_unique_sum:0,unclassified_pageviews:0});
  return {timezone:'Asia/Tokyo',generated_at:new Date(time).toISOString(),measured_since:since,today:lookup(today),yesterday:lookup(yesterday),start,end,site,sites:sites.results,daily,total,ranking:ranking.results};
}
// Injection is used only by local tests; the deployed export always validates Access JWTs.
export function createHandler(authenticate=verifyToken) {
  return {async fetch(request, env) {
    try {await authenticate(request.headers.get('Cf-Access-Jwt-Assertion'),env);} catch {return json({error:'ログインが必要です。'},403);}
    if (request.method!=='GET' && request.method!=='HEAD') return json({error:'読み取り専用です。'},405);
    const url=new URL(request.url);
    if (url.pathname==='/api/report' && request.method==='GET') {
      try {
        range(url.searchParams,jstDay(Date.now()));
      } catch {return json({error:'期間は有効な日付で、今日までの366日以内を指定してください。'},400);}
      try {const data=await report(env,url.searchParams);return data.error?json({error:data.error},data.status):json(data);} catch {return json({error:'集計を取得できませんでした。時間をおいて再度お試しください。'},503);}
    }
    const asset=assets.get(url.pathname);
    if (!asset || url.search) return json({error:'ページが見つかりません。'},404);
    return new Response(request.method==='HEAD'?null:asset[0],{headers:{...headers,'Content-Type':asset[1]}});
  }};
}
export default createHandler();

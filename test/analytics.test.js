import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker, {jstDay,cleanup} from '../src/worker.js';
const schema = readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
function environment() {
  const db=new DatabaseSync(':memory:'); db.exec(schema); db.exec(readFileSync(new URL('../migrations/0002_home_sites.sql',import.meta.url),'utf8'));
  const wrap=(sql,params=[])=>({
    bind(...p){return wrap(sql,p);},
    async run(){const before=db.prepare('SELECT total_changes() AS n').get().n;
      const r=db.prepare(sql).run(...params);
      return {meta:{changes:Number(r.changes),totalChanges:db.prepare('SELECT total_changes() AS n').get().n-before}};},
    async first(){return db.prepare(sql).get(...params)||null;}
  });
  return {db,env:{MODE:'preview',ENABLED:'true',DAILY_CAP:'1000',DB:{prepare:wrap,async batch(stmts){db.exec('BEGIN');try{const r=[];for(const s of stmts)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}}};
}
function payload(visitor=crypto.randomUUID()) {return {site_id:'tools-home',event_id:crypto.randomUUID(),day_jst:jstDay(Date.now()),visitor_id:visitor};}
function request(body,origin='https://feature-analytics.mrs-tools.pages.dev') {
  return new Request('https://example.workers.dev/v1/collect',{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:JSON.stringify(body)});
}
test('pageviews, day uniques, missing IDs and duplicate event are atomically aggregated',async()=>{
  const {db,env}=environment();const id=crypto.randomUUID();const first=payload(id);
  for(const p of [first,first,payload(id),payload(),payload(null)]) assert.equal((await worker.fetch(request(p),env)).status,204);
  const d=db.prepare('SELECT * FROM daily_stats').get();
  assert.equal(d.pageviews,4);assert.equal(d.unique_visitors,2);assert.equal(d.unclassified_pageviews,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM access_events').get().n,4);
});
test('origin isolation, malformed payload, stale day and failure never write',async()=>{
  const {db,env}=environment();
  assert.equal((await worker.fetch(request(payload(),'https://mrs-tools.pages.dev'),env)).status,403);
  assert.equal((await worker.fetch(request(payload(),'https://evil.mrs-tools.pages.dev.evil.example'),env)).status,403);
  assert.equal((await worker.fetch(request({...payload(),day_jst:'2000-01-01'}),env)).status,409);
  assert.equal((await worker.fetch(request({...payload(),email:'private'}),env)).status,400);
  assert.equal((await worker.fetch(request({...payload(),site_id:'world-time-clock'}),env)).status,400);
  assert.equal((await worker.fetch(request({...payload(),extra:'x'.repeat(600)}),env)).status,400);
  assert.equal(db.prepare('SELECT count(*) AS n FROM access_events').get().n,0);
  assert.equal((await worker.fetch(request(payload()),{...env,DB:{prepare(){throw Error('private');}}})).status,503);
});
test('pilot cap is enforced inside INSERT, duplicate remains safe',async()=>{
  const {db,env}=environment();env.DAILY_CAP='1';const first=payload();
  assert.equal((await worker.fetch(request(first),env)).status,204);
  assert.equal((await worker.fetch(request(first),env)).status,204);
  assert.equal((await worker.fetch(request(payload()),env)).status,429);
  assert.equal(db.prepare('SELECT pageviews FROM daily_stats').get().pageviews,1);
});
test('retention purges events without subtracting aggregate counts',async()=>{
  const {db,env}=environment();await worker.fetch(request(payload()),env);
  await cleanup(env,Date.now()+31*86400000);
  assert.equal(db.prepare('SELECT count(*) AS n FROM access_events').get().n,0);
  assert.equal(db.prepare('SELECT pageviews FROM daily_stats').get().pageviews,1);
});
test('JST midnight boundary is independent of UTC day',()=>{
  assert.equal(jstDay(Date.parse('2026-10-10T14:59:59Z')),'2026-10-10');
  assert.equal(jstDay(Date.parse('2026-10-10T15:00:00Z')),'2026-10-11');
});
const client=readFileSync(new URL('../client/analytics.js',import.meta.url),'utf8');
function browser({storage=new Map(),offline=false,blocked=false,site='tools-home',host='mrs-tools.pages.dev',path='/'}={}) {
  const pending=[];const calls=[];const handlers={};
  const localStorage={getItem(k){if(blocked)throw Error('denied');return storage.get(k)||null;},setItem(k,v){if(blocked)throw Error('denied');storage.set(k,v);},removeItem(k){storage.delete(k);}};
  const ctx={document:{currentScript:{dataset:{siteId:site}},getElementById(){return null;},visibilityState:'visible',addEventListener(k,v){handlers[k]=v;}},location:{origin:'https://'+host,hostname:host,pathname:path},navigator:{onLine:!offline},localStorage,crypto,Date,JSON,AbortController,setTimeout(fn,ms){if(ms===0)pending.push(fn);return 1;},clearTimeout(){},async fetch(url,options){calls.push({url,options});throw Error('network');}};
  vm.runInNewContext(client,ctx);return {calls,handlers,ctx,async flush(){for(const fn of pending.splice(0))fn();await new Promise(r=>setImmediate(r));}};
}
test('client reuses day ID but new event per load; resume sends nothing extra',async()=>{
  const storage=new Map();const a=browser({storage});await a.flush();
  a.handlers.visibilitychange();await a.flush();assert.equal(a.calls.length,1);
  const b=browser({storage});await b.flush();const p=JSON.parse(a.calls[0].options.body),q=JSON.parse(b.calls[0].options.body);
  assert.equal(p.visitor_id,q.visitor_id);assert.notEqual(p.event_id,q.event_id);
  assert.equal(a.calls[0].options.referrerPolicy,'no-referrer');
});
test('offline sends nothing; blocked storage counts without identity',async()=>{
  const offline=browser({offline:true});await offline.flush();assert.equal(offline.calls.length,0);
  const b=browser({blocked:true});await b.flush();assert.equal(JSON.parse(b.calls[0].options.body).visitor_id,null);
});

test('three homes have origin/site isolation and independent daily caps and uniques',async()=>{
 const {db,env}=environment();db.exec("UPDATE sites SET enabled=1,measured_since='2026-10-11';");env.DAILY_CAP='1';
 const id=crypto.randomUUID();
 for(const [site,host] of [['tools-home','mrs-tools'],['works-home','mrs-works'],['games-home','mrs-games']]) {
  const p={...payload(id),site_id:site};
  assert.equal((await worker.fetch(request(p,'https://branch.'+host+'.pages.dev'),env)).status,204);
  assert.equal((await worker.fetch(request({...p,event_id:crypto.randomUUID()},'https://branch.'+host+'.pages.dev'),env)).status,429);
  assert.equal((await worker.fetch(request({...p,site_id:site==='tools-home'?'works-home':'tools-home'},'https://branch.'+host+'.pages.dev'),env)).status,400);
  assert.equal((await worker.fetch(request({...p,event_id:crypto.randomUUID()},'https://'+host+'.pages.dev'),env)).status,403);
  assert.equal((await worker.fetch(request(p,'https://'+host+'.pages.dev'),{...env,MODE:'production'})).status,204);
 }
 assert.equal(db.prepare('SELECT SUM(pageviews) AS n FROM daily_stats').get().n,3);
 assert.equal(db.prepare('SELECT SUM(unique_visitors) AS n FROM daily_stats').get().n,3);
 assert.equal((await worker.fetch(request(payload(),'https://evil.mrs-games.pages.dev.evil.example'),env)).status,403);
});
test('common client measures only its matching home and selects isolated preview endpoint',async()=>{
 for(const [site,host] of [['tools-home','mrs-tools.pages.dev'],['works-home','mrs-works.pages.dev'],['games-home','mrs-games.pages.dev']]) {
  const a=browser({site,host});await a.flush();assert.equal(a.calls.length,1);assert.equal(JSON.parse(a.calls[0].options.body).site_id,site);assert.ok(a.calls[0].url.includes('mrs-analytics.mrsworkspjt'));
  const b=browser({site,host:'branch.'+host});await b.flush();assert.ok(b.calls[0].url.includes('mrs-analytics-preview.'));
  for(const options of [{site,host,path:'/privacy'},{site,host,path:'/game/'},{site,host:host+'.evil.test'},{site,host:'mrs-tools.pages.dev',...(site==='tools-home'?{site:'works-home'}:{})}]) {const c=browser(options);await c.flush();assert.equal(c.calls.length,0);}
 }
});

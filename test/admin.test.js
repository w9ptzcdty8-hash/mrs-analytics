import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import worker,{createHandler,verifyToken,range,report} from '../admin/.build/worker.mjs';
const issuer='https://mrsworkspjt.cloudflareaccess.com';
const {publicKey,privateKey}=await generateKeyPair('RS256');
const jwk=await exportJWK(publicKey);jwk.kid='local-test-key';
const keys=createLocalJWKSet({keys:[jwk]});
const authEnv={POLICY_AUD:'test-audience',ADMIN_EMAIL:'admin@example.test',MEASURED_SINCE:'2026-10-11'};
async function token(overrides={},expires='1h',algorithm='RS256') {
  return new SignJWT({email:'admin@example.test',...overrides}).setProtectedHeader({alg:algorithm,kid:jwk.kid}).setIssuer(issuer).setAudience('test-audience').setSubject('test-user').setIssuedAt().setExpirationTime(expires).sign(privateKey);
}
function database() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0002_home_sites.sql',import.meta.url),'utf8'));
  const queries=[];
  const wrap=(sql,params=[])=>({bind(...p){return wrap(sql,p);},async all(){queries.push(sql);assert.match(sql,/^SELECT /);return {success:true,results:db.prepare(sql).all(...params)};}});
  return {db,queries,env:{...authEnv,DB:{prepare:wrap,async batch(s){return Promise.all(s.map(x=>x.all()));}}}};
}
test('Access JWT signature, audience, issuer, expiration and exact email are required',async()=>{
  await verifyToken(await token(),authEnv,keys);
  await assert.rejects(()=>verifyToken(null,authEnv,keys));
  await assert.rejects(()=>verifyToken(awaitable,authEnv,keys));
  const valid=await token();await assert.rejects(()=>verifyToken(valid,{...authEnv,POLICY_AUD:'wrong'},keys));
  await assert.rejects(()=>verifyToken(valid,{...authEnv,ADMIN_EMAIL:undefined},keys));
  await assert.rejects(async()=>verifyToken(await token({email:'other@example.test'}),authEnv,keys));
  await assert.rejects(async()=>verifyToken(await token({},'-1h'),authEnv,keys));
  const wrongIssuer=await new SignJWT({email:authEnv.ADMIN_EMAIL}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer('https://evil.example').setAudience(authEnv.POLICY_AUD).setSubject('x').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  await assert.rejects(()=>verifyToken(wrongIssuer,authEnv,keys));
  const forged=valid.split('.');forged[2]=(forged[2][0]==='a'?'b':'a')+forged[2].slice(1);
  await assert.rejects(()=>verifyToken(forged.join('.'),authEnv,keys));
});
const awaitable='not.a.valid-token';
test('unauthenticated assets and API do not touch the database',async()=>{
  const {env,queries}=database();
  for(const path of ['/','/styles.css','/app.js','/api/report','/api/report?sql=SELECT']) {
    const response=await worker.fetch(new Request('https://admin.example'+path),env);
    assert.equal(response.status,403);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  }
  assert.equal(queries.length,0);
});
test('date range validation rejects malformed dates, future dates, duplicate parameters and SQL input',()=>{
  assert.deepEqual(range(new URLSearchParams('start=2026-10-05&end=2026-10-11'),'2026-10-11'),{start:'2026-10-05',end:'2026-10-11',site:''});
  for(const query of ['end=2026-02-30','start=2026-10-12','end=2026-10-12','start=2025-01-01','site=x%27','sql=DROP','start=2026-10-01&start=2026-10-02','start=2026-10-11&end=2026-10-01'])assert.throws(()=>range(new URLSearchParams(query),'2026-10-11'));
});
test('report totals, daily gaps and site filtering read only aggregate tables',async()=>{
  const {db,env,queries}=database();
  db.exec("INSERT INTO daily_stats VALUES ('2026-10-11','tools-home',5,3,1);INSERT INTO daily_stats VALUES ('2026-10-13','tools-home',2,1,0);");
  const data=await report(env,new URLSearchParams('start=2026-10-10&end=2026-10-13&site=tools-home'),Date.parse('2026-10-13T03:00:00Z'));
  assert.equal(data.daily[0].pageviews,null);assert.equal(data.daily[2].pageviews,0);
  assert.deepEqual(data.total,{pageviews:7,daily_unique_sum:4,unclassified_pageviews:1});
  assert.equal(data.today.pageviews,2);assert.equal(data.yesterday.pageviews,0);assert.equal(data.ranking[0].name,'MRS TOOLS トップ');
  assert.equal(queries.length,4);assert.ok(queries.every(q=>!q.includes('access_events')));
  assert.equal((await report(env,new URLSearchParams('site=missing'),Date.parse('2026-10-13T03:00:00Z'))).status,404);
});
test('authenticated handler serves protected assets, rejects writes and handles invalid ranges and DB failures',async()=>{
  const handler=createHandler((t,e)=>verifyToken(t,e,keys));const t=await token();const {env}=database();
  const req=(path,method='GET')=>new Request('https://admin.example'+path,{method,headers:{'Cf-Access-Jwt-Assertion':t}});
  for(const path of ['/','/styles.css','/app.js']){const r=await handler.fetch(req(path),env);assert.equal(r.status,200);assert.ok(r.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));}
  assert.equal((await handler.fetch(req('/api/report','POST'),env)).status,405);
  assert.equal((await handler.fetch(req('/api/report?end=bad'),env)).status,400);
  assert.equal((await handler.fetch(req('/api/report?site=missing'),env)).status,404);
  const broken={...env,DB:{prepare(){throw Error('sensitive-db-message');}}};const r=await handler.fetch(req('/api/report'),broken);assert.equal(r.status,503);assert.ok(!(await r.text()).includes('sensitive-db-message'));
  assert.equal((await handler.fetch(req('/unknown'),env)).status,404);
});

test('later site start dates stay unmeasured; disabled sites remain absent',async()=>{
 const {db,env}=database();db.exec("UPDATE sites SET enabled=1,measured_since='2026-10-13' WHERE site_id='works-home';");
 const time=Date.parse('2026-10-13T03:00:00Z');
 const works=await report(env,new URLSearchParams('start=2026-10-11&end=2026-10-13&site=works-home'),time);
 assert.deepEqual(works.daily.map(d=>d.pageviews),[null,null,0]);assert.equal(works.yesterday.pageviews,null);assert.equal(works.measured_since,'2026-10-13');
 assert.equal(works.sites.length,2);assert.ok(!works.sites.some(s=>s.site_id==='games-home'));
 const all=await report(env,new URLSearchParams('start=2026-10-10&end=2026-10-13'),time);assert.equal(all.measured_since,'2026-10-11');assert.equal(all.daily[0].pageviews,null);
});

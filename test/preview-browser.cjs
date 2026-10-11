const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route(/adm\.shinobi\.jp|static\.cloudflareinsights\.com/,r=>r.abort());
  const page=await context.newPage();
  const endpoint='https://mrs-analytics-preview.mrsworkspjt.workers.dev/v1/collect';
  const home='https://feature-mrs-analytics.mrs-tools.pages.dev/';
  const responses=[];
  page.on('response',r=>{if(r.url()===endpoint)responses.push(r.status());});
  async function load(fn){const result=page.waitForResponse(r=>r.url()===endpoint);await fn();assert.equal((await result).status(),204);}
  await load(()=>page.goto(home));
  const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('mrs.analytics.daily.tools-home')).id);
  await load(()=>page.reload());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mrs.analytics.daily.tools-home')).id),id);
  assert.equal(await page.locator('h1').textContent(),'MRS TOOLS');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/workspace/scratch/8acc6a67f3c6/mrs-analytics-preview.png',fullPage:true});
  const duplicate=await page.evaluate(async endpoint=>{
    const record=JSON.parse(localStorage.getItem('mrs.analytics.daily.tools-home'));
    const body=JSON.stringify({site_id:'tools-home',event_id:crypto.randomUUID(),visitor_id:record.id,day_jst:record.day});
    const options={method:'POST',headers:{'Content-Type':'text/plain'},body};
    return Promise.all([fetch(endpoint,options).then(r=>r.status),fetch(endpoint,options).then(r=>r.status)]);
  },endpoint);
  assert.deepEqual(duplicate,[204,204]);
  const invalid=await page.evaluate(async endpoint=>{
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({site_id:'other'})});return r.status;
  },endpoint);assert.equal(invalid,400);
  assert.equal(await page.locator('#mrs-analytics-toggle').count(),0);
  // Failure of just the analytics API leaves the home and navigation operational.
  await page.route(endpoint,r=>r.abort());await page.reload();
  assert.equal(await page.locator('h1').textContent(),'MRS TOOLS');
  assert.ok(await page.locator('a.tool-button').count()>5);
  const output={passed:true,pageviewsExpected:3,dailyUniquesExpected:2,
    checks:['mobile layout','reload identity','concurrent duplicate','invalid payload','no stop button','analytics network failure'],statuses:responses};
  fs.writeFileSync('/workspace/scratch/8acc6a67f3c6/mrs-analytics/test/preview-result.json',JSON.stringify(output,null,2));
  console.log(JSON.stringify(output));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});

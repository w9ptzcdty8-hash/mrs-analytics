(() => {
  'use strict';
  const $=id=>document.getElementById(id), format=n=>n==null?'未計測':new Intl.NumberFormat('ja-JP').format(n);
  const DAY=86400000, today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  let active;
  function preset(days) {
    $('end').value=today;
    $('start').value=new Date(Date.parse(today+'T00:00:00Z')-(days-1)*DAY).toISOString().slice(0,10);
    document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.days)===days)));
  }
  const NS='http://www.w3.org/2000/svg';
  function svgNode(name,attrs,text) {const n=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!=null)n.textContent=text;return n;}
  function chart(days) {
    const root=$('chart');root.replaceChildren();
    const width=Math.max(300,root.clientWidth || 660);
    const svg=svgNode('svg',{viewBox:'0 0 '+width+' 220',role:'img','aria-label':'日別アクセス数の推移。詳しい数値は下の日別表で確認できます。'});
    const max=Math.max(3,Math.ceil(Math.max(...days.map(d=>d.pageviews || 0))/3)*3),plotWidth=width-72,x=i=>48+(days.length===1?plotWidth/2:i*plotWidth/(days.length-1)),y=v=>174-v/max*150;
    for(let i=0;i<=3;i++){const v=max*i/3;svg.append(svgNode('line',{x1:48,y1:y(v),x2:width-24,y2:y(v),class:'grid'}),svgNode('text',{x:40,y:y(v)+4,'text-anchor':'end'},String(Math.round(v))));}
    let path='',wasMissing=true;
    days.forEach((d,i)=>{if(d.pageviews==null){wasMissing=true;return;}path+=(wasMissing?'M':'L')+x(i)+' '+y(d.pageviews)+' ';wasMissing=false;});
    svg.append(svgNode('path',{d:path,class:'line'}));
    days.forEach((d,i)=>{if(d.pageviews!=null){const c=svgNode('circle',{cx:x(i),cy:y(d.pageviews),r:days.length>60?1.5:3,class:'dot'});c.append(svgNode('title',{},d.day_jst+'：'+format(d.pageviews)+'アクセス'));svg.append(c);}});
    const indices=[...new Set([0,Math.floor((days.length-1)/2),days.length-1])];
    indices.forEach(i=>svg.append(svgNode('text',{x:x(i),y:204,'text-anchor':i===0?'start':i===days.length-1?'end':'middle'},days[i].day_jst.slice(5))));
    root.append(svg);
  }
  function row(values) {const tr=document.createElement('tr');values.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});return tr;}
  function render(data) {
    $('today-pv').textContent=format(data.today.pageviews);$('today-uv').textContent='日別ユニーク相当 '+format(data.today.unique_visitors);
    $('yesterday-pv').textContent=format(data.yesterday.pageviews);$('yesterday-uv').textContent='日別ユニーク相当 '+format(data.yesterday.unique_visitors);
    $('period-pv').textContent=format(data.total.pageviews);$('period-uv').textContent=format(data.total.daily_unique_sum);
    $('period-label').textContent=data.start+' 〜 '+data.end+'（日本時間）';
    const selection=$('site').value;$('site').replaceChildren(new Option('計測対象すべて',''));
    data.sites.forEach(s=>$('site').add(new Option(s.name,s.site_id)));$('site').value=selection;
    $('daily').replaceChildren(...[...data.daily].reverse().map(d=>row([d.day_jst,format(d.pageviews),format(d.unique_visitors)])));
    $('ranking').replaceChildren(...data.ranking.map(d=>row([d.name,format(d.pageviews)])));
    if(!data.ranking.length)$('ranking').append(row(['この期間の記録はありません','—']));
    $('unclassified').textContent='識別IDなしのアクセス：'+format(data.total.unclassified_pageviews)+'。アクセス数には含め、ユニーク相当には含めません。';
    chart(data.daily);$('results').hidden=false;
    $('status').textContent='更新：'+new Date(data.generated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）';
  }
  async function load() {
    if(active)active.abort();const controller=new AbortController();active=controller;
    $('results').hidden=true;$('relogin').hidden=true;$('refresh').disabled=true;$('status').textContent='集計を読み込み中…';
    const timer=setTimeout(()=>controller.abort(),10000);
    try {
      if(navigator.onLine===false)throw Error('オフラインです。ネット接続後に「集計を表示」を押してください。');
      const params=new URLSearchParams({start:$('start').value,end:$('end').value});if($('site').value)params.set('site',$('site').value);
      const response=await fetch('/api/report?'+params,{credentials:'same-origin',cache:'no-store',signal:controller.signal,redirect:'error'});
      if(response.status===401||response.status===403){$('relogin').hidden=false;throw Error('ログイン期限が切れました。再ログインしてください。');}
      if(!response.headers.get('Content-Type')?.includes('application/json')){$('relogin').hidden=false;throw Error('再ログインしてから集計を表示してください。');}
      const data=await response.json();if(!response.ok)throw Error(data.error || '集計を取得できませんでした。');
      if(active===controller)render(data);
    } catch(error) {if(active===controller){$('status').textContent=controller.signal.aborted?'通信が完了しませんでした。再度お試しください。':error.message;$('relogin').hidden=false;}}
    finally {clearTimeout(timer);if(active===controller)$('refresh').disabled=false;}
  }
  $('filters').addEventListener('submit',e=>{e.preventDefault();document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed','false'));void load();});
  document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{preset(Number(b.dataset.days));void load();}));
  $('end').max=today;$('start').max=today;preset(7);void load();
})();

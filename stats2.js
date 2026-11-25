/* ---------- stats2: expenses, reports, payroll (loads after stats.js) ---------- */
let xdb;
let xKind='gas',xShots=[],xEditId=null,xTShots=[];

/* ---------- round 8: build the new expense UI in place (fields, Tesla reader, charger finder) ---------- */
(function buildExpRound8(){
 const sec=$('v-exp'); if(!sec)return;
 const formCard=sec.querySelector('.card'); if(formCard)formCard.id='xFormCard';
 const recLbl=[...formCard.querySelectorAll('label')].find(l=>/Receipt/.test(l.textContent));
 const biz=document.createElement('div');
 biz.innerHTML='<label>Business name &mdash; where did you spend it?</label><input type="text" id="x-biz" placeholder="e.g. Sheetz, Tesla Supercharger" list="xBizList" autocomplete="off"><datalist id="xBizList"></datalist><div class="row2"><div><label>Street address</label><input type="text" id="x-addr" placeholder="street number and name"></div><div><label>City</label><input type="text" id="x-city" placeholder="Raleigh"></div></div><div class="row2"><div><label>State</label><select id="x-state"><option value="">&mdash;</option></select></div><div><label>ZIP code</label><input type="text" id="x-zip" inputmode="numeric" maxlength="10" placeholder="27613"></div></div>';
 if(recLbl)formCard.insertBefore(biz,recLbl); else formCard.append(biz);
 const xSt=$('xStatus');
 const tes=document.createElement('div');
 tes.innerHTML='<label style="margin-top:16px">Tesla screen (optional &mdash; a shot of the charging screen works instead of a paper receipt)</label><input type="file" id="x-tshots" accept="image/*" multiple style="display:none"><div class="drop" id="xTDrop">tap to add the Tesla screen shot</div><div id="xTShotBox" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;"></div><button class="btn ghost small" id="xTeslaBtn" style="margin-top:10px">Read the charge info off the Tesla screen</button>';
 if(xSt)formCard.insertBefore(tes,xSt); else formCard.append(tes);
 const stabs=sec.querySelector('.subtabs');
 if(stabs){const cb=document.createElement('button');cb.className='sub';cb.id='subCharge';cb.textContent='Find chargers';stabs.append(cb);}
 const csvCard=[...sec.querySelectorAll('.card')].find(c=>c.querySelector('#expCount')); if(csvCard)csvCard.id='expCsvCard';
 const chg=document.createElement('div'); chg.className='card'; chg.id='chgCard'; chg.style.display='none';
 chg.innerHTML='<h2 class="sec anton" style="margin-bottom:4px">Tesla chargers near you</h2><div class="row2"><div><label>State</label><select id="chg-state"><option value="">&mdash;</option></select></div><div><label>ZIP code</label><input type="text" id="chg-zip" inputmode="numeric" maxlength="10" placeholder="27613"></div></div><button class="btn" id="chgBtn" style="margin-top:4px">Find Tesla chargers</button><div id="chgStatus" style="font-size:12px; color:#2F6E9E; min-height:16px; margin-top:8px;"></div><div id="chgList" style="margin-top:8px"></div><div id="chgMap" style="display:none; height:360px; border-radius:10px; border:1px solid #E4E0D4; margin-top:12px;"></div><div class="note">State + ZIP pulls the nearest Tesla Superchargers and destination chargers within about 25 miles, nearest first &mdash; widens to 50 miles if nothing turns up. Tap one to see it on the map, or open it in your maps app for directions.</div>';
 sec.append(chg);
 const lc=document.createElement('link'); lc.rel='stylesheet'; lc.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.append(lc);
 window.leafletReady=new Promise(res=>{const sc=document.createElement('script'); sc.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; sc.onload=res; sc.onerror=res; document.head.append(sc);});
})();
function openXDB(){return new Promise((res,rej)=>{const r=indexedDB.open('kcllc_expenses',1);
 r.onupgradeneeded=()=>{r.result.createObjectStore('expenses',{keyPath:'id',autoIncrement:true});};
 r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);});}
function txe(mode){return xdb.transaction('expenses',mode).objectStore('expenses');}
function putExpense(e){return new Promise((res,rej)=>{const q=txe('readwrite').put(e);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
function delExpense(id){return new Promise(res=>{txe('readwrite').delete(id).onsuccess=()=>res();});}
function allExpenses(){if(!xdb)return Promise.resolve([]);return new Promise(res=>{const q=txe('readonly').getAll();q.onsuccess=()=>res(q.result||[]);});}

/* ---------- EXPENSES (gas / energy + tax expenses, receipts attached) ---------- */
function setExpKindUI(k){xKind=k;$('subGas').classList.toggle('on',k==='gas');$('subTax').classList.toggle('on',k==='tax');
 $('x-typeLbl').textContent=k==='gas'?'What was the fuel or charge?':'What was it for? (tax-deductible)';
 $('x-type').placeholder=k==='gas'?'e.g. regular unleaded':'e.g. maintenance, meal, phone bill';}
function showExpPane(p){
 const chg=p==='chg';
 $('subGas').classList.toggle('on',p==='gas');$('subTax').classList.toggle('on',p==='tax');$('subCharge').classList.toggle('on',chg);
 $('chgCard').style.display=chg?'block':'none';
 $('xFormCard').style.display=chg?'none':'block';
 $('expTot').style.display=chg?'none':'grid';
 $('expCsvCard').style.display=chg?'none':'flex';
 $('expList').style.display=chg?'none':'block';
 if(!chg){setExpKindUI(p);resetXForm();renderExpenses();}
}
$('subGas').onclick=()=>showExpPane('gas');
$('subTax').onclick=()=>showExpPane('tax');
$('subCharge').onclick=()=>showExpPane('chg');
$('xDrop').onclick=()=>$('x-shots').click();
$('x-shots').onchange=async()=>{for(const f of [...$('x-shots').files])xShots.push(await shrink(f));drawXShots();$('x-shots').value='';};
function drawXShots(){$('xShotBox').innerHTML='';xShots.forEach(s=>{const im=new Image();im.src=s;im.onclick=()=>zoom(s);$('xShotBox').append(im);});}
$('xTDrop').onclick=()=>$('x-tshots').click();
$('x-tshots').onchange=async()=>{for(const f of [...$('x-tshots').files])xTShots.push(await shrink(f));drawXTShots();$('x-tshots').value='';};
function drawXTShots(){$('xTShotBox').innerHTML='';xTShots.forEach(s=>{const im=new Image();im.src=s;im.onclick=()=>zoom(s);$('xTShotBox').append(im);});}
function resetXForm(){['x-amt','x-type','x-notes','x-biz','x-addr','x-city','x-zip'].forEach(i=>$(i).value='');$('x-state').value='';xShots=[];drawXShots();xTShots=[];drawXTShots();xEditId=null;$('xSaveBtn').textContent='Save expense';$('xCancelBtn').style.display='none';$('xEditNote').textContent='';$('xStatus').textContent='';}
$('xCancelBtn').onclick=resetXForm;
$('xOcrBtn').onclick=async()=>{
  if(!xShots.length){$('xStatus').textContent='Add the receipt first.';return;}
  $('xStatus').textContent='Reading the receipt\u2026';
  try{
    let text='';
    try{
      const w=await Tesseract.createWorker('eng');
      await w.setParameters({tessedit_pageseg_mode:'6'});
      for(const s of xShots){const r=await w.recognize(await prep(s));text+='\n'+r.data.text;}
      await w.terminate();
    }catch(e2){
      for(const s of xShots){const r=await Tesseract.recognize(await prep(s),'eng');text+='\n'+r.data.text;}
    }
    const lines=text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    let best=null;
    lines.forEach(l=>{
      if(/change|cash back|debit|credit|auth|approved|balance/i.test(l))return;
      const m=l.match(/\$?\s?(\d{1,4}\.\d{2})\s*$/)||l.match(/\$?\s?(\d{1,4}\.\d{2})\b/);
      if(!m)return;
      const v=parseFloat(m[1]);
      const p=/total/i.test(l)?3:(/fuel|gas|gallon/i.test(l)?2:1);
      if(!best||p>best.p||(p===best.p&&v>best.v))best={v:v,p:p};
    });
    if(best){$('x-amt').value=best.v.toFixed(2);$('xStatus').textContent='Read '+money(best.v)+' off the receipt. Check it against the paper before saving.';}
    else $('xStatus').textContent='Could not pull the total off that one \u2014 type it in.';
  }catch(e){$('xStatus').textContent='The read did not land. Type the total in.';}
};
$('xSaveBtn').onclick=async()=>{
  const amt=num($('x-amt').value);
  if(amt==null){$('xStatus').textContent='Put the amount in first.';return;}
  const e={date:$('x-date').value||todayStr(),kind:xKind,type:$('x-type').value.trim(),amount:amt,biz:$('x-biz').value.trim(),addr:$('x-addr').value.trim(),city:$('x-city').value.trim(),state:$('x-state').value,zip:$('x-zip').value.trim(),notes:$('x-notes').value.trim(),shots:xShots,tshots:xTShots,created:Date.now()};
  if(xEditId)e.id=xEditId; else e.id=Date.now()+Math.floor(Math.random()*1000);
  await putExpense(e); resetXForm(); $('x-date').value=e.date; renderExpenses(); renderReports(); renderPayroll(); renderWeek();
};
async function editExpense(id){const l=await allExpenses();const e=l.find(x=>x.id===id);if(!e)return;
 xEditId=id;setExpKindUI(e.kind);
 $('x-date').value=e.date;$('x-amt').value=e.amount;$('x-type').value=e.type||'';$('x-notes').value=e.notes||'';$('x-biz').value=e.biz||'';$('x-addr').value=e.addr||'';$('x-city').value=e.city||'';$('x-state').value=e.state||'';$('x-zip').value=e.zip||'';xTShots=(e.tshots||[]).slice();drawXTShots();
 xShots=(e.shots||[]).slice();drawXShots();$('xSaveBtn').textContent='Save changes';$('xCancelBtn').style.display='inline-block';$('xEditNote').textContent='Editing a saved expense. Save changes or cancel.';}
async function killExpense(id){if(!confirm('Delete this expense? The tallies come off with it.'))return;await delExpense(id);renderExpenses();renderReports();renderPayroll();renderWeek();}
window.editExpense=editExpense;window.killExpense=killExpense;
function expCard(e){
  const addr=[e.addr,e.city,e.state,e.zip].filter(Boolean).join(', ');
  const allShots=(e.shots||[]).concat(e.tshots||[]);
  return '<div class="entry"><div class="top"><span class="pf">'+(e.kind==='gas'?'Gas / energy':'Tax expense')+(e.type?' \u00b7 '+e.type:'')+'</span><span class="amt">'+money(e.amount)+'</span></div>'+
  '<div class="meta">'+[fmtDay(e.date),e.biz,addr,e.notes].filter(Boolean).join(' \u00b7 ')+'</div>'+
  (allShots.length?'<div class="shots">'+allShots.map(s=>'<img src="'+s+'" onclick="zoom(this.src)">').join('')+'</div>':'')+'<div class="acts"><button class="btn ghost small" onclick="editExpense('+e.id+')">Edit</button><button class="btn ghost small" onclick="killExpense('+e.id+')">Delete</button></div></div>';
}
async function renderExpenses(){
  const xl=await allExpenses();xl.sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created);
  const k=xl.filter(e=>e.kind===xKind);
  const g=xl.filter(e=>e.kind==='gas').reduce((a,e)=>a+e.amount,0);
  const txa=xl.filter(e=>e.kind==='tax').reduce((a,e)=>a+e.amount,0);
  $('expCount').textContent=xl.length+' receipts on file \u00b7 '+money(g)+' gas \u00b7 '+money(txa)+' tax';
  $('expTot').innerHTML=(xKind==='gas'?totCard(money(g),'gas / energy total'):totCard(money(txa),'tax expenses total'))+totCard(k.length,'receipts on this page');
  const bizSeen={};xl.forEach(e=>{if(e.biz&&!bizSeen[e.biz])bizSeen[e.biz]=1;});$('xBizList').innerHTML=Object.keys(bizSeen).sort().map(b=>'<option>'+b+'</option>').join('');
  $('expList').innerHTML=k.length?k.map(expCard).join(''):'<div class="empty">No '+(xKind==='gas'?'gas or energy':'tax expense')+' receipts logged yet.</div>';
}
$('expCsvBtn').onclick=async()=>{const xl=await allExpenses();xl.sort((a,b)=>a.date.localeCompare(b.date));
 let c='date,kind,type,business,address,amount,notes\n';
 xl.forEach(e=>{const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  c+=[e.date,e.kind,q(e.type),q(e.biz||''),q([e.addr,e.city,e.state,e.zip].filter(Boolean).join(', ')),e.amount.toFixed(2),q(e.notes)].join(',')+'\n';});
 dl('gig-expenses-'+todayStr()+'.csv',c,'text/csv');};

/* ---------- REPORTS (day / week / month / year / all, any platform) ---------- */
function fmtD(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function rangeFilter(range,list){
 const t=todayStr(),y=t.slice(0,4),ym=t.slice(0,7);
 if(range==='day')return list.filter(e=>e.date===t);
 if(range==='week'){const d=new Date(t+'T12:00:00');const dow=(d.getDay()+6)%7;const sun=new Date(d);sun.setDate(d.getDate()-dow);const sat=new Date(sun);sat.setDate(sun.getDate()+6);
  return list.filter(e=>e.date>=fmtD(sun)&&e.date<=fmtD(sat));}
 if(range==='month')return list.filter(e=>e.date.startsWith(ym));
 if(range==='year')return list.filter(e=>e.date.startsWith(y));
 return list.slice();
}
async function renderReports(){
 const list=await allEntries();
 const range=$('rRange').value, pf=$('rPf').value;
 let rows=rangeFilter(range,list);
 if(pf)rows=rows.filter(e=>e.platform===pf);
 const s=sum(rows);
 $('repTot').innerHTML=totCard(money(s.earn),'earned')+totCard(s.miles.toFixed(1)+' mi','miles')+totCard(s.hrs.toFixed(1)+' h','hours')+totCard(s.jobs,'trips');
 const byPf={};rows.forEach(e=>{(byPf[e.platform]=byPf[e.platform]||[]).push(e);});
 const tb=$('repTbl').querySelector('tbody');tb.innerHTML='';
 Object.keys(byPf).sort().forEach(k=>{const ss=sum(byPf[k]);const tr=document.createElement('tr');
  tr.innerHTML='<td>'+k+'</td><td>'+ss.jobs+'</td><td>'+money(ss.earn)+'</td><td>'+ss.miles.toFixed(1)+'</td><td>'+ss.hrs.toFixed(1)+'</td>';tb.append(tr);});
 if(!tb.children.length)tb.innerHTML='<tr><td colspan="5" style="color:#5A6B80">No jobs in this range.</td></tr>';
 const xl=rangeFilter(range,await allExpenses());
 const gas=xl.filter(e=>e.kind==='gas').reduce((a,e)=>a+e.amount,0);
 const tax=xl.filter(e=>e.kind==='tax').reduce((a,e)=>a+e.amount,0);
 const spent=gas+tax;
 $('repExpTot').innerHTML=totCard(money(gas),'gas / energy')+totCard(money(tax),'tax expenses')+totCard(money(spent),'all expenses')+totCard(money(s.earn-spent),'net');
 $('repNote').textContent='Net = earned minus every expense logged in the range'+(pf?' (expenses are not split by platform \u2014 they count against the whole range)':'')+'.';
}
$('rRange').onchange=renderReports;$('rPf').onchange=renderReports;

/* ---------- PAYROLL: end of day, end of week, end of month ---------- */
let payMode='day';
function payIso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function weekBounds(ds){const d=new Date(ds+'T12:00:00');const dow=(d.getDay()+6)%7;const a=new Date(d);a.setDate(d.getDate()-dow);const b=new Date(a);b.setDate(a.getDate()+6);return[payIso(a),payIso(b)];}
function payRange(mode,ds){
 if(mode==='week'){const f=$('pFrom')&&$('pFrom').value,t=$('pTo')&&$('pTo').value;
  if(f&&t)return f<=t?[f,t]:[t,f];
  return weekBounds(ds);}
 if(mode==='month'){const d=new Date(ds+'T12:00:00');return[payIso(new Date(d.getFullYear(),d.getMonth(),1)),payIso(new Date(d.getFullYear(),d.getMonth()+1,0))];}
 return[ds,ds];}
function payLabel(mode,a,b,ds){
 if(mode==='week')return fmtDay(a)+' \u2013 '+fmtDay(b);
 if(mode==='month')return new Date(ds+'T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'});
 return fmtDay(ds);}
function setWeekDefaults(){const [f,t]=weekBounds($('pDay').value||todayStr());$('pFrom').value=f;$('pTo').value=t;}
(function injectPayMode(){
 const sec=$('v-pay'); if(!sec) return;
 const h=sec.querySelector('h2'); if(h) h.textContent='Payroll \u2014 day, week or month';
 const wrap=document.createElement('div'); wrap.style.cssText='display:flex;gap:8px;margin:0 0 10px;';
 const mk=(m,t)=>{const b=document.createElement('button');b.className='btn ghost small';b.dataset.m=m;b.textContent=t;
  b.style.cssText='border-radius:999px;padding:6px 14px;';b.onclick=()=>{payMode=m;[...wrap.children].forEach(x=>{const on=x===b;x.style.background=on?'#101F3B':'#F5F2E9';x.style.color=on?'#F5F2E9':'#101F3B';x.style.fontWeight=on?'700':'400';});
   const rc=$('payRangeCard'); if(rc)rc.style.display=m==='week'?'':'none';
   if(m==='week')setWeekDefaults();
   renderPayroll();};return b;};
 ['day','week','month'].forEach((m,i)=>wrap.append(mk(m,['Day','Week','Month'][i])));
 wrap.children[0].click(); // Day starts active
 const dayCard=sec.querySelector('.card'); sec.insertBefore(wrap, dayCard);
 const rangeCard=document.createElement('div'); rangeCard.className='card'; rangeCard.id='payRangeCard'; rangeCard.style.display='none';
 rangeCard.innerHTML='<div style="display:flex;gap:10px;"><div style="flex:1"><label>Week starts</label><input type="date" id="pFrom"></div><div style="flex:1"><label>Week ends</label><input type="date" id="pTo"></div></div><div class="note" style="margin-top:6px">Short week? Set the first day you worked and the last \u2014 the tallies and the 20\u201325% set-aside follow.</div>';
 sec.insertBefore(rangeCard, dayCard);
 $('pFrom').onchange=renderPayroll; $('pTo').onchange=renderPayroll;
 const noteCard=[...sec.querySelectorAll('.card')].find(c=>c.querySelector('#copyPay'));
 if(noteCard){const p=noteCard.querySelector('div[style*="12px"]');if(p)p.textContent="The period's numbers in one note";}
})();
function renderPayroll(){
 if(!$('pDay').value)$('pDay').value=todayStr();
 const d=$('pDay').value;
 const [a,b]=payRange(payMode,d);
 const when= payMode==='day'?'today': payMode==='week'?'this week':'this month';
 const lbl=payLabel(payMode,a,b,d);
 const gl=document.querySelectorAll('#v-pay .glabels span'); if(gl[1])gl[1].textContent="all of "+when+"'s take-home";
 allEntries().then(list=>{
 const jobs=list.filter(e=>e.date>=a&&e.date<=b);
 const s=sum(jobs);
 allExpenses().then(xl=>{
  const xs=xl.filter(e=>e.date>=a&&e.date<=b);
  const spent=xs.reduce((a,e)=>a+e.amount,0);
  const net=s.earn-spent;
  $('payTot').innerHTML=totCard(money(s.earn),'earned')+totCard(money(spent),'expenses')+totCard(money(net),'take-home')+totCard(jobs.length,'trips');
  const lo=Math.max(net,0)*.20, hi=Math.max(net,0)*.25;
  $('payBig').innerHTML=net>0?('Set aside <span>'+money(lo)+' \u2013 '+money(hi)+'</span> for payroll'):'<span>$0</span> for payroll '+when;
  $('payNote').textContent=net>0
    ?('That is 20\u201325% of '+when+"'s "+money(net)+' take-home (earned minus expenses) \u2014 '+lbl+'. Drop it in the payroll account before a dollar of the rest moves.')
    :((when==='day'?'Today':when==='week'?'This week':'This month')+' nets to '+money(net)+(xs.length?' after '+money(spent)+' in expenses':'')+'. Nothing goes to payroll on a stretch like this.');
  $('copyPay').onclick=()=>{const txt='PAYROLL \u2014 '+lbl+'\nEarned: '+money(s.earn)+'  Expenses: '+money(spent)+'  Take-home: '+money(net)+'\nTo payroll (20-25%): '+money(lo)+' - '+money(hi)+'\nTrips: '+jobs.length;
   navigator.clipboard.writeText(txt);$('copyPay').textContent='Copied';setTimeout(()=>$('copyPay').textContent='Copy payroll note',1500);};
 });
 });
}
$('pDay').onchange=()=>{if(payMode==='week')setWeekDefaults();renderPayroll();};

/* ---------- WEEKLY TOTALS (tab injected between Today and Month) ---------- */
async function renderWeek(){
 const t=todayStr();const d=new Date(t+'T12:00:00');const dow=(d.getDay()+6)%7;const sun=new Date(d);sun.setDate(d.getDate()-dow);const sat=new Date(sun);sat.setDate(sun.getDate()+6);
 const A=fmtD(sun),B=fmtD(sat);
 const short=s=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
 $('wkLabel').textContent=short(A)+' \u2013 '+short(B);
 const rows=rangeFilter('week',await allEntries());
 const s=sum(rows);
 $('wkTot').innerHTML=totCard(money(s.earn),'earned this week')+totCard(s.miles.toFixed(1)+' mi','miles')+totCard(s.hrs.toFixed(1)+' h','hours')+totCard(s.jobs,'trips');
 $('wkBy').textContent=byLine(s.by)||'none';
 const xl=rangeFilter('week',await allExpenses());
 const gas=xl.filter(e=>e.kind==='gas').reduce((a,e)=>a+e.amount,0);
 const tax=xl.filter(e=>e.kind==='tax').reduce((a,e)=>a+e.amount,0);
 const spent=gas+tax;
 $('wkExp').innerHTML=totCard(money(gas),'gas')+totCard(money(tax),'tax expenses')+totCard(money(spent),'all expenses')+totCard(money(s.earn-spent),'net this week');
 $('wkNote').textContent='Net = earned minus every expense this week. Week runs Monday through Sunday.';
 $('wkList').innerHTML=rows.length?rows.map(e=>entryCard(e,true)).join(''):'<div class="empty">No trips logged this week yet.</div>';
}
(function(){
 const nb=document.createElement('button');nb.dataset.v='wk';nb.textContent='Week';
 const nav=document.querySelector('nav');
 nav.insertBefore(nb,nav.querySelector('[data-v="today"]').nextSibling);
 const sec=document.createElement('section');sec.className='view';sec.id='v-wk';
 sec.innerHTML='<h2 class="sec anton">This week \u2014 <span id="wkLabel"></span></h2><div class="tot" id="wkTot"></div><div class="card" style="font-size:12px; color:#5A6B80;">By platform: <b id="wkBy"></b></div><div class="tot" id="wkExp"></div><div class="card" style="font-size:12px; color:#5A6B80;" id="wkNote"></div><div id="wkList"></div>';
 document.querySelector('main').insertBefore(sec,document.getElementById('v-month'));
 nb.addEventListener('click',()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.remove('on'));nb.classList.add('on');document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));sec.classList.add('on');renderWeek();});
})();

/* ---------- boot ---------- */
openXDB().then(d=>{xdb=d;$('x-date').value=todayStr();setExpKindUI('gas');fillStateSelects();
 ['DoorDash','Instacart','Uber','Uber Eats','Grubhub','Spark','Amazon Flex','Other'].forEach(p=>{const o=document.createElement('option');o.textContent=p;$('rPf').append(o);});
 document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.v==='exp')renderExpenses();
  if(b.dataset.v==='rep')renderReports();
  if(b.dataset.v==='pay')renderPayroll();
 }));
});

/* ---------- read totals off a Tesla screen ---------- */
$('xTeslaBtn').onclick=async()=>{
  if(!xTShots.length){$('xStatus').textContent='Add the Tesla screen shot first.';return;}
  $('xStatus').textContent='Reading the Tesla screen\u2026';
  try{
    let text='';
    try{
      const w=await Tesseract.createWorker('eng');
      await w.setParameters({tessedit_pageseg_mode:'6'});
      for(const s of xTShots){const r=await w.recognize(await prep(s));text+='\n'+r.data.text;}
      await w.terminate();
    }catch(e2){
      for(const s of xTShots){const r=await Tesseract.recognize(await prep(s),'eng');text+='\n'+r.data.text;}
    }
    const lines=text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    let best=null,kwh=null;
    lines.forEach(l=>{
      const k=l.match(/(\d{1,4}(?:\.\d{1,2})?)\s*kwh/i);if(k&&!kwh)kwh=k[1];
      const m=l.match(/\$\s?(\d{1,4}\.\d{2})\b/);
      if(!m)return;
      const v=parseFloat(m[1]);
      const p=/total|session/i.test(l)?3:1;
      if(!best||p>best.p||(p===best.p&&v>best.v))best={v:v,p:p};
    });
    if(best){
      $('x-amt').value=best.v.toFixed(2);
      if(kwh){$('x-notes').value=$('x-notes').value?($('x-notes').value+', '+kwh+' kWh'):kwh+' kWh';}
      $('xStatus').textContent='Read $'+best.v.toFixed(2)+(kwh?' and '+kwh+' kWh':'')+' off the screen. Check it against the screen before saving.';
    }
    else $('xStatus').textContent='Could not pull the numbers off that screen \u2014 type them in.';
  }catch(e){$('xStatus').textContent='The read did not land. Type the total in.';}
};

/* ---------- Tesla charger finder: state + ZIP -> nearest chargers, mapped ---------- */
let chgMap=null,chgMarkers=null;
function hav(a,b,c,d){const R=3958.8,r=Math.PI/180;const h=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function fillStateSelects(){const src=$('f-state');if(!src)return;['x-state','chg-state'].forEach(id=>{const el=$(id);if(!el||el.options.length)return;[...src.options].forEach(o=>el.append(o.cloneNode(true)));});}
$('chgBtn').onclick=async()=>{
  const st=$('chg-state').value,zp=$('chg-zip').value.trim();
  if(!zp){$('chgStatus').textContent='Put the ZIP code in first.';return;}
  $('chgBtn').disabled=true;$('chgStatus').textContent='Finding chargers near '+zp+'\u2026';
  try{
    const q='https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&postalcode='+encodeURIComponent(zp)+(st?'&state='+encodeURIComponent(st):'');
    const geo=await fetch(q).then(r=>r.json());
    if(!geo.length){$('chgStatus').textContent='Could not place that ZIP on the map \u2014 check it and try again.';$('chgBtn').disabled=false;return;}
    const lat=parseFloat(geo[0].lat),lon=parseFloat(geo[0].lon);
    let found=[],widened=false;
    for(const rad of [40000,80000]){
      const oq='[out:json][timeout:30];nwr(around:'+rad+','+lat+','+lon+')["amenity"="charging_station"]["brand"~"Tesla",i];out center tags;';
      const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(oq)}).then(r=>r.json());
      found=(r.elements||[]).map(el=>({lat:el.lat??(el.center&&el.center.lat),lon:el.lon??(el.center&&el.center.lon),tags:el.tags||{}})).filter(x=>x.lat);
      widened=rad>=80000;
      if(found.length)break;
    }
    if(!found.length){$('chgStatus').textContent='No Tesla chargers showed up within 50 miles of that ZIP \u2014 try a bigger city ZIP.';$('chgBtn').disabled=false;return;}
    found.forEach(x=>{x.mi=hav(lat,lon,x.lat,x.lon);});
    found.sort((a,b)=>a.mi-b.mi);
    found=found.slice(0,20);
    renderChg(found,lat,lon);
    $('chgStatus').textContent=found.length+' chargers, nearest first'+(widened?' (search widened to 50 miles)':'')+'.';
  }catch(e){$('chgStatus').textContent='The map service did not answer \u2014 try again in a minute.';}
  $('chgBtn').disabled=false;
};
async function renderChg(list,lat,lon){
  $('chgList').innerHTML=list.map((x,i)=>{
    const t=x.tags||{};
    const nm=t.name||t.operator||t.brand||'Charging station';
    const addr=[t['addr:housenumber'],t['addr:street'],t['addr:city'],t['addr:state']].filter(Boolean).join(' ');
    const gm='https://www.google.com/maps/search/?api=1&query='+x.lat+'%2C'+x.lon;
    return '<div class="entry" id="chg'+i+'"><div class="top"><span class="pf">'+nm+'</span><span class="amt">'+x.mi.toFixed(1)+' mi</span></div>'+(addr?'<div class="meta">'+addr+'</div>':'')+'<div class="acts"><a class="btn ghost small" href="'+gm+'" target="_blank" rel="noopener">Open in Maps</a></div></div>';
  }).join('');
  list.forEach((x,i)=>{$('chg'+i).addEventListener('click',()=>{if(chgMap)chgMap.setView([x.lat,x.lon],15);});});
  await window.leafletReady;if(!window.L)return;
  if(!chgMap){chgMap=L.map('chgMap').setView([lat,lon],9);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(chgMap);}
  if(chgMarkers)chgMarkers.forEach(m=>m.remove());
  chgMarkers=list.map((x,i)=>L.marker([x.lat,x.lon]).addTo(chgMap).bindPopup((x.tags&&x.tags.name)||('Charger '+(i+1))));
  $('chgMap').style.display='block';
  setTimeout(()=>{chgMap.invalidateSize();chgMap.setView([lat,lon],9);},60);
}

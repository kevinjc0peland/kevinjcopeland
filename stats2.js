/* ---------- stats2: expenses, reports, payroll (loads after stats.js) ---------- */
let xdb;
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
$('subGas').onclick=()=>{setExpKindUI('gas');resetXForm();renderExpenses();};
$('subTax').onclick=()=>{setExpKindUI('tax');resetXForm();renderExpenses();};
$('xDrop').onclick=()=>$('x-shots').click();
$('x-shots').onchange=async()=>{for(const f of [...$('x-shots').files])xShots.push(await shrink(f));drawXShots();$('x-shots').value='';};
function drawXShots(){$('xShotBox').innerHTML='';xShots.forEach(s=>{const im=new Image();im.src=s;im.onclick=()=>zoom(s);$('xShotBox').append(im);});}
function resetXForm(){['x-amt','x-type','x-notes'].forEach(i=>$(i).value='');xShots=[];drawXShots();xEditId=null;$('xSaveBtn').textContent='Save expense';$('xCancelBtn').style.display='none';$('xEditNote').textContent='';$('xStatus').textContent='';}
$('xCancelBtn').onclick=resetXForm;
$('xOcrBtn').onclick=async()=>{
  if(!xShots.length){$('xStatus').textContent='Add the receipt first.';return;}
  $('xStatus').textContent='Reading the receipt…';
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
    else $('xStatus').textContent='Could not pull the total off that one — type it in.';
  }catch(e){$('xStatus').textContent='The read did not land. Type the total in.';}
};
$('xSaveBtn').onclick=async()=>{
  const amt=num($('x-amt').value);
  if(amt==null){$('xStatus').textContent='Put the amount in first.';return;}
  const e={date:$('x-date').value||todayStr(),kind:xKind,type:$('x-type').value.trim(),amount:amt,notes:$('x-notes').value.trim(),shots:xShots,created:Date.now()};
  if(xEditId)e.id=xEditId; else e.id=Date.now()+Math.floor(Math.random()*1000);
  await putExpense(e); resetXForm(); $('x-date').value=e.date; renderExpenses(); renderReports(); renderPayroll(); renderWeek();
};
async function editExpense(id){const l=await allExpenses();const e=l.find(x=>x.id===id);if(!e)return;
 xEditId=id;setExpKindUI(e.kind);
 $('x-date').value=e.date;$('x-amt').value=e.amount;$('x-type').value=e.type||'';$('x-notes').value=e.notes||'';
 xShots=(e.shots||[]).slice();drawXShots();$('xSaveBtn').textContent='Save changes';$('xCancelBtn').style.display='inline-block';$('xEditNote').textContent='Editing a saved expense. Save changes or cancel.';}
async function killExpense(id){if(!confirm('Delete this expense? The tallies come off with it.'))return;await delExpense(id);renderExpenses();renderReports();renderPayroll();renderWeek();}
window.editExpense=editExpense;window.killExpense=killExpense;
function expCard(e){
  return '<div class="entry"><div class="top"><span class="pf">'+(e.kind==='gas'?'Gas / energy':'Tax expense')+(e.type?' · '+e.type:'')+'</span><span class="amt">'+money(e.amount)+'</span></div>'+
  '<div class="meta">'+[fmtDay(e.date),e.notes].filter(Boolean).join(' · ')+'</div>'+
  (e.shots&&e.shots.length?'<div class="shots">'+e.shots.map(s=>'<img src="'+s+'" onclick="zoom(this.src)">').join('')+'</div>':'')+
  '<div class="acts"><button class="btn ghost small" onclick="editExpense('+e.id+')">Edit</button><button class="btn ghost small" onclick="killExpense('+e.id+')">Delete</button></div></div>';
}
async function renderExpenses(){
  const xl=await allExpenses();xl.sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created);
  const k=xl.filter(e=>e.kind===xKind);
  const g=xl.filter(e=>e.kind==='gas').reduce((a,e)=>a+e.amount,0);
  const txa=xl.filter(e=>e.kind==='tax').reduce((a,e)=>a+e.amount,0);
  $('expCount').textContent=xl.length+' receipts on file · '+money(g)+' gas · '+money(txa)+' tax';
  $('expTot').innerHTML=(xKind==='gas'?totCard(money(g),'gas / energy total'):totCard(money(txa),'tax expenses total'))+totCard(k.length,'receipts on this page');
  $('expList').innerHTML=k.length?k.map(expCard).join(''):'<div class="empty">No '+(xKind==='gas'?'gas or energy':'tax expense')+' receipts logged yet.</div>';
}
$('expCsvBtn').onclick=async()=>{const xl=await allExpenses();xl.sort((a,b)=>a.date.localeCompare(b.date));
 let c='date,kind,type,amount,notes\n';
 xl.forEach(e=>{const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  c+=[e.date,e.kind,q(e.type),e.amount.toFixed(2),q(e.notes)].join(',')+'\n';});
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
 $('repTot').innerHTML=totCard(money(s.earn),'earned')+totCard(s.miles.toFixed(1)+' mi','miles')+totCard(s.hrs.toFixed(1)+' h','hours')+totCard(s.jobs,'jobs');
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
 $('repNote').textContent='Net = earned minus every expense logged in the range'+(pf?' (expenses are not split by platform — they count against the whole range)':'')+'.';
}
$('rRange').onchange=renderReports;$('rPf').onchange=renderReports;

/* ---------- PAYROLL (end of day — 20–25% of net set aside) ---------- */
function renderPayroll(){
 if(!$('pDay').value)$('pDay').value=todayStr();
 const d=$('pDay').value;
 allEntries().then(list=>{
 const jobs=list.filter(e=>e.date===d);
 const s=sum(jobs);
 allExpenses().then(xl=>{
  const xs=xl.filter(e=>e.date===d);
  const spent=xs.reduce((a,e)=>a+e.amount,0);
  const net=s.earn-spent;
  $('payTot').innerHTML=totCard(money(s.earn),'earned')+totCard(money(spent),'expenses')+totCard(money(net),'take-home')+totCard(jobs.length,'jobs');
  const lo=Math.max(net,0)*.20, hi=Math.max(net,0)*.25;
  $('payBig').innerHTML=net>0?('Set aside <span>'+money(lo)+' – '+money(hi)+'</span> for payroll'):'<span>$0</span> for payroll today';
  $('payNote').textContent=net>0
    ?('That is 20–25% of today\'s '+money(net)+' take-home (earned minus expenses). Drop it in the payroll account before a dollar of the rest moves.')
    :('Today nets to '+money(net)+(xs.length?' after '+money(spent)+' in expenses':'')+'. Nothing goes to payroll on a day like this.');
  $('copyPay').onclick=()=>{const txt='PAYROLL — '+fmtDay(d)+'\nEarned: '+money(s.earn)+'  Expenses: '+money(spent)+'  Take-home: '+money(net)+'\nTo payroll (20-25%): '+money(lo)+' - '+money(hi)+'\nJobs: '+jobs.length;
   navigator.clipboard.writeText(txt);$('copyPay').textContent='Copied';setTimeout(()=>$('copyPay').textContent='Copy payroll note',1500);};
 });
 });
}
$('pDay').onchange=renderPayroll;

/* ---------- WEEKLY TOTALS (tab injected between Today and Month) ---------- */
async function renderWeek(){
 const t=todayStr();const d=new Date(t+'T12:00:00');const dow=(d.getDay()+6)%7;const sun=new Date(d);sun.setDate(d.getDate()-dow);const sat=new Date(sun);sat.setDate(sun.getDate()+6);
 const A=fmtD(sun),B=fmtD(sat);
 const short=s=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
 $('wkLabel').textContent=short(A)+' – '+short(B);
 const rows=rangeFilter('week',await allEntries());
 const s=sum(rows);
 $('wkTot').innerHTML=totCard(money(s.earn),'earned this week')+totCard(s.miles.toFixed(1)+' mi','miles')+totCard(s.hrs.toFixed(1)+' h','hours')+totCard(s.jobs,'jobs');
 $('wkBy').textContent=byLine(s.by)||'none';
 const xl=rangeFilter('week',await allExpenses());
 const gas=xl.filter(e=>e.kind==='gas').reduce((a,e)=>a+e.amount,0);
 const tax=xl.filter(e=>e.kind==='tax').reduce((a,e)=>a+e.amount,0);
 const spent=gas+tax;
 $('wkExp').innerHTML=totCard(money(gas),'gas')+totCard(money(tax),'tax expenses')+totCard(money(spent),'all expenses')+totCard(money(s.earn-spent),'net this week');
 $('wkNote').textContent='Net = earned minus every expense this week. Week runs Monday through Sunday.';
 $('wkList').innerHTML=rows.length?rows.map(e=>entryCard(e,true)).join(''):'<div class="empty">No jobs logged this week yet.</div>';
}
(function(){
 const nb=document.createElement('button');nb.dataset.v='wk';nb.textContent='Week';
 const nav=document.querySelector('nav');
 nav.insertBefore(nb,nav.querySelector('[data-v="today"]').nextSibling);
 const sec=document.createElement('section');sec.className='view';sec.id='v-wk';
 sec.innerHTML='<h2 class="sec anton">This week — <span id="wkLabel"></span></h2><div class="tot" id="wkTot"></div><div class="card" style="font-size:12px; color:#5A6B80;">By platform: <b id="wkBy"></b></div><div class="tot" id="wkExp"></div><div class="card" style="font-size:12px; color:#5A6B80;" id="wkNote"></div><div id="wkList"></div>';
 document.querySelector('main').insertBefore(sec,document.getElementById('v-month'));
 nb.addEventListener('click',()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.remove('on'));nb.classList.add('on');document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));sec.classList.add('on');renderWeek();});
})();

/* ---------- boot ---------- */
openXDB().then(d=>{xdb=d;$('x-date').value=todayStr();
 ['DoorDash','Instacart','Uber','Uber Eats','Grubhub','Spark','Amazon Flex','Other'].forEach(p=>{const o=document.createElement('option');o.textContent=p;$('rPf').append(o);});
 document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.v==='exp')renderExpenses();
  if(b.dataset.v==='rep')renderReports();
  if(b.dataset.v==='pay')renderPayroll();
 }));
});

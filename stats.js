/* ---------- password gate (first visit sets the passcode) ---------- */
const LS_HASH='kg_pass_hash';
async function sha(txt){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function unlocked(){return sessionStorage.getItem('kg_unlock')==='1';}
let setting=false;
function gateMode(){
  const has=!!localStorage.getItem(LS_HASH); setting=!has;
  document.getElementById('pw2').style.display=has?'none':'block';
  document.getElementById('gateMsg').textContent=has
    ?'Private Kevin Copeland LLC page. Enter your passcode to pull the numbers up.'
    :'First time here. Pick a passcode — you will use it every visit on this device.';
  document.getElementById('gateBtn').textContent=has?'Unlock':'Set passcode';
}
document.getElementById('gateBtn').onclick=async()=>{
  const a=document.getElementById('pw1').value, e=document.getElementById('gateErr');
  if(!a){e.textContent='Type a passcode.';return;}
  if(setting){
    const b=document.getElementById('pw2').value;
    if(a!==b){e.textContent='The two do not match. Try again.';return;}
    localStorage.setItem(LS_HASH,await sha(a)); sessionStorage.setItem('kg_unlock','1'); enter();
  }else{
    if(await sha(a)===localStorage.getItem(LS_HASH)){sessionStorage.setItem('kg_unlock','1'); enter();}
    else{e.textContent='That is not it. Try again.';}
  }
};
document.getElementById('pw1').addEventListener('keydown',ev=>{if(ev.key==='Enter')document.getElementById('gateBtn').click();});
document.getElementById('lockBtn').onclick=()=>{sessionStorage.removeItem('kg_unlock');location.reload();};
function enter(){document.getElementById('gate').style.display='none'; boot();}

/* ---------- tiny IndexedDB ---------- */
let db;
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open('kcllc_gig_ledger',1);
 r.onupgradeneeded=()=>{r.result.createObjectStore('entries',{keyPath:'id',autoIncrement:true});};
 r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);});}
function tx(mode){return db.transaction('entries',mode).objectStore('entries');}
function putEntry(e){return new Promise((res,rej)=>{const q=tx('readwrite').put(e);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
function delEntry(id){return new Promise(res=>{tx('readwrite').delete(id).onsuccess=()=>res();});}
function allEntries(){return new Promise(res=>{const q=tx('readonly').getAll();q.onsuccess=()=>res(q.result||[]);});}

/* ---------- state ---------- */
let shots=[], editId=null;
const $=id=>document.getElementById(id);
const money=n=>'$'+(n||0).toFixed(2);
const hrs=e=>{if(!e.start||!e.end)return null;let[h1,m1]=e.start.split(':').map(Number),[h2,m2]=e.end.split(':').map(Number);let d=(h2*60+m2)-(h1*60+m1);if(d<=0)d+=1440;return d/60;};
const num=v=>{const n=parseFloat(v);return isNaN(n)?null:n;};
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fmtDay(s){const[y,m,d]=s.split('-');return new Date(y,m-1,d).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});}

/* ---------- tabs ---------- */
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('nav button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));$('v-'+b.dataset.v).classList.add('on');
  render();
});

/* ---------- screenshots ---------- */
function shrink(file){return new Promise(res=>{const img=new Image();img.onload=()=>{
 const M=1280,s=Math.min(1,M/Math.max(img.width,img.height)),c=document.createElement('canvas');
 c.width=img.width*s;c.height=img.height*s;c.getContext('2d').drawImage(img,0,0,c.width,c.height);
 res(c.toDataURL('image/jpeg',.82));};img.src=URL.createObjectURL(file);});}
$('drop').onclick=()=>$('f-shots').click();
$('f-shots').onchange=async()=>{for(const f of [...$('f-shots').files]) shots.push(await shrink(f)); drawShots();$('f-shots').value='';};
function drawShots(){$('shotBox').innerHTML='';shots.forEach((s,i)=>{const im=new Image();im.src=s;im.onclick=()=>zoom(s);$('shotBox').append(im);});}
function zoom(s){$('lbImg').src=s;$('lightbox').style.display='flex';}
$('lightbox').onclick=()=>$('lightbox').style.display='none';

/* ---------- ZIP lookup (street + suite + city + state, business name as fallback) ---------- */
$('zipBtn').onclick=async()=>{
  const street=$('f-addr').value.trim(), suite=$('f-suite').value.trim(), city=$('f-city').value.trim(), st=$('f-state').value, biz=$('f-biz').value.trim();
  if(!street&&!biz){$('oStatus').textContent='Put the street address in first — the zip comes from it.';return;}
  const tries=[];
  if(street){
    let full=[street]; if(suite)full.push(suite); if(city)full.push(city); if(st)full.push(st);
    tries.push(full.join(', '));
    tries.push([street,city,st].filter(Boolean).join(', '));
  }
  if(biz) tries.push([biz,city,st].filter(Boolean).join(', '));
  $('oStatus').textContent='Looking up the zip…';
  try{
    let zc=null;
    for(const q of tries){
      const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q='+encodeURIComponent(q));
      const j=await r.json();
      if(j&&j[0]&&j[0].address&&j[0].address.postcode){zc=j[0].address.postcode;break;}
    }
    if(zc){$('f-zip').value=zc;$('f-zip').classList.add('filled');$('oStatus').textContent='Zip found: '+zc+' — give it a quick look to be sure.';}
    else $('oStatus').textContent='No zip found for that one. Type it in.';
  }catch(e){$('oStatus').textContent='The zip lookup did not land. Type it in.';}
};

/* ---------- OCR assist (reads every shot, earnings line first — you confirm) ---------- */
function prep(src){return new Promise(res=>{const img=new Image();img.onload=()=>{
  const M=1800;let s=M/Math.max(img.width,img.height);if(s>2)s=2;if(s<1)s=1;
  const c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);
  const x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);
  const d=x.getImageData(0,0,c.width,c.height),p=d.data;
  let mn=255,mx=0;
  for(let i=0;i<p.length;i+=4){const g=(p[i]*.299+p[i+1]*.587+p[i+2]*.114)|0;p[i]=p[i+1]=p[i+2]=g;if(g<mn)mn=g;if(g>mx)mx=g;}
  const span=Math.max(1,mx-mn);
  for(let i=0;i<p.length;i+=4){const g=Math.max(0,Math.min(255,((p[i]-mn)*255/span)|0));p[i]=p[i+1]=p[i+2]=g;}
  x.putImageData(d,0,0);
  res(c.toDataURL('image/png'));
};img.src=src;});}

$('ocrBtn').onclick=async()=>{
  if(!shots.length){$('oStatus').textContent='Add a screenshot first.';return;}
  $('oStatus').textContent='Reading the screenshot…';
  try{
    let text='';
    try{
      const w=await Tesseract.createWorker('eng');
      await w.setParameters({tessedit_pageseg_mode:'6'});
      for(const s of shots){const r=await w.recognize(await prep(s));text+='\n'+r.data.text;}
      await w.terminate();
    }catch(e2){
      for(const s of shots){const r=await Tesseract.recognize(await prep(s),'eng');text+='\n'+r.data.text;}
    }
    const lines=text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    const kw=/(earn|total|payout|pay|tip|amount|net|gross)/i;
    const dollarRe=/\$\s?(\d{1,5}(?:\.\d{1,2})?)/g, bareRe=/\b(\d{1,4}\.\d{2})\b/g;
    let cands=[];
    lines.forEach(l=>{
      const k=kw.test(l)?1:0;
      let m;const dr=new RegExp(dollarRe.source,'g');
      while((m=dr.exec(l))!==null)cands.push({v:parseFloat(m[1]),p:2+k});
      if(l.indexOf('$')===-1&&!/mi(le)?s?\b/i.test(l)){const br=new RegExp(bareRe.source,'g');
        while((m=br.exec(l))!==null)cands.push({v:parseFloat(m[1]),p:1+k});}
    });
    cands.sort((a,b)=>b.p-a.p);
    const mMoney=cands.length?cands[0].v:null;
    const mMiles=text.match(/(\d+(?:\.\d)?)\s?mi(?:le)?s?\b/i);
    ['f-earn','f-miles'].forEach(i=>$(i).classList.remove('filled'));
    if(mMoney!=null){$('f-earn').value=mMoney.toFixed(2);$('f-earn').classList.add('filled');}
    if(mMiles){$('f-miles').value=mMiles[1];$('f-miles').classList.add('filled');}
    $('oStatus').textContent=(mMoney!=null||mMiles)
      ?('Read off the screenshot'+(mMoney!=null?' — earned '+money(mMoney):'')+(mMiles?' — '+mMiles[1]+' mi':'')+'. Check both against the shot before saving.')
      :'Could not pull numbers off that one — type them in.';
  }catch(e){$('oStatus').textContent='The read did not land. Type the numbers in — takes ten seconds.';}
};

/* ---------- save / edit ---------- */
function resetForm(){['f-earn','f-miles','f-biz','f-addr','f-suite','f-city','f-state','f-zip','f-notes','f-start','f-end'].forEach(i=>$(i).value='');['f-earn','f-miles'].forEach(i=>$(i).classList.remove('filled'));shots=[];drawShots();editId=null;$('saveBtn').textContent='Save job';$('clearBtn').style.display='none';$('editNote').textContent='';$('oStatus').textContent='';}
$('clearBtn').onclick=resetForm;
$('saveBtn').onclick=async()=>{
  const e={date:$('f-date').value||todayStr(),platform:$('f-pf').value,earn:num($('f-earn').value),miles:num($('f-miles').value),start:$('f-start').value||null,end:$('f-end').value||null,biz:$('f-biz').value.trim(),addr:$('f-addr').value.trim(),suite:$('f-suite').value.trim(),city:$('f-city').value.trim(),state:$('f-state').value,zip:$('f-zip').value.trim(),notes:$('f-notes').value.trim(),shots:shots,created:Date.now()};
  if(e.earn==null&&e.miles==null){$('oStatus').textContent='Give me at least an amount or the miles.';return;}
  if(editId)e.id=editId; else e.id=Date.now()+Math.floor(Math.random()*1000);
  await putEntry(e); resetForm(); $('f-date').value=e.date; render();
};

/* ---------- views ---------- */
function totCard(n,l){return '<div class="t"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>';}
function sum(list){const t={jobs:list.length,earn:0,miles:0,hrs:0};const by={};
 list.forEach(e=>{t.earn+=e.earn||0;t.miles+=e.miles||0;t.hrs+=hrs(e)||0;by[e.platform]=(by[e.platform]||0)+((e.earn||0))+(e.miles||0?0:0);});
 t.by=by;return t;}
function byLine(by){return Object.entries(by).map(([k,v])=>k).join(' · ')||'none';}
function whereLine(e){if(!e.biz&&e.pickup)return 'pickup: '+e.pickup;if(!e.biz)return null;
  const seg=[e.addr,e.suite,e.city,e.state,e.zip].filter(Boolean);
  return seg.length?e.biz+' — '+seg.join(', '):e.biz;}
function entryCard(e,showDate){
  const h=hrs(e);
  return '<div class="entry"><div class="top"><span class="pf">'+e.platform+(showDate?' · '+fmtDay(e.date):'')+'</span><span class="amt">'+money(e.earn)+'</span></div>'+
  '<div class="meta">'+[e.miles!=null?e.miles+' mi':null,h?h.toFixed(1)+' hrs':null,whereLine(e),e.notes].filter(Boolean).join(' · ')+'</div>'+
  (e.shots&&e.shots.length?'<div class="shots">'+e.shots.map(s=>'<img src="'+s+'" onclick="zoom(this.src)">').join('')+'</div>':'')+
  '<div class="acts"><button class="btn ghost small" onclick="editEntry('+e.id+')">Edit</button><button class="btn ghost small" onclick="killEntry('+e.id+')">Delete</button></div></div>';
}
async function editEntry(id){const list=await allEntries();const e=list.find(x=>x.id===id);if(!e)return;
 editId=id;$('f-date').value=e.date;$('f-pf').value=e.platform;$('f-earn').value=e.earn??'';$('f-miles').value=e.miles??'';
 $('f-start').value=e.start||'';$('f-end').value=e.end||'';$('f-biz').value=e.biz||'';$('f-addr').value=e.addr||'';$('f-suite').value=e.suite||'';$('f-city').value=e.city||'';$('f-state').value=e.state||'';$('f-zip').value=e.zip||'';$('f-notes').value=e.notes||'';
 shots=(e.shots||[]).slice();drawShots();$('saveBtn').textContent='Save changes';$('clearBtn').style.display='inline-block';$('editNote').textContent='Editing a saved job. Save changes or cancel.';
 document.querySelector('nav button[data-v=log]').click();}
async function killEntry(id){if(!confirm('Delete this job? The numbers come off the tallies with it.'))return;await delEntry(id);render();}
window.editEntry=editEntry;window.killEntry=killEntry;window.zoom=zoom;

function render(){
  if(!unlocked())return;
  allEntries().then(list=>{
    list.sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created);
    /* today */
    const t=todayStr();
    $('todayLabel').textContent=fmtDay(t);
    const dt=sum(list.filter(e=>e.date===t));
    $('todayTot').innerHTML=totCard(money(dt.earn),'earned today')+totCard(dt.miles.toFixed(1)+' mi','miles')+totCard(dt.hrs.toFixed(1)+' h','on the clock')+totCard(dt.jobs,'jobs');
    $('todayBy').textContent=byLine(dt.by);
    const dlist=list.filter(e=>e.date===t);
    $('todayList').innerHTML=dlist.length?dlist.map(e=>entryCard(e)).join(''):'<div class="empty">Nothing logged today yet. First job of the day goes in the Log a job tab.</div>';
    let rep='EOD REPORT — '+fmtDay(t)+'\nJobs: '+dt.jobs+'  Earned: '+money(dt.earn)+'  Miles: '+dt.miles.toFixed(1)+'  Hours: '+dt.hrs.toFixed(1)+'\n'+dlist.map(e=>'· '+e.platform+' — '+(e.earn!=null?money(e.earn):'—')+(e.miles!=null?', '+e.miles+' mi':'')+(hrs(e)?', '+hrs(e).toFixed(1)+' h':'')+(whereLine(e)?' ('+whereLine(e)+')':'')).join('\n');
    $('copyEod').onclick=()=>{navigator.clipboard.writeText(rep);$('copyEod').textContent='Copied';setTimeout(()=>$('copyEod').textContent='Copy report',1500);};
    /* month */
    if(!$('mPick').value)$('mPick').value=t.slice(0,7);
    const mv=$('mPick').value, ml=list.filter(e=>e.date.startsWith(mv));
    const ms=sum(ml);
    $('monthTot').innerHTML=totCard(money(ms.earn),'earned')+totCard(ms.miles.toFixed(1)+' mi','miles')+totCard(ms.hrs.toFixed(1)+' h','hours')+totCard(ms.jobs,'jobs');
    $('monthBy').textContent=byLine(ms.by);
    $('monthList').innerHTML=ml.length?ml.map(e=>entryCard(e,true)).join(''):'<div class="empty">No jobs logged this month yet.</div>';
    /* year */
    if(!$('yPick').value)$('yPick').value=t.slice(0,4);
    const yv=$('yPick').value, yl=list.filter(e=>e.date.startsWith(yv));
    const ys=sum(yl);
    $('yearTot').innerHTML=totCard(money(ys.earn),'earned')+totCard(ys.miles.toFixed(1)+' mi','miles')+totCard(ys.hrs.toFixed(1)+' h','hours')+totCard(ys.jobs,'jobs');
    $('yearBy').textContent=byLine(ys.by);
    const tb=$('yearTbl').querySelector('tbody');tb.innerHTML='';
    for(let m=1;m<=12;m++){const mm=String(m).padStart(2,'0');const rows=yl.filter(e=>e.date.slice(5,7)===mm);if(!rows.length)continue;const s=sum(rows);
      const tr=document.createElement('tr');tr.innerHTML='<td>'+new Date(yv,m-1,1).toLocaleDateString('en-US',{month:'long'})+'</td><td>'+s.jobs+'</td><td>'+money(s.earn)+'</td><td>'+s.miles.toFixed(1)+'</td><td>'+s.hrs.toFixed(1)+'</td>';tb.append(tr);}
    if(!tb.children.length)tb.innerHTML='<tr><td colspan="5" style="color:#5A6B80">Nothing logged in '+yv+' yet.</td></tr>';
    /* all */
    $('countLbl').textContent=list.length+' jobs on file';
    const ab=$('allTbl').querySelector('tbody');ab.innerHTML='';
    list.slice(0,200).forEach(e=>{const tr=document.createElement('tr');
      tr.innerHTML='<td>'+e.date+'</td><td>'+e.platform+'</td><td>'+(e.earn!=null?money(e.earn):'—')+'</td><td>'+(e.miles!=null?e.miles:'—')+'</td><td>'+(hrs(e)?hrs(e).toFixed(1):'—')+'</td><td>'+[(e.biz||e.pickup||''),[e.addr,e.suite].filter(Boolean).join(' '),[e.city,e.state].filter(Boolean).join(', '),e.zip].filter(Boolean).join(', ')+'</td><td><button class="btn ghost small" onclick="editEntry('+e.id+')">Edit</button></td>';ab.append(tr);});
    if(!list.length)ab.innerHTML='<tr><td colspan="7" style="color:#5A6B80">No jobs on file yet.</td></tr>';
  });
}
$('mPick').onchange=render;$('yPick').onchange=render;

/* ---------- export ---------- */
function dl(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:type}));a.download=name;a.click();}
$('csvBtn').onclick=async()=>{const list=await allEntries();list.sort((a,b)=>a.date.localeCompare(b.date));
 let c='date,platform,earned,miles,start,end,hours,business,street,suite,city,state,zip,notes\n';
 list.forEach(e=>{const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  c+=[e.date,q(e.platform),e.earn??'',e.miles??'',e.start||'',e.end||'',hrs(e)?hrs(e).toFixed(2):'',q(e.biz),q(e.addr),q(e.suite),q(e.city),q(e.state),q(e.zip),q(e.notes)].join(',')+'\n';});
 dl('gig-ledger-'+todayStr()+'.csv',c,'text/csv');};
$('jsonBtn').onclick=async()=>{const list=await allEntries();dl('gig-ledger-backup-'+todayStr()+'.json',JSON.stringify(list,null,1),'application/json');};

/* ---------- boot ---------- */
function boot(){$('f-date').value=todayStr();openDB().then(d=>{db=d;render();});}
if(unlocked()){gateMode();enter();}else{gateMode();}

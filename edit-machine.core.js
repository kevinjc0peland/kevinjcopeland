const $ = id => document.getElementById(id);
const fontList = [["Montserrat Black","montserrat",900],["Anton","anton",400],["Archivo Black","archivo-black",400],["Bebas Neue","bebas-neue",400],["Poppins Bold","poppins",700],["Oswald","oswald",700],["Lexend Bold","lexend",700],["Manrope ExtraBold","manrope",800],["Space Grotesk Bold","space-grotesk",700]];
let engine = null, loading = null, urls = [], sourceFile = null, sourceURL = null, duration = 0, busy = false, stopFlag = false, hasAudio = false, words = [], spans = [], outWords = [], stats = null, flags = [], transcriber = null;
const state = s => { $('readState').textContent = s; };
const log = s => { $('logs').textContent = ($('logs').textContent + '\n' + s).slice(-5000); };
function fmt(s){ s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
function safeName(v){ return String(v).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80) || '30 for 30'; }
function lock(on){ busy = on; ['source','read','check','cut','font','res','beatSize','pauseCut','keepPause','popWords','hDay','hSeries','hTitle'].forEach(id => $(id).disabled = on); $('cancel').disabled = !on; if(!on) $('cut').disabled = !words.length; }
async function blobURL(url, type){ const r = await fetch(url); if(!r.ok) throw Error('CDN returned ' + r.status); const u = URL.createObjectURL(new Blob([await r.arrayBuffer()], {type})); urls.push(u); return u; }
async function initEngine(){
  if(engine) return engine; if(loading) return loading;
  loading = (async () => {
    state('Loading the video engine (about 32 MB)…');
    if(!window.FFmpegWASM) throw Error('Engine script unavailable. Check your connection or CDN blocker.');
    const f = new FFmpegWASM.FFmpeg();
    f.on('log', ({message}) => log(message));
    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    const [worker, core, wasm] = await Promise.all([
      blobURL('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js','text/javascript'),
      blobURL(base + '/ffmpeg-core.js','text/javascript'),
      blobURL(base + '/ffmpeg-core.wasm','application/wasm')]);
    await f.load({classWorkerURL: worker, coreURL: core, wasmURL: wasm});
    engine = f; state('Video engine ready.');
    return f;
  })().catch(e => { loading = null; throw e; });
  return loading;
}
const fontCache = new Map();
const fontURLof = (id, w) => 'https://cdn.jsdelivr.net/fontsource/fonts/' + id + '@latest/latin-' + w + '-normal.ttf';
async function loadFont(index){
  if(index < 0) return null;
  if(!fontCache.has(index)){
    fontCache.set(index, (async () => {
      const [name, id, w] = fontList[index];
      const r = await fetch(fontURLof(id, w)); if(!r.ok) throw Error(name + ' font download failed: ' + r.status);
      const bytes = new Uint8Array(await r.arrayBuffer());
      const face = new FontFace('Studio' + index, bytes.slice(), {weight: String(w)});
      await face.load(); document.fonts.add(face); return bytes;
    })().catch(e => { fontCache.delete(index); throw e; }));
  }
  return fontCache.get(index);
}
function popSet(){ return new Set($('popWords').value.split(',').map(s => s.trim().toLowerCase().replace(/[^\w']/g, '')).filter(Boolean)); }
async function beatPNG(beat, W, H){
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const x = canvas.getContext('2d');
  const index = Number($('font').value); await loadFont(index);
  const family = index < 0 ? 'Arial,sans-serif' : 'Studio' + index;
  const weight = index < 0 ? 700 : fontList[index][2];
  const scale = W / 720, pops = popSet();
  const norm = w => w.toLowerCase().replace(/[^\w']/g, '');
  let items, cy, maxH, baseSize;
  if(beat.header){ items = beat.parts.map(p => ({t: p, c: '#FFFFFF'})); cy = 0.15 * H; maxH = 0.24 * H; baseSize = 54 * scale; }
  else { items = beat.words.map(w => ({t: w.t, c: pops.has(norm(w.t)) ? '#4B9CD3' : '#FFFFFF'})); cy = 0.775 * H; maxH = 0.30 * H; baseSize = 64 * scale; }
  x.lineJoin = 'round'; x.lineCap = 'round'; x.textBaseline = 'middle'; x.textAlign = 'center';
  let lines, size;
  const maxW = 0.86 * W;
  for(size = baseSize; size >= 8; size -= 2 * scale){
    x.font = weight + ' ' + size + 'px ' + family;
    lines = []; let line = [], lineW = 0;
    for(const it of items){
      const wW = x.measureText(it.t).width, sW = x.measureText(' ').width;
      const add = line.length ? sW + wW : wW;
      if(lineW + add > maxW && line.length){ lines.push({items: line, w: lineW}); line = [it]; lineW = wW; }
      else { line.push(it); lineW += add; }
    }
    if(line.length) lines.push({items: line, w: lineW});
    if(lines.length * size * 1.22 <= maxH) break;
  }
  x.font = weight + ' ' + size + 'px ' + family;
  const sW = x.measureText(' ').width, stroke = Math.max(4, 6 * scale);
  lines.forEach((ln, i) => {
    const y = cy + (i - (lines.length - 1) / 2) * size * 1.22;
    let px = W / 2 - ln.w / 2;
    for(const it of ln.items){
      const cx = px + x.measureText(it.t).width / 2;
      x.lineWidth = stroke; x.strokeStyle = '#1B2A4A';
      x.strokeText(it.t, cx, y);
      x.fillStyle = it.c; x.fillText(it.t, cx, y);
      px += x.measureText(it.t).width + sW;
    }
  });
  return new Uint8Array(await (await new Promise(r => canvas.toBlob(r, 'image/png'))).arrayBuffer());
}
function buildPlan(opts){
  const pauseCut = opts.pauseCut, keepPause = opts.keepPause, n = words.length;
  if(!n) throw Error('No speech found on this tape.');
  const audioDur = opts.audioDur;
  let head = 0, tail = audioDur;
  if(words[0].s > 1.2) head = Math.max(0, words[0].s - 0.3);
  tail = Math.min(audioDur, words[n - 1].e + 0.3);
  const cuts = [];
  for(let i = 0; i < n - 1; i++){
    const gap = words[i + 1].s - words[i].e;
    if(gap > pauseCut){
      const cs = words[i].e + keepPause / 2, ce = words[i + 1].s - keepPause / 2;
      if(ce - cs > 0.15) cuts.push({s: cs, e: ce});
    }
  }
  spans = [];
  let cursor = head;
  for(const c of cuts){ if(c.s - cursor >= 0.25) spans.push({start: cursor, end: c.s}); cursor = c.e; }
  if(tail - cursor >= 0.25) spans.push({start: cursor, end: tail});
  if(!spans.length) spans.push({start: head, end: tail});
  let off = 0; spans.forEach(sp => { sp.dur = sp.end - sp.start; sp.out = off; off += sp.dur; });
  outWords = [];
  for(const w of words){
    const sp = spans.find(s => w.s >= s.start - 0.01 && w.e <= s.end + 0.01);
    if(!sp) continue;
    outWords.push({t: w.t, sOut: sp.out + (w.s - sp.start), eOut: sp.out + (w.e - sp.start)});
  }
  flags = [];
  for(let t0 = 0; t0 < off; t0 += 10){
    const count = outWords.filter(w => w.sOut >= t0 && w.sOut < t0 + 10).length;
    if(count / 10 < 1.2) flags.push({a: t0, b: Math.min(off, t0 + 10), wps: count / 10});
  }
  stats = {original: audioDur, final: off, removed: audioDur - off, cuts: cuts.length};
}

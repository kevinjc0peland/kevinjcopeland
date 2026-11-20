$('source').onchange = () => {
  sourceFile = null; duration = 0; words = []; spans = []; outWords = []; stats = null; flags = [];
  $('report').hidden = true; $('cut').disabled = true; $('errors').textContent = ''; $('result').replaceChildren(); $('bar').value = 0;
  if(sourceURL) URL.revokeObjectURL(sourceURL);
  const file = $('source').files[0];
  if(!file){ $('fileInfo').textContent = 'A raw talking-head take works best: one camera, one voice, minimal music.'; return; }
  if(!/\.(mp4|mov)$/i.test(file.name) || file.size > 500 * 1024 * 1024){ state('Choose an MP4 or MOV smaller than 500 MB.'); return; }
  sourceFile = file;
  $('fileInfo').textContent = file.name + ' · ' + (file.size / 1048576).toFixed(1) + ' MB';
  sourceURL = URL.createObjectURL(file); $('preview').src = sourceURL;
  $('preview').onloadedmetadata = () => { duration = $('preview').duration; if(!Number.isFinite(duration)) state('Could not read the duration; the read will still work.'); else state('Ready when you are.'); };
  $('preview').onerror = () => { state('The browser cannot preview this codec. The engine may still read it; if the read fails, convert the source to a standard H.264 MP4 first.'); };
};
$('read').onclick = async () => {
  if(busy) return;
  if(!sourceFile){ $('errors').textContent = 'Choose a video first.'; return; }
  lock(true); stopFlag = false; $('errors').textContent = ''; let f;
  try {
    f = await initEngine();
    state('Reading the source into browser memory…');
    await f.writeFile('source', new Uint8Array(await sourceFile.arrayBuffer()));
    hasAudio = false;
    const probe = ({message}) => { if(/Stream .*Audio:/.test(message)) hasAudio = true; };
    f.on('log', probe);
    try { await f.exec(['-i','source']); } finally { f.off('log', probe); }
    if(!hasAudio) throw Error('This file has no audio track, so there are no words to read. The machine needs a talking-head take with sound.');
    state('Extracting the audio track…');
    if(await f.exec(['-i','source','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-threads','1','-y','audio.wav'])) throw Error('Audio extraction failed. See engine details.');
    const wavBytes = await f.readFile('audio.wav');
    try { await f.deleteFile('audio.wav'); } catch(e){}
    state('Decoding audio…');
    const actx = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 16000});
    const ab = wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength);
    const decoded = await actx.decodeAudioData(ab);
    const mono = decoded.getChannelData(0);
    const audioDur = mono.length / 16000;
    if(!transcriber){
      state('Loading the speech model (first run downloads about 40 MB, once per browser)…');
      transcriber = await window.loadTranscriber(p => { if(p && p.status === 'progress') state('Loading the speech model… ' + Math.round((p.progress || 0) * 100) + '%'); });
    }
    state('Reading every word. A quiet computer takes roughly a minute per minute of tape…');
    const out = await transcriber(mono, {return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5});
    words = (out.chunks || []).map(c => ({t: (c.text || '').trim(), s: c.timestamp ? c.timestamp[0] : null, e: c.timestamp ? c.timestamp[1] : null})).filter(w => w.t);
    if(!words.length) throw Error('No words came back from the read. Try a tape with clearer speech.');
    for(let i = 0; i < words.length; i++){
      if(words[i].s == null) words[i].s = i ? words[i - 1].e : 0;
      if(words[i].e == null) words[i].e = (i + 1 < words.length && words[i + 1].s != null) ? words[i + 1].s : audioDur;
      if(words[i].e <= words[i].s) words[i].e = words[i].s + 0.2;
    }
    const opts = {
      pauseCut: Math.min(3, Math.max(0.3, Number($('pauseCut').value) || 0.8)),
      keepPause: Math.min(1.5, Math.max(0.1, Number($('keepPause').value) || 0.35)),
      audioDur: audioDur
    };
    buildPlan(opts);
    $('transcript').textContent = out.text || words.map(w => w.t).join(' ');
    $('planStats').textContent = 'Original ' + fmt(stats.original) + ' → finished ' + fmt(stats.final) + ' · ' + stats.cuts + (stats.cuts === 1 ? ' pause' : ' pauses') + ' trimmed, ' + fmt(stats.removed) + ' removed. ' + words.length + ' words on file.';
    const flagsEl = $('flags'); flagsEl.replaceChildren();
    flags.slice(0, 8).forEach(fl => {
      const li = document.createElement('li');
      li.textContent = fmt(fl.a) + '–' + fmt(fl.b) + ' · ' + fl.wps.toFixed(1) + ' words/sec — a flat stretch. Consider a beat or a cutaway here.';
      flagsEl.append(li);
    });
    $('paceNote').textContent = flags.length ? '' : 'No flat stretches. The pacing reads tight end to end.';
    $('report').hidden = false;
    state('Read complete. Check the transcript, then cut.');
    $('cut').disabled = false;
  } catch(e) {
    $('errors').textContent = e.message || String(e);
    state('The read hit a problem. Fix it above and run it again.');
  } finally {
    try { if(f && engine) await f.deleteFile('source'); } catch(e){}
    lock(false);
  }
};
$('cut').onclick = async () => {
  if(busy || !words.length) return;
  lock(true); stopFlag = false; $('errors').textContent = ''; $('result').replaceChildren(); $('bar').value = 0;
  let f, progFn = () => {};
  try {
    f = await initEngine();
    urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    const W = Number($('res').value), H = W === 720 ? 1280 : 1920;
    const enc = ['-c:v','libx264','-preset','ultrafast','-crf','23','-threads','1','-pix_fmt','yuv420p','-r','30','-c:a','aac','-ar','48000','-ac','2','-b:a','128k','-video_track_timescale','15360'];
    state('Reading the source into browser memory…');
    await f.writeFile('source', new Uint8Array(await sourceFile.arrayBuffer()));
    const segs = [];
    for(let i = 0; i < spans.length; i++){
      if(stopFlag) break;
      const sp = spans[i];
      state('Cutting ' + (i + 1) + ' of ' + spans.length + ' segments…');
      $('bar').value = (i + 1) / (spans.length + 2);
      const name = 'seg_' + i + '.mp4';
      let args = ['-ss', sp.start.toFixed(3), '-i', 'source'];
      if(!hasAudio) args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
      args.push('-filter_complex','[0:v]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',setsar=1,fps=30[v]','-map','[v]','-map',hasAudio ? '0:a:0' : '1:a:0','-t', sp.dur.toFixed(3), ...enc, '-movflags','+faststart','-y', name);
      if(await f.exec(args)) throw Error('Segment ' + (i + 1) + ' failed to encode. See engine details.');
      segs.push(name);
    }
    if(stopFlag) throw Error('Stopped. Nothing was rendered.');
    await f.writeFile('join.txt', new TextEncoder().encode(segs.map(n => "file '" + n + "'").join('\n')));
    if(await f.exec(['-f','concat','-safe','0','-i','join.txt','-c','copy','-movflags','+faststart','-y','trimmed.mp4'])) throw Error('The join failed. See engine details.');
    const beatSize = Number($('beatSize').value) || 3;
    const beats = [];
    let cur = [];
    for(let i = 0; i < outWords.length; i++){
      const w = outWords[i]; cur.push(w);
      const next = outWords[i + 1];
      const gap = next ? next.sOut - w.eOut : Infinity;
      if(cur.length >= beatSize || gap > 0.6 || /[.!?]$/.test(w.t)){
        beats.push({words: cur, start: cur[0].sOut, end: cur[cur.length - 1].eOut + 0.12});
        cur = [];
      }
    }
    if(cur.length) beats.push({words: cur, start: cur[0].sOut, end: cur[cur.length - 1].eOut + 0.12});
    const headerText = ['hDay','hSeries','hTitle'].map(id => $(id).value.trim()).filter(Boolean).join(' | ').toUpperCase();
    if(headerText){
      const hEnd = Math.min(2.5, stats ? stats.final : 2.5);
      beats.unshift({header: true, parts: headerText.split('|').map(s => s.trim()).filter(Boolean), start: 0, end: Math.max(0.5, hEnd)});
    }
    if(beats.length > 240) throw Error('This tape produced ' + beats.length + ' caption beats, more than the engine can chain in one pass. Raise words per beat to 4 and read again, or work from a shorter take.');
    state('Painting ' + beats.length + ' caption beats…');
    const pngs = [];
    for(let i = 0; i < beats.length; i++){
      const png = 'cap_' + i + '.png';
      await f.writeFile(png, await beatPNG(beats[i], W, H));
      pngs.push(png);
    }
    state('Burning captions and rendering the final cut…');
    $('bar').value = 0;
    let chain = '', ref = '0:v';
    beats.forEach((b, i) => {
      chain += '[' + ref + '][' + (i + 1) + ':v]overlay=0:0:enable=\'between(t,' + b.start.toFixed(2) + ',' + b.end.toFixed(2) + ')\'[o' + i + '];';
      ref = 'o' + i;
    });
    chain += '[' + ref + ']format=yuv420p[vout]';
    const args2 = ['-i','trimmed.mp4'];
    pngs.forEach(p => args2.push('-i', p));
    args2.push('-filter_complex', chain, '-map','[vout]','-map','0:a:0', ...enc, '-movflags','+faststart','-y','out.mp4');
    progFn = ({progress}) => { $('bar').value = Math.max(0, Math.min(0.99, progress || 0)); };
    f.on('progress', progFn);
    const code = await f.exec(args2);
    f.off('progress', progFn);
    if(code) throw Error('The caption burn failed. See engine details.');
    const bytes = await f.readFile('out.mp4');
    const url = URL.createObjectURL(new Blob([bytes], {type: 'video/mp4'})); urls.push(url);
    const name = 'Edit machine - ' + safeName($('hTitle').value || $('hDay').value || '30 for 30') + '.mp4';
    const v = document.createElement('video'); v.controls = true; v.playsInline = true; v.src = url;
    const a = document.createElement('a'); a.className = 'download'; a.href = url; a.download = name; a.textContent = 'Download the finished cut';
    $('result').replaceChildren(v, a);
    $('bar').value = 1;
    state('Done: ' + fmt(stats.final) + ' finished, ' + (bytes.length / 1048576).toFixed(1) + ' MB. Preview it here, then download before leaving this tab.');
  } catch(e) {
    $('errors').textContent = e.message || String(e);
    state('The cut hit a problem. Fix it above and run it again.');
  } finally {
    f.off('progress', progFn);
    if(f && engine){
      for(const n of ['source','join.txt','trimmed.mp4','out.mp4']){ try { await f.deleteFile(n); } catch(e){} }
      for(let i = 0; i < 300; i++){
        try { await f.deleteFile('seg_' + i + '.mp4'); } catch(e){ break; }
      }
      for(let i = 0; i < 300; i++){
        try { await f.deleteFile('cap_' + i + '.png'); } catch(e){ break; }
      }
    }
    lock(false);
  }
};
$('check').onclick = async () => {
  if(busy) return;
  lock(true); $('errors').textContent = ''; let f;
  try {
    f = await initEngine();
    state('Running the engine check…');
    const W = Number($('res').value), H = W === 720 ? 1280 : 1920;
    const code = await f.exec(['-f','lavfi','-i','testsrc=size=' + W + 'x' + H + ':rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','2','-c:v','libx264','-preset','ultrafast','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-y','check.mp4']);
    if(code) throw Error('Engine check failed. See engine details.');
    const bytes = await f.readFile('check.mp4');
    try { await f.deleteFile('check.mp4'); } catch(e){}
    state('Engine check passed: the renderer encoded a ' + W + ' × ' + H + ' clip locally.');
  } catch(e) {
    $('errors').textContent = e.message || String(e);
    state('Engine check failed.');
  } finally { lock(false); }
};
$('cancel').onclick = () => {
  stopFlag = true;
  if(engine){ engine.terminate(); engine = null; }
  loading = null;
  state('Stopping. Reload the page to start fresh.');
};

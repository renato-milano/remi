/* Lavagna "indica e chiedi": domanda vicino al cursore, risposta e disegni dell'agente. */
const bridge = window.pointer;

const layer = document.getElementById('layer');
const anchor = document.getElementById('anchor');
const ask = document.getElementById('ask');
const askInput = document.getElementById('askInput');
const card = document.getElementById('card');
const cardStatus = document.getElementById('cardStatus');
const cardBody = document.getElementById('cardBody');
const cardClose = document.getElementById('cardClose');
const panel = document.getElementById('panel');
const panelQ = document.getElementById('panelQ');
const panelTitle = document.getElementById('panelTitle');
const panelDraw = document.getElementById('panelDraw');
const panelSvg = document.getElementById('panelSvg');
const panelClose = document.getElementById('panelClose');

const BOX_W = 380;
const GAP = 22;
let at = { x: 0, y: 0 };
let focusBox; // zona indicata (se l'utente ha circoscritto un'area)

/** Posiziona un box vicino al punto indicato, restando dentro lo schermo. */
function place(el, p) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const h = el.offsetHeight || 60;
  let x = p.x + GAP;
  if (x + BOX_W > vw - 12) x = p.x - GAP - BOX_W;
  let y = p.y + GAP;
  if (y + h > vh - 12) y = Math.max(12, p.y - GAP - h);
  el.style.left = `${Math.max(12, x)}px`;
  el.style.top = `${y}px`;
}

function clearDrawings() {
  layer.replaceChildren();
}

/* --- alone + scia: solo un riscontro visivo del passaggio, niente tracciato --- */
const TRAIL_MS = 420; // durata della scia
const trailCanvas = document.getElementById('trail');
const tctx = trailCanvas.getContext('2d');
let trail = []; // { x, y, t }
let halo; // ultima posizione del mouse, finché la hotkey è premuta
let trailFrame = 0;

function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  trailCanvas.width = Math.round(window.innerWidth * dpr);
  trailCanvas.height = Math.round(window.innerHeight * dpr);
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

function paintTrail() {
  const now = performance.now();
  trail = trail.filter((p) => now - p.t < TRAIL_MS);
  tctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  tctx.lineCap = 'round';
  for (let i = 1; i < trail.length; i++) {
    const life = 1 - (now - trail[i].t) / TRAIL_MS;
    tctx.strokeStyle = `rgba(94,242,160,${0.5 * life})`;
    tctx.lineWidth = 3 + 9 * life;
    tctx.beginPath();
    tctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    tctx.lineTo(trail[i].x, trail[i].y);
    tctx.stroke();
  }
  if (halo) {
    // mentre parli l'alone si allarga col volume della voce
    const r = 46 + 40 * mic.level;
    const g = tctx.createRadialGradient(halo.x, halo.y, 0, halo.x, halo.y, r);
    g.addColorStop(0, `rgba(94,242,160,${0.35 + 0.25 * mic.level})`);
    g.addColorStop(1, 'rgba(94,242,160,0)');
    tctx.fillStyle = g;
    tctx.beginPath();
    tctx.arc(halo.x, halo.y, r, 0, Math.PI * 2);
    tctx.fill();
  }
  trailFrame = trail.length || halo ? requestAnimationFrame(paintTrail) : 0;
}

function trailTo(p) {
  halo = p;
  trail.push({ ...p, t: performance.now() });
  if (!trailFrame) trailFrame = requestAnimationFrame(paintTrail);
}

/** Fine del gesto: l'alone si spegne e la scia svanisce da sola. */
function endTrail() {
  halo = undefined;
  if (!trailFrame) trailFrame = requestAnimationFrame(paintTrail);
}

/* --- microfono: PCM 16 kHz mono finché la hotkey è premuta --- */
const SAMPLE_RATE = 16000;
const MIC_WARM_MS = 30000; // il microfono resta aperto un po' dopo l'uso: la frase successiva non perde l'inizio
const SPEECH_RMS = 0.015; // soglia di "parlato" per blocco
const SPEECH_MIN_MS = 350; // quanto parlato serve per considerarla una domanda a voce
const WORKLET = `registerProcessor('rec', class extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
});`;
const mic = { level: 0, recording: false, chunks: [], speechMs: 0 };

async function micOpen() {
  if (mic.ctx) return;
  mic.stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  mic.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  await mic.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
  const node = new AudioWorkletNode(mic.ctx, 'rec');
  node.port.onmessage = (e) => {
    const block = e.data;
    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const rms = Math.sqrt(sum / block.length);
    mic.level = mic.level * 0.7 + Math.min(1, rms * 12) * 0.3;
    if (listen.on) return listenBlock(block, rms);
    if (!mic.recording) return wakeBlock(block, rms);
    mic.chunks.push(block);
    if (rms > SPEECH_RMS) mic.speechMs += (block.length / SAMPLE_RATE) * 1000;
  };
  mic.ctx.createMediaStreamSource(mic.stream).connect(node);
}

function micClose() {
  for (const t of mic.stream?.getTracks() ?? []) t.stop();
  void mic.ctx?.close();
  mic.ctx = undefined;
  mic.stream = undefined;
  mic.level = 0;
}

bridge.onRecStart(async () => {
  clearTimeout(mic.warmTimer);
  mic.chunks = [];
  mic.speechMs = 0;
  mic.recording = true;
  mic.startedAt = performance.now();
  try {
    await micOpen();
    await mic.ctx.resume();
  } catch (err) {
    console.warn('microfono non disponibile', err);
    mic.recording = false;
  }
});

/** "Ti ho sentito": due note brevi e morbide, generate al momento (niente file audio). */
function playAck() {
  try {
    const ctx = mic.ctx && mic.ctx.state !== 'closed' ? mic.ctx : new AudioContext();
    const t = ctx.currentTime;
    for (const [i, freq] of [660, 990].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    }
  } catch {
    /* audio non disponibile: resta il riscontro visivo */
  }
}
bridge.onAck(playAck);

bridge.onRecStop(() => {
  const durationMs = Math.round(performance.now() - (mic.startedAt || performance.now()));
  mic.recording = false;
  mic.level = 0;
  const speech = mic.speechMs >= SPEECH_MIN_MS;
  bridge.sendRecData({ wav: speech ? encodeWav(mic.chunks) : null, speech, durationMs });
  mic.chunks = [];
  clearTimeout(mic.warmTimer);
  if (!wake.enabled) mic.warmTimer = setTimeout(micClose, MIC_WARM_MS); // in ascolto di "Hey Remi" resta aperto
});

/* --- "Hey Remi": rilevatore di voce leggero; a whisper (locale) solo i pezzi di parlato --- */
const VAD_START_MS = 60; // parlato continuo per aprire un pezzo
const VAD_END_MS = 650; // silenzio che chiude un pezzo
const VAD_PREROLL_MS = 300; // audio prima dell'inizio, per non tagliare la prima sillaba
const WAKE_MIN_SPEECH_MS = 300;
const WAKE_MAX_MS = 8000;
const blockMs = (block) => (block.length / SAMPLE_RATE) * 1000;
const wake = {
  enabled: false,
  pausedUntil: 0,
  noise: 0.004, // rumore di fondo stimato
  run: 0, // ms di parlato consecutivo prima di aprire un pezzo
  active: false,
  pre: [],
  seg: [],
  segMs: 0,
  speechMs: 0,
  silenceMs: 0,
  tail: undefined, // audio dopo un pezzo inviato, finché il main non risponde
};
const vadThreshold = () => Math.max(0.008, wake.noise * 3);

function wakeBlock(block, rms) {
  if (!wake.enabled) return;
  // pezzo appena inviato: tieni l'audio che segue (potrebbe essere la domanda)
  if (wake.tail) {
    wake.tail.push(block);
    if (wake.tail.length * blockMs(block) > 10000) wake.tail = undefined;
    return;
  }
  if (speech.playing || performance.now() < wake.pausedUntil) return;
  const ms = blockMs(block);
  const loud = rms > vadThreshold();
  if (!wake.active) {
    if (!loud) wake.noise = wake.noise * 0.98 + rms * 0.02;
    wake.pre.push(block);
    while (wake.pre.length * ms > VAD_PREROLL_MS) wake.pre.shift();
    wake.run = loud ? wake.run + ms : 0;
    if (wake.run < VAD_START_MS) return;
    Object.assign(wake, { active: true, seg: [...wake.pre], segMs: wake.pre.length * ms, speechMs: wake.run, silenceMs: 0 });
    return;
  }
  wake.seg.push(block);
  wake.segMs += ms;
  if (loud) {
    wake.speechMs += ms;
    wake.silenceMs = 0;
  } else {
    wake.silenceMs += ms;
  }
  if (wake.silenceMs < VAD_END_MS && wake.segMs < WAKE_MAX_MS) return;
  const seg = wake.seg;
  const enough = wake.speechMs >= WAKE_MIN_SPEECH_MS;
  Object.assign(wake, { active: false, seg: [], pre: [], run: 0 });
  if (!enough) return;
  wake.tail = [];
  bridge.sendWakeSegment(encodeWav(seg));
}

bridge.onWakeConfig(async ({ enabled }) => {
  wake.enabled = enabled;
  if (!enabled) return;
  clearTimeout(mic.warmTimer);
  try {
    await micOpen();
    await mic.ctx.resume();
  } catch (err) {
    console.warn('microfono non disponibile per "Hey Remi"', err);
    wake.enabled = false;
  }
});
// il main ha deciso: niente "Hey Remi" in quel pezzo (o la domanda c'era già)
bridge.onWakeDone(() => {
  wake.tail = undefined;
});

/* --- dopo "Hey Remi": ascolta la domanda fino alla pausa --- */
const LISTEN_END_MS = 900;
const LISTEN_NO_SPEECH_MS = 6000;
const LISTEN_MAX_MS = 15000;
const LISTEN_HEARD_MS = 200; // parlato minimo perché la domanda sia "iniziata" (non basta un rumore)
const listen = { on: false, chunks: [], ms: 0, speechMs: 0, silenceMs: 0, heard: false };

function listenBlock(block, rms) {
  const ms = blockMs(block);
  listen.chunks.push(block);
  listen.ms += ms;
  if (rms > vadThreshold()) {
    listen.speechMs += ms;
    if (listen.speechMs >= LISTEN_HEARD_MS) listen.heard = true;
    listen.silenceMs = 0;
  } else {
    listen.silenceMs += ms;
  }
  const done =
    (listen.heard && listen.silenceMs >= LISTEN_END_MS) ||
    (!listen.heard && listen.ms >= LISTEN_NO_SPEECH_MS) ||
    listen.ms >= LISTEN_MAX_MS;
  if (!done) return;
  listen.on = false;
  endTrail();
  const spoke = listen.speechMs >= SPEECH_MIN_MS;
  bridge.sendListenData({ wav: spoke ? encodeWav(listen.chunks) : null, speech: spoke });
  wake.pausedUntil = performance.now() + 300;
}

bridge.onListen((p) => {
  // parti dall'audio arrivato dopo "Hey Remi" (la domanda può essere già iniziata)
  const tail = wake.tail || [];
  wake.tail = undefined;
  Object.assign(listen, { on: true, chunks: [], ms: 0, speechMs: 0, silenceMs: 0, heard: false });
  for (const b of tail) {
    let sum = 0;
    for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
    listenBlock(b, Math.sqrt(sum / b.length));
    if (!listen.on) return;
  }
  trailTo(p); // alone sul punto: Remi ascolta
});

/** WAV PCM 16 bit mono dai blocchi Float32. */
function encodeWav(chunks) {
  const n = chunks.reduce((s, c) => s + c.length, 0);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, t) => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  let o = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++, o += 2) {
      const x = Math.max(-1, Math.min(1, c[i]));
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
  }
  return buf;
}

/* --- voce di Remi: audio dal cloud o voce di sistema, una frase dopo l'altra --- */
const speech = { queue: [], playing: undefined };

function speakNext() {
  if (speech.playing || !speech.queue.length) return;
  const item = speech.queue.shift();
  const done = () => {
    speech.playing = undefined;
    // l'eco della voce di Remi non deve far scattare "Hey Remi"
    wake.pausedUntil = performance.now() + 800;
    speakNext();
  };
  if (item.audio) {
    const a = new Audio(`data:${item.mediaType || 'audio/wav'};base64,${item.audio}`);
    speech.playing = a;
    a.onended = done;
    a.onerror = done;
    a.onplaying = () => {
      bridge.speaking();
      // il passo si disegna per tutta la durata della frase
      if (item.step !== undefined) drawStep(item.step, (Number.isFinite(a.duration) ? a.duration * 1000 : 0) || sayMs(item.text));
    };
    void a.play().catch(done);
  } else if (item.text) {
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = item.lang && item.lang !== 'auto' ? item.lang : 'it'; // il sistema sceglie una voce di quella lingua
    u.onend = done;
    u.onerror = done;
    u.onstart = () => {
      bridge.speaking();
      if (item.step !== undefined) drawStep(item.step, sayMs(item.text));
    };
    speech.playing = u;
    speechSynthesis.speak(u);
  } else {
    done();
  }
}

function stopSpeaking() {
  speech.queue = [];
  if (speech.playing instanceof Audio) speech.playing.pause();
  speechSynthesis.cancel();
  speech.playing = undefined;
}

bridge.onSpeak((item) => {
  speech.queue.push(item);
  speakNext();
});

/* --- pannello di spiegazione: SVG disegnato mentre la voce spiega --- */
const PANEL_W = 520;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan']);
const SVG_ATTRS = new Set([
  'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'dx', 'dy',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity',
  'fill-opacity', 'stroke-opacity', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'transform', 'marker-end', 'marker-start',
]);
/** Classi ammesse sull'SVG del modello (colori della palette e frecce). */
const SVG_CLASSES = new Set(['b', 'r', 'v', 'g', 'k', 'a']);
const panelState = { steps: [], drawn: -1, voiced: false, ended: false, busyUntil: 0, timer: undefined, want: undefined };

function clearPanel() {
  clearTimeout(panelState.timer);
  Object.assign(panelState, { steps: [], drawn: -1, voiced: false, ended: false, busyUntil: 0, want: undefined });
  panel.classList.add('hidden');
  panelDraw.replaceChildren();
  panelSvg.setAttribute('viewBox', '0 0 600 380');
}

/** Accanto alla zona indicata (o al punto), dal lato con più spazio, senza coprirla. */
function placePanel() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const h = panel.offsetHeight || 300;
  const box = focusBox || { x: at.x - 30, y: at.y, w: 60, h: 0 };
  const roomRight = vw - (box.x + box.w);
  let x = roomRight >= box.x ? box.x + box.w + 24 : box.x - 24 - PANEL_W;
  x = Math.max(16, Math.min(vw - PANEL_W - 16, x));
  const y = Math.max(16, Math.min(vh - h - 16, box.y + box.h / 2 - h / 2));
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
}

/**
 * SVG scritto dal modello → solo forme e testo. La lavagna ha accesso alle funzioni
 * dell'app (preload): niente script, link, stili, riferimenti esterni o eventi.
 */
function sanitizeSvg(fragment) {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${fragment}</svg>`, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return [];
  const clean = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE || !SVG_TAGS.has(node.localName)) return null;
    const el = document.createElementNS(SVG_NS, node.localName);
    for (const { name, value } of [...node.attributes]) {
      if (name === 'class') {
        const cls = value.split(/\s+/).filter((c) => SVG_CLASSES.has(c));
        if (cls.length) el.setAttribute('class', cls.join(' '));
        continue;
      }
      if (!SVG_ATTRS.has(name)) continue;
      if (/url\(/i.test(value) && value.trim() !== 'url(#arrow)') continue;
      if (/javascript:|expression\(/i.test(value)) continue;
      el.setAttribute(name, value);
    }
    for (const child of node.childNodes) {
      // il testo sta solo dentro text/tspan
      if (child.nodeType === Node.TEXT_NODE && !['text', 'tspan'].includes(node.localName)) continue;
      const c = clean(child);
      if (c) el.appendChild(c);
    }
    return el;
  };
  return [...doc.documentElement.childNodes].map(clean).filter((n) => n && n.nodeType === Node.ELEMENT_NODE);
}

/**
 * Una scritta più larga della forma che la contiene (il font a mano è più largo di
 * quanto il modello stima) si rimpicciolisce finché ci sta, e rientra nei bordi.
 */
function fitTexts(group) {
  const shapes = [...panelDraw.querySelectorAll('rect, circle, ellipse, polygon')]
    .map((s) => [s, s.getBBox()])
    .filter(([, b]) => b.width > 0 && b.height > 0);
  for (const t of group.querySelectorAll('text')) {
    let tb = t.getBBox();
    const cx = tb.x + tb.width / 2;
    const cy = tb.y + tb.height / 2;
    // la forma più piccola che contiene il centro della scritta ed è più alta di lei
    const host = shapes
      .filter(([, b]) => cx > b.x && cx < b.x + b.width && cy > b.y && cy < b.y + b.height && b.height >= tb.height * 0.8)
      .sort((a, b) => a[1].width * a[1].height - b[1].width * b[1].height)[0];
    if (!host) continue;
    const hb = host[1];
    const room = hb.width - 12;
    if (tb.width > room) {
      const size = Number.parseFloat(getComputedStyle(t).fontSize) || 17;
      t.setAttribute('font-size', String(Math.max(10, Math.floor(size * (room / tb.width)))));
      tb = t.getBBox();
    }
    // ancora fuori da un lato (testo allineato a sinistra o a destra): riportalo dentro
    const dx = tb.x < hb.x + 6 ? hb.x + 6 - tb.x : tb.x + tb.width > hb.x + hb.width - 6 ? hb.x + hb.width - 6 - (tb.x + tb.width) : 0;
    if (dx) t.setAttribute('x', String((Number(t.getAttribute('x')) || 0) + dx));
  }
}

/** Le forme "disegnabili" di un sottoalbero, nell'ordine in cui compaiono. */
function drawables(root) {
  return [root, ...root.querySelectorAll('*')].filter((e) => e.localName !== 'g' && e.localName !== 'tspan');
}

/** Disegna un passo nell'arco di `ms`: tratti che si tracciano, poi riempimenti e scritte. */
function drawStep(i, ms) {
  const step = panelState.steps[i];
  if (i <= panelState.drawn) return;
  // la voce è partita ma il disegno del passo non è ancora arrivato: disegnalo appena c'è,
  // nel tempo che resta della frase
  if (!step) {
    panelState.want = { i, endAt: Date.now() + ms };
    return;
  }
  // passi precedenti non ancora disegnati (voce saltata): subito, senza animazione
  for (let k = panelState.drawn + 1; k < i; k++) drawStepNow(k);
  panelState.drawn = i;
  const group = document.createElementNS(SVG_NS, 'g');
  for (const el of sanitizeSvg(step.svg)) group.appendChild(el);
  panelDraw.appendChild(group);
  fitTexts(group);
  const items = drawables(group);
  const slot = (ms * 0.85) / Math.max(1, items.length);
  items.forEach((el, k) => {
    const delay = k * slot;
    const dur = Math.max(250, slot * 1.2);
    if (el.localName === 'text') {
      el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], {
        duration: Math.min(500, dur), delay, fill: 'both', easing: 'ease-out',
      });
      return;
    }
    let len = 0;
    try {
      len = el.getTotalLength();
    } catch {
      /* forma senza lunghezza */
    }
    if (len > 0 && !el.hasAttribute('stroke-dasharray')) {
      el.style.strokeDasharray = `${len}`;
      const a = el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
        duration: dur, delay, fill: 'both', easing: 'ease-in-out',
      });
      a.onfinish = () => {
        el.style.strokeDasharray = '';
      };
    }
    // il riempimento arriva quando il contorno è quasi chiuso
    el.animate([{ fillOpacity: 0 }, { fillOpacity: 1 }], {
      duration: Math.min(400, dur), delay: delay + dur * 0.7, fill: 'both',
    });
  });
  fitPanel();
  placePanel();
}

/**
 * Area del disegno adattata al contenuto: l'altezza segue il disegno; la larghezza
 * resta 600 (niente cambi di scala) a meno che il modello non sbordi, e allora si
 * allarga quel tanto che basta perché nessuna scritta venga tagliata.
 */
function fitPanel() {
  try {
    const bb = panelDraw.getBBox();
    if (!bb.width && !bb.height) return;
    const x0 = Math.min(0, bb.x - 12);
    const w = Math.max(600, bb.x + bb.width + 12) - x0;
    // in alto si taglia lo spazio vuoto, ma si include ciò che il modello ha disegnato sopra lo 0
    const y0 = bb.y - 16;
    const h = Math.max(160, bb.height + 32);
    panelSvg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
  } catch {
    /* svg non ancora visibile */
  }
}

function drawStepNow(i) {
  const step = panelState.steps[i];
  if (!step) return;
  const group = document.createElementNS(SVG_NS, 'g');
  for (const el of sanitizeSvg(step.svg)) group.appendChild(el);
  panelDraw.appendChild(group);
  fitTexts(group);
  panelState.drawn = i;
  fitPanel();
}

/** Durata stimata di una frase detta (senza voce o prima di conoscere l'audio). */
function sayMs(say) {
  return Math.max(2200, (say?.length || 0) * 62);
}

/** Senza voce: un passo dopo l'altro, appena arriva e il precedente è finito. */
function drawTimedNext() {
  const next = panelState.drawn + 1;
  if (!panelState.steps[next]) return;
  const wait = Math.max(0, panelState.busyUntil - Date.now());
  clearTimeout(panelState.timer);
  panelState.timer = setTimeout(() => {
    const ms = sayMs(panelState.steps[next].say);
    panelState.busyUntil = Date.now() + ms;
    drawStep(next, ms);
    drawTimedNext();
  }, wait);
}

bridge.onPanelStart(({ title, voiced }) => {
  clearPanel();
  // la domanda (se a voce) passa dalla scheda al pannello, che prende il suo posto
  const q = cardBody.querySelector('.q');
  panelQ.textContent = q ? q.textContent : '';
  card.classList.add('hidden');
  panelTitle.textContent = title;
  panelState.voiced = voiced;
  panel.classList.remove('hidden');
  placePanel();
});

bridge.onPanelStep((step) => {
  panelState.steps[step.index] = step;
  const want = panelState.want;
  if (want && want.i === step.index) {
    panelState.want = undefined;
    drawStep(step.index, Math.max(900, want.endAt - Date.now()));
  }
  if (!panelState.voiced) drawTimedNext();
});

bridge.onPanelEnd(() => {
  panelState.ended = true;
});

// voce non disponibile per un passo: disegnalo comunque
bridge.onStep((i) => drawStep(i, sayMs(panelState.steps[i]?.say)));

function reset() {
  clearPanel();
  stopSpeaking();
  endTrail();
  clearDrawings();
  ask.classList.add('hidden');
  card.classList.add('hidden');
  anchor.classList.add('hidden');
  cardBody.replaceChildren();
  cardStatus.textContent = '';
}

bridge.onTrace((p) => {
  if (!ask.classList.contains('hidden') || !card.classList.contains('hidden')) reset();
  trailTo(p);
});

bridge.onAsk((p) => {
  // area: niente segni sullo schermo (la scia svanisce); punto: anello pulsante
  reset();
  at = p;
  focusBox = p.box;
  anchor.style.left = `${p.x}px`;
  anchor.style.top = `${p.y}px`;
  anchor.classList.toggle('hidden', Boolean(p.area));
  askInput.value = '';
  ask.classList.remove('hidden');
  place(ask, p);
  setTimeout(() => askInput.focus(), 20);
});

askInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    ask.classList.add('hidden');
    bridge.submit(askInput.value);
  } else if (ev.key === 'Escape') {
    ev.preventDefault();
    reset();
    bridge.cancel();
  }
});

// mentre chiede, la finestra cattura i click: un click fuori dalla casella annulla
document.addEventListener('mousedown', (ev) => {
  if (ask.classList.contains('hidden') || ask.contains(ev.target)) return;
  reset();
  bridge.cancel();
});

// domanda a voce: nessuna casella, ma l'ancora della risposta e il punto indicato
bridge.onAnchor((p) => {
  reset();
  at = p;
  focusBox = p.box;
  anchor.style.left = `${p.x}px`;
  anchor.style.top = `${p.y}px`;
  anchor.classList.toggle('hidden', Boolean(p.area));
});

bridge.onQuestion((text) => {
  const q = document.createElement('p');
  q.className = 'q';
  q.textContent = `«${text}»`;
  cardBody.prepend(q);
  card.classList.remove('hidden');
  place(card, at);
});

bridge.onThinking(() => {
  cardBody.replaceChildren();
  cardStatus.innerHTML = '<span class="dots">sto guardando</span>';
  card.classList.remove('hidden');
  place(card, at);
});

bridge.onStatus((text) => {
  cardStatus.textContent = text || '';
});

bridge.onAnswer((text) => {
  cardStatus.textContent = '';
  const p = document.createElement('p');
  p.innerHTML = inlineMarkdown(text);
  cardBody.appendChild(p);
  card.classList.remove('hidden');
  place(card, at);
});

/** Markdown minimo per la scheda: grassetto, corsivo, `codice`; il resto è testo (escapato). */
function inlineMarkdown(text) {
  return text
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

bridge.onDone(() => {
  cardStatus.textContent = '';
  if (!cardBody.childElementCount) card.classList.add('hidden');
});

bridge.onClear(() => reset());

// la ✕ chiude scheda e disegni; la scheda è cliccabile, il resto lascia passare i click
for (const btn of [cardClose, panelClose]) {
  btn.addEventListener('click', () => {
    reset();
    bridge.cancel();
  });
}
document.addEventListener('mousemove', (ev) => {
  if (!ask.classList.contains('hidden')) return; // mentre chiede la finestra è già interattiva
  const over = (el) => !el.classList.contains('hidden') && el.contains(ev.target);
  bridge.setInteractive(over(card) || over(panel));
});

/* --- disegni: coordinate già locali alla finestra --- */
function tag(text) {
  const t = document.createElement('span');
  t.className = 'tag';
  t.textContent = text;
  return t;
}

function render(item, i) {
  const el = document.createElement('div');
  el.className = `ov ov-${item.type}`;
  el.style.left = `${item.x}px`;
  el.style.top = `${item.y}px`;
  el.style.animationDelay = `${i * 120}ms`; // compaiono uno dopo l'altro
  if (item.x > window.innerWidth - 240) el.classList.add('flip');
  switch (item.type) {
    case 'point': {
      const ring = document.createElement('div');
      ring.className = 'ring';
      el.appendChild(ring);
      if (item.text) el.appendChild(tag(item.text));
      break;
    }
    case 'highlight':
      el.style.width = `${Math.max(8, item.w || 0)}px`;
      el.style.height = `${Math.max(8, item.h || 0)}px`;
      if (item.text) el.appendChild(tag(item.text));
      break;
    case 'label': {
      const dot = document.createElement('div');
      dot.className = 'dot';
      const leader = document.createElement('div');
      leader.className = 'leader';
      el.append(dot, leader, tag(item.text || ''));
      break;
    }
    case 'note':
      el.textContent = item.text || '';
      break;
    default:
      return null;
  }
  return el;
}

bridge.onDraw(({ items, clear }) => {
  if (clear) clearDrawings();
  items.forEach((item, i) => {
    const el = render(item, i);
    if (el) layer.appendChild(el);
  });
});

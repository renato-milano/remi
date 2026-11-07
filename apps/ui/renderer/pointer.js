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
const panelBadges = document.getElementById('panelBadges');
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

/** Finestra indicata (tasto tenuto senza muovere il mouse): si illumina per un istante. */
bridge.onWindow((box) => {
  const el = document.createElement('div');
  el.className = 'win-glow';
  Object.assign(el.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
});

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
/** Larghezza del pannello: circa un terzo dello schermo, così il disegno si legge da seduti. */
function panelWidth() {
  return Math.round(Math.max(520, Math.min(760, window.innerWidth * 0.35)));
}
/** Un colore per passo (se il modello non ne sceglie): riquadri, frecce, numero e segno sullo schermo lo condividono. */
const STEP_INKS = ['b', 'g', 'r', 'v', 'p'];
/** Gli stessi colori, più chiari, per i segni sullo schermo (di solito scuro). */
const SCREEN_INK = { b: '#7cb0ff', g: '#ffcf5c', r: '#ff8f7a', v: '#5ef2a0', p: '#c3a8ff', k: '#d8dcd6' };
const MARK_DEFAULT = '#ffbf5c';
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan']);
/** Primitive "agganciate": il modello dice dove, la lavagna calcola misure e collegamenti (vedi expandAnchored). */
const ANCHORED_TAGS = new Set(['box', 'arrow', 'label', 'icon']);
/** Elementi che possono contenere testo. */
const TEXT_TAGS = new Set(['text', 'tspan', 'box', 'label']);
const SVG_ATTRS = new Set([
  'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'dx', 'dy',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity',
  'fill-opacity', 'stroke-opacity', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'transform', 'marker-end', 'marker-start',
  // primitive agganciate
  'from', 'to', 'for', 'side', 'name', 'w', 'h', 'size', 'bend', 'label', 'at', 'span',
]);
/** Classi ammesse sull'SVG del modello (colori della palette e frecce). */
const SVG_CLASSES = new Set(['b', 'r', 'v', 'g', 'p', 'k', 'a']);
const panelState = { steps: [], drawn: -1, voiced: false, ended: false, busyUntil: 0, timer: undefined, want: undefined, grid: undefined, ownColors: false };
const remiCursor = document.getElementById('remiCursor');
const marksSvg = document.getElementById('marks');
// il font a mano va caricato prima di misurare i testi dei riquadri
document.fonts.load('17px Virgil').catch(() => {});

function clearPanel() {
  clearTimeout(panelState.timer);
  Object.assign(panelState, { steps: [], drawn: -1, voiced: false, ended: false, busyUntil: 0, want: undefined, grid: undefined, ownColors: false });
  stopPen();
  pen.pos = undefined; // un nuovo pannello: la penna compare sul primo tratto
  panel.classList.add('hidden');
  panelDraw.replaceChildren();
  panelBadges.replaceChildren();
  marksSvg.replaceChildren();
  panelSvg.setAttribute('viewBox', '0 0 600 380');
}

/** Accanto alla zona indicata (o al punto), dal lato con più spazio, senza coprirla. */
function placePanel() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const h = panel.offsetHeight || 300;
  const box = focusBox || { x: at.x - 30, y: at.y, w: 60, h: 0 };
  const roomRight = vw - (box.x + box.w);
  const pw = panelWidth();
  let x = roomRight >= box.x ? box.x + box.w + 24 : box.x - 24 - pw;
  x = Math.max(16, Math.min(vw - pw - 16, x));
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
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    if (!SVG_TAGS.has(node.localName) && !ANCHORED_TAGS.has(node.localName)) return null;
    const el = document.createElementNS(SVG_NS, node.localName);
    for (const { name, value } of [...node.attributes]) {
      // gli id del modello non diventano id del documento (niente collisioni con #arrow, #rough)
      if (name === 'id') {
        if (/^[\w-]{1,40}$/.test(value)) el.setAttribute('data-id', value);
        continue;
      }
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
      // il testo sta solo dentro text/tspan e nelle primitive con una scritta
      if (child.nodeType === Node.TEXT_NODE && !TEXT_TAGS.has(node.localName)) continue;
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
      t.setAttribute('font-size', String(Math.max(MIN_FONT, Math.floor(size * (room / tb.width)))));
      tb = t.getBBox();
    }
    // ancora fuori da un lato (testo allineato a sinistra o a destra): riportalo dentro
    const dx = tb.x < hb.x + 6 ? hb.x + 6 - tb.x : tb.x + tb.width > hb.x + hb.width - 6 ? hb.x + hb.width - 6 - (tb.x + tb.width) : 0;
    if (dx) t.setAttribute('x', String((Number(t.getAttribute('x')) || 0) + dx));
  }
}

/* --- primitive agganciate: il modello decide dove, la lavagna misura e collega --- */
const INK = { b: '#4a78c2', r: '#c9584a', v: '#3f9a66', g: '#c99a2e', p: '#7a5cc2', k: '#8c8a80' };
const DARK = '#1f2a24';

/** Icone a tratto, disegnate in un quadrato 24×24. */
const ICONS = {
  rete: ['M6 6 L18 7 M6 6 L12 18 M18 7 L12 18', 'M3.5 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0', 'M15.5 7a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0', 'M9.5 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0'],
  doc: ['M6 3 H14 L19 8 V21 H6 Z', 'M14 3 V8 H19', 'M9 12 H16 M9 15.5 H16 M9 19 H13'],
  docs: ['M8 6 H18 V21 H8 Z', 'M5 3 H15 V6 M5 3 V18 H8', 'M11 11 H15 M11 14.5 H15'],
  ok: ['M4 12.5 L9.5 18 L20 6'],
  no: ['M5 5 L19 19 M19 5 L5 19'],
  ingranaggio: ['M8.5 12a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0', 'M12 2.5 V5.5 M12 18.5 V21.5 M2.5 12 H5.5 M18.5 12 H21.5 M5.3 5.3 L7.4 7.4 M16.6 16.6 L18.7 18.7 M5.3 18.7 L7.4 16.6 M16.6 7.4 L18.7 5.3', 'M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0'],
  persona: ['M8.5 7.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0', 'M4.5 21 C5 15.5 8 13.5 12 13.5 C16 13.5 19 15.5 19.5 21'],
  db: ['M5 6 C5 2.7 19 2.7 19 6 C19 9.3 5 9.3 5 6 Z', 'M5 6 V18 C5 21.3 19 21.3 19 18 V6', 'M5 12 C5 15.3 19 15.3 19 12'],
  nuvola: ['M7 19 H17.5 A4 4 0 0 0 17.5 11 A5.5 5.5 0 0 0 7 10 A4.5 4.5 0 0 0 7 19 Z'],
  lampadina: ['M9 17 C9 14 6 12.5 6 9 A6 6 0 0 1 18 9 C18 12.5 15 14 15 17 Z', 'M9.5 20 H14.5 M10.5 22.5 H13.5'],
  orologio: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M12 6.5 V12 L16 14.5'],
  lucchetto: ['M5 11 H19 V21 H5 Z', 'M8 11 V7.5 A4 4 0 0 1 16 7.5 V11', 'M12 15 V17.5'],
  chip: ['M7 7 H17 V17 H7 Z', 'M10 10 H14 V14 H10 Z', 'M9.5 3.5 V7 M14.5 3.5 V7 M9.5 17 V20.5 M14.5 17 V20.5 M3.5 9.5 H7 M3.5 14.5 H7 M17 9.5 H20.5 M17 14.5 H20.5'],
  fulmine: ['M13.5 2.5 L5.5 13.5 H11.5 L10.5 21.5 L18.5 10.5 H12.5 Z'],
  mondo: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M3 12 H21', 'M12 3 C8.5 7 8.5 17 12 21 C15.5 17 15.5 7 12 3'],
  schermo: ['M3 4.5 H21 V16 H3 Z', 'M9 20.5 H15 M12 16 V20.5'],
  cartella: ['M3 6 H9.5 L11.5 8.5 H21 V19 H3 Z'],
  grafico: ['M3.5 20.5 H20.5', 'M6 20.5 V13 M11 20.5 V8 M16 20.5 V11 M20 20.5 V5'],
  posta: ['M3 6 H21 V18 H3 Z', 'M3 6 L12 13 L21 6'],
  cuore: ['M12 20 C5 15 3 11.5 3 8.5 A4.5 4.5 0 0 1 12 6.5 A4.5 4.5 0 0 1 21 8.5 C21 11.5 19 15 12 20 Z'],
};

function svgEl(tag, attrs, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== '') el.setAttribute(k, String(v));
  if (text) el.textContent = text;
  return el;
}

function num(el, name, fallback) {
  const v = Number.parseFloat(el.getAttribute(name));
  return Number.isFinite(v) ? v : fallback;
}

/** Il colore della palette indicato dalle classi dell'elemento (b r v g k), se c'è. */
function inkOf(el) {
  return (el.getAttribute('class') || '').split(/\s+/).find((c) => INK[c]);
}

/** Larghezza vera di una scritta nel font della lavagna. */
function textWidth(str, size) {
  const t = svgEl('text', { x: 0, y: 0, 'font-size': size }, str);
  panelDraw.appendChild(t);
  const w = t.getBBox().width;
  t.remove();
  return w;
}

/** Una scritta lunga va su due righe di larghezza simile. */
function wrapText(str, size, max) {
  if (!str.includes(' ') || textWidth(str, size) <= max) return [str];
  const words = str.split(/\s+/);
  let best = [str];
  let bestW = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const w = Math.max(...lines.map((l) => textWidth(l, size)));
    if (w < bestW) [best, bestW] = [lines, w];
  }
  return best;
}

/** Testo più piccolo ammesso sulla lavagna: sotto non si legge da seduti. */
const MIN_FONT = 14;

/** Righe a capo "a riempimento" entro `max`; l'ultima, se avanza testo, finisce con i puntini. */
function greedyLines(str, size, max, maxLines) {
  const lines = [];
  let cur = '';
  for (const word of str.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || textWidth(next, size) <= max) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] += '…';
  }
  // una parola più larga della riga si accorcia
  return lines.map((l) => {
    let t = l;
    while (t.length > 2 && textWidth(t, size) > max) t = `${t.slice(0, -2)}…`;
    return t;
  });
}

/** Righe e dimensione perché una scritta stia in `maxW` × `maxH`: va a capo, rimpicciolisce fino a MIN_FONT, poi si accorcia. */
function fitLines(str, size, maxW, maxH) {
  for (let s = size; s >= MIN_FONT; s = s > MIN_FONT ? Math.max(MIN_FONT, Math.floor(s * 0.9)) : 0) {
    const lines = wrapText(str, s, maxW);
    const w = Math.max(...lines.map((l) => textWidth(l, s)));
    if (w <= maxW && lines.length * s * 1.3 <= maxH) return { lines, size: s, w };
  }
  const maxLines = Math.max(1, Math.min(3, Math.floor(maxH / (MIN_FONT * 1.3))));
  const lines = greedyLines(str, MIN_FONT, maxW, maxLines);
  return { lines, size: MIN_FONT, w: Math.max(...lines.map((l) => textWidth(l, MIN_FONT))) };
}

/* --- griglia dichiarata in apertura del pannello: la lavagna ha la sua misura prima del primo tratto --- */
const GRID_M = 20; // margine
const GRID_ROW = 72; // altezza di una riga

function gridHeight(g) {
  return GRID_M * 2 + g.rows * GRID_ROW;
}

/** Il riquadro della cella "riga,colonna" (da 1), estesa di span "colonne x righe". */
function cellRect(at, span) {
  const g = panelState.grid;
  const m = (at || '').match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
  if (!g || !m) return undefined;
  const [r, c] = [Number(m[1]), Number(m[2])];
  const sp = (span || '').match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i);
  const [sc, sr] = sp ? [Number(sp[1]), Number(sp[2])] : [1, 1];
  const cw = (DRAW_W - GRID_M * 2) / g.cols;
  const cc = Math.max(1, Math.min(g.cols, c));
  const rr = Math.max(1, Math.min(g.rows, r));
  return {
    x: GRID_M + (cc - 1) * cw,
    y: GRID_M + (rr - 1) * GRID_ROW,
    w: cw * Math.max(1, Math.min(g.cols - cc + 1, sc)),
    h: GRID_ROW * Math.max(1, Math.min(g.rows - rr + 1, sr)),
  };
}

/** Riquadro di un elemento nelle coordinate del disegno (anche dentro gruppi trasformati). */
function shapeOf(el) {
  const b = el.getBBox();
  let m = new DOMMatrix();
  try {
    m = panelDraw.getCTM().inverse().multiply(el.getCTM());
  } catch {
    /* non ancora visibile: senza trasformazioni */
  }
  const pts = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
  const x = Math.min(...pts.map((p) => p.x));
  const y = Math.min(...pts.map((p) => p.y));
  const w = Math.max(...pts.map((p) => p.x)) - x;
  const h = Math.max(...pts.map((p) => p.y)) - y;
  const round = el.localName === 'circle' || el.localName === 'ellipse';
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, round };
}

/** Un id già disegnato oppure un punto "x,y". */
function refShape(ref) {
  if (!ref) return undefined;
  const pt = ref.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (pt) {
    const [x, y] = [Number(pt[1]), Number(pt[2])];
    return { x, y, w: 0, h: 0, cx: x, cy: y, point: true };
  }
  const el = panelDraw.querySelector(`[data-id="${CSS.escape(ref)}"]`);
  return el ? shapeOf(el) : undefined;
}

/** Punto sul bordo della forma in direzione di (tx,ty), staccato di `gap`. */
function edgePoint(s, tx, ty, gap) {
  if (s.point) return { x: s.cx, y: s.cy };
  const dx = tx - s.cx;
  const dy = ty - s.cy;
  const d = Math.hypot(dx, dy) || 1;
  let t;
  if (s.round) t = 1 / Math.sqrt((dx * dx) / ((s.w / 2) ** 2 || 1) + (dy * dy) / ((s.h / 2) ** 2 || 1));
  else t = Math.min(dx ? s.w / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY, dy ? s.h / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY);
  if (!Number.isFinite(t)) t = 0;
  return { x: s.cx + dx * t + (dx / d) * gap, y: s.cy + dy * t + (dy / d) * gap };
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Larghezza utile del disegno: oltre, il pannello si rimpicciolisce per farci stare tutto. */
const DRAW_W = 600;

/** Riquadri già occupati nel disegno (scritte e forme piene), escluso `skip` e ciò che contiene. */
function obstacles(skip) {
  const out = [];
  for (const el of panelDraw.querySelectorAll('text, rect, circle, ellipse, polygon, .ico')) {
    if (skip && (skip === el || skip.contains(el))) continue;
    if (el.closest('.ico') && el.closest('.ico') !== el) continue; // un'icona conta intera, non pezzo per pezzo
    try {
      const s = shapeOf(el);
      if (s.w > 0 && s.h > 0) out.push({ ...s, text: el.localName === 'text', kind: el.closest('[data-kind]')?.getAttribute('data-kind') });
    } catch {
      /* non misurabile */
    }
  }
  return out;
}

/** Punti lungo le linee e le frecce già disegnate: una scritta non va appoggiata sopra un tratto. */
function strokePoints() {
  const out = [];
  for (const el of panelDraw.querySelectorAll('path, line, polyline')) {
    if (el.closest('.ico')) continue;
    let len = 0;
    try {
      len = el.getTotalLength();
    } catch {
      continue;
    }
    let m = new DOMMatrix();
    try {
      m = panelDraw.getCTM().inverse().multiply(el.getCTM());
    } catch {
      /* senza trasformazioni */
    }
    for (let d = 0; d <= len; d += 12) {
      const p = new DOMPoint(el.getPointAtLength(d).x, el.getPointAtLength(d).y).matrixTransform(m);
      out.push({ x: p.x - 3, y: p.y - 3, w: 6, h: 6, text: true });
    }
  }
  return out;
}

/** Quanto un riquadro candidato invade scritte (molto grave), forme (meno) e i bordi del disegno. */
function crowding(r, obs) {
  let score = 0;
  for (const o of obs) {
    const ix = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x);
    const iy = Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y);
    if (ix > 0 && iy > 0) score += ix * iy * (o.text ? 4 : 1);
  }
  const out = Math.max(0, -r.x) + Math.max(0, r.x + r.w - DRAW_W) + Math.max(0, -r.y);
  return score + out * r.h * 3;
}

/**
 * Spazio libero a destra di (x, y…y+h): fino al primo elemento già disegnato o al prossimo
 * riquadro dichiarato nel passo, o al bordo del disegno. Un riquadro non invade mai i vicini.
 */
function roomRight(x, y, h, group) {
  let limit = DRAW_W - 6;
  const others = [
    ...obstacles(),
    ...[...group.querySelectorAll('box')].map((b) => ({ x: num(b, 'x', Number.NaN), y: num(b, 'y', 0), h: 40 })),
  ];
  for (const o of others) {
    if (!Number.isFinite(o.x) || o.x < x + 24) continue; // ciò che parte a sinistra (sfondi, contenitori) non limita
    if (o.y >= y + h || o.y + (o.h ?? 0) <= y) continue;
    limit = Math.min(limit, o.x - 12);
  }
  return limit - x;
}

/** Il colore del passo, se la lavagna lo assegna (il modello non ha colorato quel passo). */
function stepInkOf(el) {
  return el.closest('[data-ink]')?.getAttribute('data-ink') || undefined;
}

function expandBox(el) {
  let size = num(el, 'font-size', 17);
  const cls = stepInkOf(el) || el.getAttribute('class');
  const label = el.textContent.trim();
  const cell = cellRect(el.getAttribute('at'), el.getAttribute('span'));
  const group = el.parentNode;
  el.remove(); // il segnaposto non conta come vicino di sé stesso
  // larghezza massima: la cella, oppure lo spazio libero a destra di dove l'ha messo il modello
  const x0 = num(el, 'x', 0);
  const y0 = num(el, 'y', 0);
  let maxW = cell ? cell.w - 16 : Math.max(60, Math.min(260, roomRight(x0, y0, 40, group)));
  // una parola che da sola non entra a MIN_FONT allarga il riquadro (fino a metà cella in più) invece di troncarsi
  if (cell && label) {
    const longest = Math.max(...label.split(/\s+/).map((w) => textWidth(w, MIN_FONT)));
    maxW = Math.max(maxW, Math.min(cell.w * 1.5, longest + 28));
  }
  const maxH = cell ? cell.h - 4 : 120;
  let lines = [];
  let tw = 0;
  if (label) {
    const fit = fitLines(label, size, maxW - 24, maxH - 8);
    ({ lines, size } = fit);
    tw = fit.w;
  }
  const lh = size * 1.3;
  const w = Math.min(maxW, Math.max(num(el, 'w', 0), tw + 26, 44));
  const h = Math.min(Math.max(maxH, 40), Math.max(num(el, 'h', 0), lines.length * lh + 16, 40));
  // nella cella il riquadro sta al centro; fuori, dove l'ha messo il modello
  const x = cell ? cell.x + (cell.w - w) / 2 : x0;
  const y = cell ? cell.y + (cell.h - h) / 2 : y0;
  const g = svgEl('g', { 'data-id': el.getAttribute('data-id'), 'data-kind': 'box' });
  g.appendChild(svgEl('rect', { x: r1(x), y: r1(y), width: r1(w), height: r1(h), rx: 10, class: cls }));
  lines.forEach((line, i) => {
    const ty = y + h / 2 + (i - (lines.length - 1) / 2) * lh;
    g.appendChild(svgEl('text', { x: r1(x + w / 2), y: r1(ty), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': size }, line));
  });
  return g;
}

/** Quanti ostacoli (scritte, riquadri, icone) attraversa il tratto, dritto o curvo, fra le due forme. */
function textHits(a, b, bend, texts) {
  const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
  const [nx, ny] = [-(b.cy - a.cy) / len, (b.cx - a.cx) / len];
  const c = { x: (a.cx + b.cx) / 2 + nx * bend * 2, y: (a.cy + b.cy) / 2 + ny * bend * 2 };
  let hits = 0;
  for (const t of texts) {
    for (let i = 2; i <= 18; i++) {
      const u = i / 20;
      const x = (1 - u) ** 2 * a.cx + 2 * (1 - u) * u * c.x + u * u * b.cx;
      const y = (1 - u) ** 2 * a.cy + 2 * (1 - u) * u * c.y + u * u * b.cy;
      if (x > t.x - 3 && x < t.x + t.w + 3 && y > t.y - 3 && y < t.y + t.h + 3) {
        hits++;
        break;
      }
    }
  }
  return hits;
}

/** Gli ostacoli che una freccia fra a e b deve evitare: scritte, riquadri e icone, tranne a e b stessi. */
function arrowObstacles(a, b) {
  // ciò che sta dentro le due forme collegate non conta: la freccia parte e arriva sui loro bordi
  const inside = (t, s) => !s.point && t.cx > s.x - 2 && t.cx < s.x + s.w + 2 && t.cy > s.y - 2 && t.cy < s.y + s.h + 2;
  return obstacles().filter((o) => (o.text || o.kind === 'box' || o.kind === 'icon') && !inside(o, a) && !inside(o, b));
}

/** Curvatura che evita scritte e riquadri già disegnati (0 se la freccia dritta è già libera). */
function freeBend(a, b) {
  const texts = arrowObstacles(a, b);
  if (!textHits(a, b, 0, texts)) return 0;
  let best = 0;
  let bestHits = textHits(a, b, 0, texts);
  for (const k of [25, -25, 45, -45, 70, -70]) {
    const h = textHits(a, b, k, texts);
    if (h < bestHits) [best, bestHits] = [k, h];
  }
  return best;
}

function expandArrow(el) {
  const a = refShape(el.getAttribute('from'));
  const b = refShape(el.getAttribute('to'));
  if (!a || !b) return null;
  // forme che si toccano o si sovrappongono: una freccia fra loro finirebbe sopra le scritte
  if (!a.point && !b.point && a.x < b.x + b.w + 8 && b.x < a.x + a.w + 8 && a.y < b.y + b.h + 8 && b.y < a.y + a.h + 8) return null;
  // una seconda freccia fra gli stessi due elementi (es. andata e ritorno) si curva da sola, per non coprire la prima
  const pair = [el.getAttribute('from'), el.getAttribute('to')].sort().join('|');
  const twin = panelDraw.querySelector(`[data-pair="${CSS.escape(pair)}"]`);
  let bend = num(el, 'bend', 0);
  if (twin && !bend) bend = 28;
  // dritta passerebbe sopra una scritta già disegnata: prova a curvarla dal lato libero
  if (!bend && !el.hasAttribute('bend')) bend = freeBend(a, b);
  // con la curva, la freccia esce e arriva puntando al punto di controllo
  const len0 = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
  const nx = -(b.cy - a.cy) / len0;
  const ny = (b.cx - a.cx) / len0;
  const ctrl = { x: (a.cx + b.cx) / 2 + nx * bend * 2, y: (a.cy + b.cy) / 2 + ny * bend * 2 };
  const aim = (s) => (bend ? ctrl : { x: s.cx, y: s.cy });
  const p = edgePoint(a, aim(b).x, aim(b).y, 7);
  const q = edgePoint(b, aim(a).x, aim(a).y, 9);
  const ink = stepInkOf(el) || inkOf(el);
  // la freccia ricorda da dove viene: se un passo successivo le mette un riquadro davanti, si ricalcola (rerouteArrows)
  const src = { from: el.getAttribute('from'), to: el.getAttribute('to'), label: el.getAttribute('label'), bend: el.getAttribute('bend'), ink, fs: el.getAttribute('font-size') };
  const g = svgEl('g', { 'data-id': el.getAttribute('data-id'), 'data-pair': pair, 'data-kind': 'arrow', 'data-src': JSON.stringify(src) });
  const d = bend
    ? `M${r1(p.x)} ${r1(p.y)} Q${r1(ctrl.x)} ${r1(ctrl.y)} ${r1(q.x)} ${r1(q.y)}`
    : `M${r1(p.x)} ${r1(p.y)} L${r1(q.x)} ${r1(q.y)}`;
  g.appendChild(svgEl('path', { d, class: ink ? `a ${ink}` : 'a', stroke: ink ? INK[ink] : undefined }));
  const text = el.getAttribute('label');
  if (text) {
    const size = num(el, 'font-size', 15);
    const tw = textWidth(text, size);
    const th = size * 1.2;
    const mid = bend
      ? { x: 0.25 * p.x + 0.5 * ctrl.x + 0.25 * q.x, y: 0.25 * p.y + 0.5 * ctrl.y + 0.25 * q.y }
      : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const vertical = Math.abs(q.y - p.y) > Math.abs(q.x - p.x);
    // due posti possibili ai lati della freccia (la curva preferisce il suo lato esterno): vince il più libero
    const off = 14 + (vertical ? 0 : th / 2);
    const spots = vertical
      ? [{ x: mid.x + 10, y: mid.y, anchor: 'start', r: { x: mid.x + 10, y: mid.y - th / 2 } }, { x: mid.x - 10, y: mid.y, anchor: 'end', r: { x: mid.x - 10 - tw, y: mid.y - th / 2 } }]
      : [{ x: mid.x, y: mid.y - off, anchor: 'middle', r: { x: mid.x - tw / 2, y: mid.y - off - th / 2 } }, { x: mid.x, y: mid.y + off, anchor: 'middle', r: { x: mid.x - tw / 2, y: mid.y + off - th / 2 } }];
    if (bend && (vertical ? nx * Math.sign(bend) < 0 : ny * Math.sign(bend) > 0)) spots.reverse();
    const obs = obstacles();
    const best = spots.reduce((a, b, k) => (crowding({ ...b.r, w: tw, h: th }, obs) + k * 30 < crowding({ ...a.r, w: tw, h: th }, obs) ? b : a));
    g.appendChild(svgEl('text', { x: r1(best.x), y: r1(best.y), 'text-anchor': best.anchor, 'dominant-baseline': 'central', class: ink, 'font-size': size }, text));
  }
  return g;
}

function expandLabel(el) {
  const ref = el.getAttribute('for');
  const s = refShape(ref);
  const text = el.textContent.trim();
  if (!s || !text) return null;
  const size = num(el, 'font-size', 16);
  const want = el.getAttribute('side') || 'top';
  const gap = 18;
  const tw = textWidth(text, size);
  const th = size * 1.2;
  const g = svgEl('g', { 'data-id': el.getAttribute('data-id'), 'data-kind': 'label' });
  // posizione della scritta (riquadro + attributi) e del trattino per ogni lato
  const place = {
    in: () => ({ r: { x: s.cx - tw / 2, y: s.cy - th / 2 }, a: { x: s.cx, y: s.cy, 'text-anchor': 'middle' } }),
    top: () => ({ r: { x: s.cx - tw / 2, y: s.y - gap - th }, a: { x: s.cx, y: s.y - gap - th / 2, 'text-anchor': 'middle' }, l: [s.cx, s.y - 3, s.cx, s.y - gap + 4] }),
    bottom: () => ({ r: { x: s.cx - tw / 2, y: s.y + s.h + gap }, a: { x: s.cx, y: s.y + s.h + gap + th / 2, 'text-anchor': 'middle' }, l: [s.cx, s.y + s.h + 3, s.cx, s.y + s.h + gap - 4] }),
    left: () => ({ r: { x: s.x - gap - tw, y: s.cy - th / 2 }, a: { x: s.x - gap, y: s.cy, 'text-anchor': 'end' }, l: [s.x - 3, s.cy, s.x - gap + 4, s.cy] }),
    right: () => ({ r: { x: s.x + s.w + gap, y: s.cy - th / 2 }, a: { x: s.x + s.w + gap, y: s.cy, 'text-anchor': 'start' }, l: [s.x + s.w + 3, s.cy, s.x + s.w + gap - 4, s.cy] }),
  };
  let side = place[want] ? want : 'top';
  // parte dentro un oggetto disegnato (es. la turbina nel motore): richiamo fuori dall'oggetto, con una linea sottile
  if (side !== 'in' && !s.point) {
    const target = panelDraw.querySelector(`[data-id="${CSS.escape(ref)}"]`);
    const callout = target && calloutFor(target, s, want, text, tw, th, size, el);
    if (callout) return callout;
  }
  if (side !== 'in') {
    // il lato chiesto dal modello, se è libero; altrimenti quello che invade meno scritte, forme e bordi
    const target = s.point ? undefined : panelDraw.querySelector(`[data-id="${CSS.escape(ref)}"]`);
    const obs = [...obstacles(target), ...strokePoints()];
    const cost = (k) => {
      const { r } = place[k]();
      return crowding({ ...r, w: tw, h: th }, obs) + (k === want ? 0 : 40);
    };
    side = [want, ...['top', 'right', 'bottom', 'left'].filter((k) => k !== want)].reduce((a, b) => (cost(b) < cost(a) ? b : a));
  }
  const { a, l } = place[side]();
  if (l) g.appendChild(svgEl('line', { x1: r1(l[0]), y1: r1(l[1]), x2: r1(l[2]), y2: r1(l[3]), stroke: INK.k, 'stroke-width': 1.6 }));
  g.appendChild(svgEl('text', { ...a, x: r1(a.x), y: r1(a.y), 'dominant-baseline': 'central', class: inkOf(el), 'font-size': size }, text));
  return g;
}

/**
 * Il contenitore di una parte: la forma più piccola, molto più grande della parte, che ne contiene
 * il centro (la gondola per la turbina, il corpo per il cuore). Niente contenitore = etichetta normale.
 */
function containerOf(target, s) {
  let best;
  for (const el of panelDraw.querySelectorAll('rect, circle, ellipse, polygon, path')) {
    if (target === el || target.contains(el) || el.closest('.ico') || el.classList.contains('a')) continue;
    if (el.closest('[data-kind="box"]')) continue;
    let o;
    try {
      o = shapeOf(el);
    } catch {
      continue;
    }
    const inside = s.cx > o.x && s.cx < o.x + o.w && s.cy > o.y && s.cy < o.y + o.h;
    if (inside && o.w * o.h > s.w * s.h * 2.5 && (!best || o.w * o.h < best.w * best.h)) best = o;
  }
  return best;
}

/** Etichetta di una parte interna: sopra o sotto il contenitore, sulla prima fila libera, collegata alla parte. */
function calloutFor(target, s, want, text, tw, th, size, el) {
  const box = containerOf(target, s);
  if (!box) return null;
  const top = want === 'top' || (want !== 'bottom' && s.cy < box.cy);
  const texts = obstacles().filter((o) => o.text);
  const x = Math.max(tw / 2 + 4, Math.min(DRAW_W - tw / 2 - 4, s.cx));
  let best;
  for (let level = 0; level < 4; level++) {
    for (const dx of [0, tw * 0.6, -tw * 0.6]) {
      const cx = Math.max(tw / 2 + 4, Math.min(DRAW_W - tw / 2 - 4, x + dx));
      const cy = top ? box.y - 14 - th / 2 - level * (th + 6) : box.y + box.h + 14 + th / 2 + level * (th + 6);
      const cost = crowding({ x: cx - tw / 2, y: cy - th / 2, w: tw, h: th }, texts) + level * 20 + Math.abs(dx) * 0.2;
      if (!best || cost < best.cost) best = { cx, cy, cost };
    }
    if (best.cost < 1) break;
  }
  const g = svgEl('g', { 'data-id': el.getAttribute('data-id'), 'data-kind': 'label' });
  // linea dal bordo della parte alla scritta
  const fromY = top ? s.y + 2 : s.y + s.h - 2;
  const toY = top ? best.cy + th / 2 + 2 : best.cy - th / 2 - 2;
  g.appendChild(svgEl('path', { d: `M${r1(s.cx)} ${r1(fromY)} L${r1(best.cx)} ${r1(toY)}`, stroke: INK.k, 'stroke-width': 1.4, fill: 'none' }));
  g.appendChild(svgEl('circle', { cx: r1(s.cx), cy: r1(fromY), r: 2.4, fill: INK.k, stroke: 'none' }));
  g.appendChild(svgEl('text', { x: r1(best.cx), y: r1(best.cy), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: inkOf(el), 'font-size': size }, text));
  return g;
}

function expandIcon(el) {
  const shapes = ICONS[el.getAttribute('name')];
  if (!shapes) return null;
  const size = Math.max(12, Math.min(120, num(el, 'size', 36)));
  const k = size / 24;
  const cell = cellRect(el.getAttribute('at'), el.getAttribute('span'));
  const x = (cell ? cell.x + cell.w / 2 : num(el, 'x', 0)) - size / 2;
  const y = (cell ? cell.y + cell.h / 2 : num(el, 'y', 0)) - size / 2;
  const g = svgEl('g', { 'data-id': el.getAttribute('data-id'), 'data-kind': 'icon', class: 'ico', transform: `translate(${r1(x)} ${r1(y)}) scale(${r1(k * 100) / 100})` });
  const stroke = INK[inkOf(el)] || DARK;
  for (const d of shapes) g.appendChild(svgEl('path', { d, stroke, 'stroke-width': r1(2.2 / k) }));
  return g;
}

const EXPAND = { box: expandBox, icon: expandIcon, arrow: expandArrow, label: expandLabel };

/**
 * Sostituisce le primitive agganciate del passo con SVG vero. Prima riquadri e icone,
 * così frecce ed etichette dello stesso passo possono riferirsi a loro. Il gruppo deve
 * essere già nel disegno: misure e posizioni si leggono dal documento.
 */
function expandAnchored(group) {
  for (const sel of ['box, icon', 'arrow, label']) {
    for (const el of group.querySelectorAll(sel)) {
      // un segnaposto tiene il posto nell'ordine di disegno (expandBox toglie l'elemento per misurare i vicini)
      const slot = document.createComment('');
      el.before(slot);
      let out = null;
      try {
        out = EXPAND[el.localName](el);
      } catch {
        out = null;
      }
      el.remove();
      if (out) slot.replaceWith(out);
      else slot.remove();
    }
  }
}

/* --- la penna: un solo tratto alla volta, come chi disegna davvero --- */
const PEN_GAP = 60; // pausa fra un tratto e il successivo (ms)
const MARK_MS = 650; // un segno sullo schermo
const pen = { frame: 0, plan: [], t0: 0, pos: undefined, hide: 0 };

/** Peso di un elemento nel tempo del passo: le scritte lunghe e i tratti lunghi durano di più. */
function weightOf(el) {
  if (el.localName === 'text') return 3 + (el.textContent || '').length * 0.8;
  let len = 0;
  try {
    len = el.getTotalLength();
  } catch {
    /* forma senza lunghezza */
  }
  return 2 + Math.min(30, len / 30);
}

/**
 * Dove sta la penna su un elemento al progresso p (0-1), in coordinate della finestra: la stessa
 * penna disegna nel pannello e sullo schermo. La trasformazione si rilegge a ogni fotogramma
 * perché il pannello può spostarsi o cambiare scala mentre disegna.
 */
function penPoint(item, p) {
  const { el, len, box } = item;
  let pt;
  if (el.localName === 'text') pt = new DOMPoint(box.x + box.width * p, box.y + box.height * 0.8);
  else if (len > 0) pt = el.getPointAtLength(len * p);
  else pt = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2);
  const m = el.getScreenCTM();
  return m ? new DOMPoint(pt.x, pt.y).matrixTransform(m) : pt;
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function penFrame() {
  const t = performance.now() - pen.t0;
  const k = pen.plan.findIndex((it) => t < it.start + it.dur);
  if (k < 0) {
    pen.frame = 0;
    pen.hide = setTimeout(() => remiCursor.classList.remove('on'), 600);
    return;
  }
  const cur = pen.plan[k];
  if (t < cur.start) {
    // fra un tratto e l'altro la penna viaggia (anche dal pannello allo schermo) invece di saltare
    const from = pen.from || penPoint(cur, 0);
    const t0 = k ? pen.plan[k - 1].start + pen.plan[k - 1].dur : 0;
    const q = easeInOut(Math.min(1, (t - t0) / Math.max(1, cur.start - t0)));
    const to = penPoint(cur, 0);
    pen.pos = { x: from.x + (to.x - from.x) * q, y: from.y + (to.y - from.y) * q };
  } else {
    pen.pos = penPoint(cur, Math.min(1, (t - cur.start) / cur.dur));
    pen.from = pen.pos;
  }
  remiCursor.style.transform = `translate(${r1(pen.pos.x)}px, ${r1(pen.pos.y)}px)`;
  pen.frame = requestAnimationFrame(penFrame);
}

function runPen(plan) {
  stopPen();
  pen.plan = plan;
  pen.from = pen.pos; // riparte da dove si era fermata
  pen.t0 = performance.now();
  remiCursor.classList.add('on');
  pen.frame = requestAnimationFrame(penFrame);
}

function stopPen() {
  cancelAnimationFrame(pen.frame);
  clearTimeout(pen.hide);
  pen.frame = 0;
  remiCursor.classList.remove('on');
}

/** Lunghezza e riquadro di un elemento, per seguirne il tratto. */
function penShape(el) {
  let len = 0;
  try {
    if (el.localName !== 'text') len = el.getTotalLength();
  } catch {
    /* forma senza lunghezza */
  }
  return { el, len, box: el.getBBox() };
}

/** Tempo per spostarsi fra due punti: un salto lungo (pannello ↔ schermo) prende più tempo. */
function travelMs(a, b) {
  if (!a || !b) return PEN_GAP;
  return PEN_GAP + Math.min(420, Math.hypot(b.x - a.x, b.y - a.y) * 0.4);
}

/**
 * Anima gli elementi del passo uno dopo l'altro nell'arco di `ms`, con la penna che li segue.
 * `marks` (segni sullo schermo) si disegnano per primi, a durata fissa: la penna va lì e poi torna nel pannello.
 */
function animateStep(items, ms, marks = []) {
  items = items.filter((el) => el.isConnected); // una freccia ricalcolata non è più nel disegno
  const all = [...marks.map((m) => ({ ...penShape(m.path), mark: m })), ...items.map(penShape)];
  if (!all.length) return;
  // prima i viaggi fra un tratto e l'altro, poi i tratti si dividono il tempo che resta
  let prev = pen.pos;
  const travel = all.map((it) => {
    const tr = travelMs(prev, penPoint(it, 0));
    prev = penPoint(it, 1);
    return tr;
  });
  const marksMs = marks.length * MARK_MS;
  const weights = items.map(weightOf);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const left = Math.max(items.length * 160, ms * 0.88 - marksMs - travel.reduce((a, b) => a + b, 0));
  let t = 0;
  const plan = all.map((it, k) => {
    const dur = it.mark ? MARK_MS : Math.max(160, Math.min(1800, (left * weights[k - marks.length]) / sum));
    const start = t + (k === 0 && !pen.pos ? 0 : travel[k]);
    t = start + dur;
    return { ...it, start, dur };
  });
  for (const { el, start, dur, mark } of plan) {
    if (el.localName === 'text') {
      // scritta a mano: si scopre da sinistra a destra
      const a = el.animate([{ clipPath: 'inset(-40% 100% -40% -10%)' }, { clipPath: 'inset(-40% -10% -40% -10%)' }], {
        duration: dur, delay: start, fill: 'both', easing: 'linear',
      });
      a.onfinish = () => a.cancel();
      continue;
    }
    let len = 0;
    try {
      len = el.getTotalLength();
    } catch {
      /* forma senza lunghezza */
    }
    if (len > 0 && !el.hasAttribute('stroke-dasharray')) {
      el.style.strokeDasharray = `${len}`;
      // la punta della freccia compare a tratto finito, non prima
      el.style.markerEnd = 'none';
      el.style.markerStart = 'none';
      const a = el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
        duration: dur, delay: start, fill: 'both', easing: 'ease-in-out',
      });
      a.onfinish = () => {
        el.style.strokeDasharray = '';
        el.style.markerEnd = '';
        el.style.markerStart = '';
        a.cancel();
      };
    }
    // numero ed etichetta del segno compaiono a cerchio chiuso
    if (mark) {
      for (const extra of mark.extras) {
        const f = extra.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: start + dur * 0.85, fill: 'both' });
        f.onfinish = () => f.cancel();
      }
      continue;
    }
    // il riempimento arriva quando il contorno è quasi chiuso
    const f = el.animate([{ fillOpacity: 0 }, { fillOpacity: 1 }], {
      duration: Math.min(400, dur), delay: start + dur * 0.75, fill: 'both',
    });
    f.onfinish = () => f.cancel();
  }
  runPen(plan);
}

/* --- cerchi a mano sullo schermo: legano il passo a ciò che l'utente sta guardando --- */
/** Un ovale tracciato a mano attorno al riquadro: parte in alto a sinistra e si chiude un po' oltre l'inizio. */
function handEllipse({ x, y, w, h }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2 + 14;
  const ry = h / 2 + 10;
  const n = 56;
  const a0 = -2.5;
  const sweep = Math.PI * 2 + 0.5;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + sweep * t;
    const wob = 1 + 0.03 * Math.sin(a * 3 + 1.3) + 0.05 * t; // irregolare, e il giro finale un po' più largo
    pts.push(`${r1(cx + Math.cos(a) * rx * wob)} ${r1(cy + Math.sin(a) * ry * wob)}`);
  }
  return `M${pts.join(' L')}`;
}

/** Un riquadro tracciato a mano attorno a una zona grande: lati appena storti, l'ultimo tratto un po' oltre l'inizio. */
function handRect({ x, y, w, h }) {
  const p = 8;
  const [x0, y0, x1, y1] = [x - p, y - p, x + w + p, y + h + p];
  const j = (k) => r1(Math.sin(k * 12.9898) * 2.5); // irregolarità fissa, non casuale a ogni ridisegno
  return `M${r1(x0 + 14)} ${r1(y0 + j(1))} L${r1(x1 + j(2))} ${r1(y0 + j(3))} L${r1(x1 + j(4))} ${r1(y1 + j(5))} ` +
    `L${r1(x0 + j(6))} ${r1(y1 + j(7))} L${r1(x0 + j(8))} ${r1(y0 + j(9))} L${r1(x0 + 40)} ${r1(y0 + j(10) - 2)}`;
}

/**
 * Segni sullo schermo del passo in corso (quelli dei passi precedenti spariscono), su un velo
 * leggero che fa risaltare pannello e segni. Cose piccole si cerchiano, zone grandi si incorniciano;
 * ognuno porta il numero e il colore del passo, e un'etichetta se il modello l'ha data.
 * Restituisce i segni da tracciare: li disegna la penna di Remi, prima dei tratti del pannello.
 */
function renderMarks(marks, stepIndex, ink) {
  marksSvg.replaceChildren();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const shown = (marks || []).filter((m) => m.w <= vw * 0.9 && m.h <= vh * 0.9);
  const color = SCREEN_INK[ink] || MARK_DEFAULT;
  // velo con un buco su ogni segno
  const mask = svgEl('mask', { id: 'veilHoles' });
  mask.appendChild(svgEl('rect', { x: 0, y: 0, width: vw, height: vh, fill: '#fff' }));
  for (const m of shown) mask.appendChild(svgEl('rect', { x: m.x - 18, y: m.y - 14, width: m.w + 36, height: m.h + 28, rx: 16, fill: '#000' }));
  const defs = svgEl('defs', {});
  defs.appendChild(mask);
  marksSvg.append(defs, svgEl('rect', { class: 'veil', x: 0, y: 0, width: vw, height: vh, mask: 'url(#veilHoles)' }));
  const drawn = [];
  for (const m of shown) {
    const big = m.w > vw * 0.3 || m.h > vh * 0.3;
    // zona grande: solo l'angolo in alto a sinistra, con numero ed etichetta; cosa piccola: ovale
    const corner = `M${r1(m.x - 8)} ${r1(m.y + 34)} L${r1(m.x - 8)} ${r1(m.y - 8)} L${r1(m.x + 34)} ${r1(m.y - 8)}`;
    const path = svgEl('path', { class: 'mk', d: big ? corner : handEllipse(m), stroke: color });
    // numero del passo sull'angolo in alto a sinistra del segno
    const bx = big ? m.x - 8 : m.x + m.w / 2 - (m.w / 2 + 14) * 0.72;
    const by = big ? m.y - 8 : m.y + m.h / 2 - (m.h / 2 + 10) * 0.86;
    const badge = svgEl('g', { class: 'badge' });
    badge.append(
      svgEl('circle', { cx: r1(bx), cy: r1(by), r: 12, fill: color, stroke: '#1d1a14', 'stroke-width': 1.5 }),
      svgEl('text', { x: r1(bx), y: r1(by + 4.5), 'text-anchor': 'middle', fill: '#1d1a14' }, String(stepIndex + 1)),
    );
    marksSvg.append(path, badge);
    let pill;
    if (m.label) {
      const tw = textWidthUi(m.label) + 20;
      pill = svgEl('g', { class: 'pill' });
      pill.append(
        svgEl('rect', { x: r1(bx + 18), y: r1(by - 13), width: r1(tw), height: 26, rx: 8, fill: color }),
        svgEl('text', { x: r1(bx + 28), y: r1(by + 4.5), fill: '#1d1a14' }, m.label),
      );
      marksSvg.appendChild(pill);
    }
    drawn.push({ path, extras: pill ? [badge, pill] : [badge] });
  }
  return drawn;
}

/** Larghezza di un'etichetta nel font dell'interfaccia (per le etichette sullo schermo). */
function textWidthUi(str) {
  const t = svgEl('text', { x: -999, y: -999, style: 'font:600 13px var(--font-ui)' }, str);
  marksSvg.appendChild(t);
  const w = t.getBBox().width;
  t.remove();
  return w;
}

/* --- numeri dei passi nel disegno: dicono a che punto è la spiegazione --- */
/** Il colore che la lavagna dà a un passo, o niente se il modello ha dichiarato di colorare da sé. */
function autoInk(_step, i) {
  return panelState.ownColors ? undefined : STEP_INKS[i % STEP_INKS.length];
}

/** Il numero del passo accanto al primo riquadro (o al primo elemento) del suo gruppo. */
function addStepBadge(group, i, ink) {
  const anchorEl = group.querySelector('rect') || drawables(group)[0];
  if (!anchorEl) return;
  let s;
  try {
    s = shapeOf(anchorEl);
  } catch {
    return;
  }
  const g = svgEl('g', { 'data-step': i, 'data-c': ink ? INK[ink] : DARK });
  g.append(svgEl('circle', { cx: r1(s.x - 2), cy: r1(s.y - 3), r: 11, 'stroke-width': 1.8 }), svgEl('text', { x: r1(s.x - 2), y: r1(s.y + 1.5), 'text-anchor': 'middle' }, String(i + 1)));
  panelBadges.appendChild(g);
}

/** Pieno il numero del passo in corso, contornati gli altri. */
function refreshProgress(current) {
  for (const g of panelBadges.children) {
    const c = g.getAttribute('data-c');
    const on = Number(g.getAttribute('data-step')) === current;
    g.firstChild.setAttribute('fill', on ? c : '#fbf8f1');
    g.firstChild.setAttribute('stroke', c);
    g.lastChild.setAttribute('fill', on ? '#ffffff' : c);
  }
}

/** Le forme "disegnabili" di un sottoalbero, nell'ordine in cui compaiono. */
function drawables(root) {
  return [root, ...root.querySelectorAll('*')].filter((e) => e.localName !== 'g' && e.localName !== 'tspan');
}

/**
 * Livelli del disegno: le forme libere dei passi stanno sotto, poi le frecce, sopra riquadri,
 * etichette, icone e scritte. Così una freccia non copre mai un testo e un riquadro non la nasconde.
 */
function drawLayer(name) {
  let l = panelDraw.querySelector(`:scope > g[data-layer="${name}"]`);
  if (!l) {
    l = svgEl('g', { 'data-layer': name });
    panelDraw.appendChild(l);
  }
  return l;
}

function isArrow(el) {
  return el.getAttribute('data-kind') === 'arrow' || el.classList?.contains('a');
}

function isFront(el) {
  return ['box', 'label', 'icon'].includes(el.getAttribute('data-kind')) || el.localName === 'text';
}

/** Frecce agganciate (senza curva scelta dal modello) che ora attraversano scritte o riquadri: si rifanno. */
function rerouteArrows(current) {
  for (const g of [...panelDraw.querySelectorAll('g[data-kind="arrow"]')]) {
    if (current.has(g.querySelector('path'))) continue; // quelle del passo in corso sono appena state calcolate
    let src;
    try {
      src = JSON.parse(g.getAttribute('data-src'));
    } catch {
      continue;
    }
    if (src.bend !== null && src.bend !== undefined) continue;
    const a = refShape(src.from);
    const b = refShape(src.to);
    if (!a || !b) continue;
    const path = g.querySelector('path');
    if (!path || !crossesObstacle(path, arrowObstacles(a, b))) continue;
    const el = svgEl('arrow', { from: src.from, to: src.to, label: src.label, 'font-size': src.fs, 'data-ink': src.ink });
    const slot = document.createComment('');
    g.replaceWith(slot);
    let out = null;
    try {
      out = expandArrow(el);
    } catch {
      out = null;
    }
    slot.replaceWith(out || g);
  }
}

/** Il tratto passa sopra uno degli ostacoli? */
function crossesObstacle(path, obs) {
  let len = 0;
  try {
    len = path.getTotalLength();
  } catch {
    return false;
  }
  for (let d = 10; d < len - 10; d += 8) {
    const p = path.getPointAtLength(d);
    if (obs.some((o) => p.x > o.x - 2 && p.x < o.x + o.w + 2 && p.y > o.y - 2 && p.y < o.y + o.h + 2)) return true;
  }
  return false;
}

/** Il gruppo SVG di un passo, già nel disegno e con le primitive agganciate risolte. */
function buildStep(step, i) {
  const group = document.createElementNS(SVG_NS, 'g');
  if (step.ink) group.setAttribute('data-ink', step.ink);
  for (const el of sanitizeSvg(step.svg)) group.appendChild(el);
  // i passi stanno sotto i livelli di frecce e riquadri
  const under = panelDraw.querySelector(':scope > g[data-layer]');
  panelDraw.insertBefore(group, under);
  // le parti disegnate a mano senza colore prendono quello del passo (il modello può dare class="k" ai contenitori)
  if (step.ink) {
    for (const el of group.querySelectorAll('rect, circle, ellipse, polygon, path')) {
      // solo forme chiuse: una linea aperta colorata si riempirebbe di pastello
      const closed = el.localName !== 'path' || /z\s*$/i.test(el.getAttribute('d') || '');
      if (closed && !el.classList.contains('a') && !inkOf(el) && !el.hasAttribute('fill')) el.classList.add(step.ink);
    }
  }
  expandAnchored(group);
  // le frecce libere del passo prendono anch'esse il suo colore
  if (step.ink) {
    for (const a of group.querySelectorAll('.a')) {
      for (const k of Object.keys(INK)) a.classList.remove(k);
      a.classList.add(step.ink);
    }
  }
  fitTexts(group);
  addStepBadge(group, i, step.ink);
  // l'ordine in cui disegnarli si decide prima di spostarli nei livelli
  const items = drawables(group);
  const arrows = drawLayer('arrows');
  const front = drawLayer('front');
  for (const child of [...group.children]) {
    if (isArrow(child)) arrows.appendChild(child);
    else if (isFront(child)) front.appendChild(child);
  }
  // le frecce restano sotto i riquadri: ordine dei livelli fisso
  panelDraw.appendChild(arrows);
  panelDraw.appendChild(front);
  rerouteArrows(new Set(items));
  return items;
}

/** Disegna un passo nell'arco di `ms`: un elemento dopo l'altro, con la penna che li traccia. */
function drawStep(i, ms) {
  const step = panelState.steps[i];
  if (i <= panelState.drawn) return;
  // la voce è partita ma il disegno del passo non è ancora arrivato: disegnalo appena c'è,
  // nel tempo che resta della frase
  if (!step) {
    panelState.want = { i, endAt: Date.now() + ms };
    return;
  }
  // il passo precedente finisce subito di disegnarsi; quelli saltati compaiono senza animazione
  for (const a of panelDraw.getAnimations({ subtree: true })) a.finish();
  for (let k = panelState.drawn + 1; k < i; k++) drawStepNow(k);
  panelState.drawn = i;
  const items = buildStep(step, i);
  fitPanel();
  placePanel();
  refreshProgress(i);
  animateStep(items, ms, renderMarks(step.marks, i, step.ink));
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
    if (panelState.grid) {
      // griglia: la misura dichiarata resta, si allarga solo se il disegno sborda
      const y0g = Math.min(0, bb.y - 12);
      const hg = Math.max(gridHeight(panelState.grid), bb.y + bb.height + 12) - y0g;
      panelSvg.setAttribute('viewBox', `${x0} ${y0g} ${w} ${hg}`);
      return;
    }
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
  buildStep(step, i);
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

bridge.onPanelStart(({ title, voiced, rows, cols, ownColors }) => {
  clearPanel();
  panelState.ownColors = Boolean(ownColors);
  // griglia dichiarata: la lavagna compare subito alla sua misura finale
  if (rows) {
    panelState.grid = { rows, cols: cols || 4 };
    panelSvg.setAttribute('viewBox', `0 0 ${DRAW_W} ${gridHeight(panelState.grid)}`);
  }
  // il pannello prende il posto della scheda
  card.classList.add('hidden');
  panel.style.width = `${panelWidth()}px`;
  renderMarks([], 0, undefined); // il velo compare con il pannello
  panelTitle.textContent = title;
  panelState.voiced = voiced;
  panel.classList.remove('hidden');
  placePanel();
});

bridge.onPanelStep((step) => {
  step.ink = autoInk(step, step.index);
  panelState.steps[step.index] = step;
  refreshProgress(panelState.drawn);
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

bridge.onThinking(() => {
  cardBody.replaceChildren();
  cardStatus.innerHTML = '<span class="dots">sto guardando</span>';
  card.classList.remove('hidden');
  place(card, at);
});

bridge.onStatus((text) => {
  cardStatus.textContent = text || '';
  // niente stato e niente risposta scritta (es. risposta solo a voce): la scheda non serve
  if (!text && !cardBody.childElementCount) card.classList.add('hidden');
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

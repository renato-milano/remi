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

const BOX_W = 380;
const GAP = 22;
let at = { x: 0, y: 0 };

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
    const g = tctx.createRadialGradient(halo.x, halo.y, 0, halo.x, halo.y, 46);
    g.addColorStop(0, 'rgba(94,242,160,.35)');
    g.addColorStop(1, 'rgba(94,242,160,0)');
    tctx.fillStyle = g;
    tctx.beginPath();
    tctx.arc(halo.x, halo.y, 46, 0, Math.PI * 2);
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

function reset() {
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
cardClose.addEventListener('click', () => {
  reset();
  bridge.cancel();
});
document.addEventListener('mousemove', (ev) => {
  if (!ask.classList.contains('hidden')) return; // mentre chiede la finestra è già interattiva
  bridge.setInteractive(!card.classList.contains('hidden') && card.contains(ev.target));
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

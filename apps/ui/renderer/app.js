/* Overlay glue: SSE del daemon → personaggio + fumetto + approvazione + input. */
const bridge = window.overlay || {
  daemonUrl: 'http://127.0.0.1:8787',
  riveAsset: null,
  setInteractive() {},
  dragStart() {},
  dragEnd() {},
  quit() {},
};
const stage = document.getElementById('stage');
const bubble = document.getElementById('bubble');
const approval = document.getElementById('approval');
const approvalText = document.getElementById('approvalText');
const input = document.getElementById('input');
const statusDot = document.getElementById('status');

// Personaggio: Rive se c'è un asset, altrimenti il placeholder SVG.
const character =
  (bridge.riveAsset && window.createRiveCharacter?.(stage, bridge.riveAsset)) ||
  window.createSvgCharacter(stage);

let bubbleTimer = null;
function say(text, { action = false, ms = 5200 } = {}) {
  bubble.textContent = text;
  bubble.classList.toggle('action', action);
  bubble.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), ms);
}

function showApproval(evt) {
  const cmd = evt.request?.details?.command;
  approvalText.innerHTML = `Posso eseguire <b>${evt.request?.toolName ?? 'un\'azione'}</b>?` +
    (cmd ? `<br><span style="opacity:.8">${escapeHtml(String(cmd))}</span>` : '');
  approval.classList.remove('hidden');
  const decide = (approved) => {
    approval.classList.add('hidden');
    postCommand({ kind: 'approval_decision', requestId: evt.requestId, approved });
  };
  document.getElementById('approveYes').onclick = () => decide(true);
  document.getElementById('approveNo').onclick = () => decide(false);
}

function handleEvent(e) {
  switch (e.kind) {
    case 'state':
      character.setState(e.state?.status ?? 'idle');
      break;
    case 'action':
      say(`· ${e.summary}`, { action: true, ms: 2600 });
      break;
    case 'message':
      say(e.content, { ms: 7000 });
      character.flash?.('happy', 1400);
      break;
    case 'approval_request':
      showApproval(e);
      break;
    default:
      break;
  }
}

/* --- trasporto --- */
async function postCommand(cmd) {
  try {
    await fetch(`${bridge.daemonUrl}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    });
  } catch {
    /* daemon offline */
  }
}

function connect() {
  const es = new EventSource(`${bridge.daemonUrl}/events`);
  es.onopen = () => statusDot.classList.add('on');
  es.onmessage = (m) => {
    try {
      handleEvent(JSON.parse(m.data));
    } catch {
      /* frame non-JSON */
    }
  };
  es.onerror = () => {
    statusDot.classList.remove('on');
    es.close();
    character.setState('idle');
    setTimeout(connect, 2500); // riconnessione
  };
}
connect();

/* --- input --- */
input.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    const text = input.value.trim();
    if (text) {
      postCommand({ kind: 'user_message', content: text });
      say('…', { ms: 1500 });
    }
    input.value = '';
  }
});

/* --- click-through: interattivo solo quando il mouse è sugli elementi .interactive --- */
document.addEventListener('mousemove', (ev) => {
  if (dragging) return;
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  bridge.setInteractive(Boolean(el && el.closest('.interactive')));
});
document.addEventListener('mouseleave', () => {
  if (!dragging) bridge.setInteractive(false);
});

/* --- drag & drop: trascina il robot per spostare la finestra --- */
let dragging = false;
stage.addEventListener('mousedown', (ev) => {
  if (ev.button !== 0) return;
  dragging = true;
  bridge.dragStart();
  ev.preventDefault();
});
window.addEventListener('mouseup', () => {
  if (dragging) {
    dragging = false;
    bridge.dragEnd();
  }
});

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

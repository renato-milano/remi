/* Overlay glue: SSE del daemon → personaggio + fumetto + approvazione + attività. */
const bridge = window.overlay || {
  daemonUrl: 'http://127.0.0.1:8787',
  riveAsset: null,
  setInteractive() {},
  dragStart() {},
  dragEnd() {},
  openMenu() {},
  onSummon() {},
  onShowActivity() {},
  quit() {},
};

const stage = document.getElementById('stage');
const bubble = document.getElementById('bubble');
const approval = document.getElementById('approval');
const activity = document.getElementById('activity');
const activityBody = document.getElementById('activityBody');
const input = document.getElementById('input');
const statusDot = document.getElementById('status');

const character =
  (bridge.riveAsset && window.createRiveCharacter?.(stage, bridge.riveAsset)) ||
  window.createSvgCharacter(stage);

/* --- fumetto --- */
let bubbleTimer = null;
function say(text, { action = false, ms = 5200 } = {}) {
  bubble.textContent = text;
  bubble.classList.toggle('action', action);
  bubble.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), ms);
}

/* --- registro attività ("Cosa stai facendo?") --- */
const recentLog = [];
function pushLog(text) {
  recentLog.push({ t: new Date(), text });
  if (recentLog.length > 14) recentLog.shift();
}
function showActivity() {
  activityBody.innerHTML =
    recentLog
      .slice()
      .reverse()
      .map(
        (e) =>
          `<div class="act-row"><span class="act-t">${e.t.toLocaleTimeString()}</span> ${escapeHtml(e.text)}</div>`,
      )
      .join('') || '<div class="act-empty">Nessuna attività recente.</div>';
  activity.classList.remove('hidden');
}
document.getElementById('activityClose').onclick = () => activity.classList.add('hidden');

/* --- approvazione avanzata (comando + rischio + "consenti sempre" + auto-nega) --- */
let approvalCountdown = null;
function showApproval(evt) {
  clearInterval(approvalCountdown);
  const req = evt.request || {};
  const cmd = req.details?.command ? String(req.details.command) : '';
  const prog = cmd ? cmd.trim().split(/\s+/)[0] : '';
  const risk = req.risk === 'dangerous' ? 'pericoloso' : 'guarded';

  approval.innerHTML = `
    <div class="approval-text">Vuole eseguire <b>${escapeHtml(req.toolName || "un'azione")}</b>
      <span class="risk ${req.risk === 'dangerous' ? 'danger' : ''}">${risk}</span>
      ${cmd ? `<div class="cmd">${escapeHtml(cmd)}</div>` : ''}
    </div>
    <div class="approval-count" id="apCount"></div>
    <div class="approval-btns">
      <button class="no no-drag" id="apNo">Nega</button>
      <button class="yes no-drag" id="apYes">Consenti</button>
      ${prog ? `<button class="always no-drag" id="apAlways">Sempre “${escapeHtml(prog)}”</button>` : ''}
    </div>`;
  approval.classList.remove('hidden');

  const decide = (approved, always = false) => {
    clearInterval(approvalCountdown);
    approval.classList.add('hidden');
    postCommand({ kind: 'approval_decision', requestId: evt.requestId, approved, always });
  };
  document.getElementById('apNo').onclick = () => decide(false);
  document.getElementById('apYes').onclick = () => decide(true);
  const alwaysBtn = document.getElementById('apAlways');
  if (alwaysBtn) alwaysBtn.onclick = () => decide(true, true);

  let left = 120; // auto-nega dopo 2:00
  const count = document.getElementById('apCount');
  const tick = () => {
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    count.textContent = `auto-nega tra ${m}:${s}`;
  };
  tick();
  approvalCountdown = setInterval(() => {
    left -= 1;
    if (left <= 0) decide(false);
    else tick();
  }, 1000);
}

/* --- eventi dal daemon --- */
function handleEvent(e) {
  switch (e.kind) {
    case 'state':
      character.setState(e.state?.status ?? 'idle');
      break;
    case 'action':
      say(`· ${e.summary}`, { action: true, ms: 2600 });
      pushLog(`▸ ${e.summary}`);
      break;
    case 'message':
      say(e.content, { ms: 7000 });
      character.flash?.('happy', 1400);
      pushLog(`💬 ${e.content}`);
      break;
    case 'approval_request':
      showApproval(e);
      pushLog(`⚠ approvazione: ${e.request?.toolName ?? ''}`);
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
    setTimeout(connect, 2500);
  };
}
connect();

/* --- input + summon --- */
input.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    const text = input.value.trim();
    if (text) {
      postCommand({ kind: 'user_message', content: text });
      say('…', { ms: 1500 });
    }
    input.value = '';
  } else if (ev.key === 'Escape') {
    document.body.classList.remove('summoned');
    input.blur();
    bridge.setInteractive(false);
  }
});
bridge.onSummon(() => {
  document.body.classList.add('summoned');
  input.focus();
  bridge.setInteractive(true);
});
bridge.onShowActivity(showActivity);

/* --- menu contestuale --- */
stage.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  bridge.openMenu();
});

/* --- click-through: interattivo solo sugli elementi .interactive --- */
document.addEventListener('mousemove', (ev) => {
  if (dragging) return;
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const interactive = Boolean(el && el.closest('.interactive'));
  bridge.setInteractive(interactive || document.body.classList.contains('summoned'));
});
document.addEventListener('mouseleave', () => {
  if (!dragging && !document.body.classList.contains('summoned')) bridge.setInteractive(false);
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

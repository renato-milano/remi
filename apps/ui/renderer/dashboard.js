/* Cruscotto interattivo: heartbeat, task ricorrenti (crea/annulla), pausa, log. */
const api = window.dash || { daemonUrl: 'http://127.0.0.1:8787' };
const base = api.daemonUrl;

const $ = (id) => document.getElementById(id);
const dot = $('dot');
const sleepBtn = $('sleep');
const hbChips = $('hbChips');
const schedList = $('schedList');
const schedCount = $('schedCount');
const logEl = $('log');
let paused = false;

/* ---------- helpers ---------- */
function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso || '';
  }
}
const DEC = { auto: '·', approved: '✓', denied: '✕' };
const DOW = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

/** cron a 5 campi → frase leggibile (casi comuni). */
function humanCron(expr) {
  const p = String(expr).trim().split(/\s+/);
  if (p.length !== 5) return '';
  const [min, hr, dom, mon, dow] = p;
  const at = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (min.startsWith('*/')) return `ogni ${min.slice(2)} minuti`;
  if (hr === '*' && min === '0') return 'ogni ora';
  if (/^\d+$/.test(hr) && /^\d+$/.test(min)) {
    if (dow !== '*' && /^\d+$/.test(dow)) return `ogni ${DOW[Number(dow) % 7]} alle ${at(hr, min)}`;
    if (dom === '*' && mon === '*') return `ogni giorno alle ${at(hr, min)}`;
    if (/^\d+$/.test(dom)) return `il giorno ${dom} alle ${at(hr, min)}`;
  }
  return '';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function get(path) {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function cmd(body) {
  const r = await fetch(`${base}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({}));
}

/* ---------- heartbeat ---------- */
function markHb(seconds) {
  for (const b of hbChips.querySelectorAll('.chip')) b.classList.toggle('active', Number(b.dataset.sec) === seconds);
}
hbChips.addEventListener('click', async (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const sec = Number(b.dataset.sec);
  markHb(sec);
  await cmd({ kind: 'set_heartbeat', seconds: sec });
  refresh();
});

/* ---------- pausa/sveglia ---------- */
sleepBtn.onclick = async () => {
  await cmd({ kind: paused ? 'resume' : 'pause' });
  refresh();
};

/* ---------- task ricorrenti ---------- */
function renderSchedules(list) {
  schedCount.textContent = String(list.length);
  if (!list.length) {
    schedList.innerHTML = '<div class="empty">Nessun task ricorrente. Creane uno qui sotto o chiedimelo in chat.</div>';
    return;
  }
  schedList.innerHTML = '';
  for (const s of list) {
    const human = humanCron(s.cron);
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-main">
        <div class="row-title">${escapeHtml(s.title)}</div>
        <div class="row-sub">${human ? `${escapeHtml(human)} · ` : ''}<code>${escapeHtml(s.cron)}</code> · prossima: ${s.nextRun ? fmtTime(s.nextRun) : '—'}</div>
        <div class="row-instr">${escapeHtml(s.instruction)}</div>
      </div>
      <button class="btn ghost small no-drag" data-id="${escapeHtml(s.id)}">Annulla</button>`;
    schedList.appendChild(row);
  }
  for (const b of schedList.querySelectorAll('button[data-id]')) {
    b.onclick = async () => {
      await cmd({ kind: 'cancel_schedule', id: b.dataset.id });
      refresh();
    };
  }
}

/* form crea-task */
$('cronPresets').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  $('fCron').value = b.dataset.cron;
  $('cronHuman').textContent = humanCron(b.dataset.cron) || '';
});
$('fCron').addEventListener('input', () => {
  $('cronHuman').textContent = humanCron($('fCron').value) || '';
});
$('addBtn').onclick = async () => {
  const cron = $('fCron').value.trim();
  const instruction = $('fInstr').value.trim();
  const title = $('fTitle').value.trim();
  const err = $('addErr');
  if (!cron || !instruction) {
    err.textContent = 'Servono cron e istruzione.';
    return;
  }
  const res = await cmd({ kind: 'create_schedule', cron, instruction, title });
  if (res.ok) {
    err.textContent = '';
    $('fCron').value = '';
    $('fInstr').value = '';
    $('fTitle').value = '';
    $('cronHuman').textContent = '';
    refresh();
  } else {
    err.textContent = res.error || 'cron non valido';
  }
};

/* ---------- log ---------- */
function renderLog(entries) {
  if (!entries.length) {
    logEl.innerHTML = '<div class="empty">Nessuna attività registrata.</div>';
    return;
  }
  logEl.innerHTML = '';
  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'log-row';
    const t = (e.ts || '').slice(11, 16);
    row.innerHTML = `<span class="lt">${t}</span><span class="ld ${e.decision}">${DEC[e.decision] || '·'}</span><span class="ltool">${escapeHtml(e.tool)}</span><span class="lout">${escapeHtml(e.outcome || '')}</span>`;
    logEl.appendChild(row);
  }
}

/* ---------- refresh ---------- */
async function refresh() {
  try {
    const [status, sched, log] = await Promise.all([get('/status'), get('/schedules'), get('/log?n=40')]);
    dot.textContent = '● online';
    dot.classList.add('on');
    paused = Boolean(status.paused);
    sleepBtn.textContent = paused ? '☀ Sveglia' : '☾ Dormi';
    markHb(status.heartbeatSeconds);
    renderSchedules(sched.schedules || []);
    renderLog(log.entries || []);
  } catch {
    dot.textContent = '● offline';
    dot.classList.remove('on');
  }
}
refresh();
setInterval(refresh, 3000);

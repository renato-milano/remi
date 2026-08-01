/* Cruscotto: legge stato/schedule/log dal daemon e li mostra; annulla schedule. */
const api = window.dash || { daemonUrl: 'http://127.0.0.1:8787' };
const base = api.daemonUrl;

const dot = document.getElementById('dot');
const hb = document.getElementById('hb');
const schedCount = document.getElementById('schedCount');
const cu = document.getElementById('cu');
const schedList = document.getElementById('schedList');
const logEl = document.getElementById('log');

function fmtHeartbeat(s) {
  if (!s || s >= 100000) return 'solo su richiesta';
  if (s % 3600 === 0) return `ogni ${s / 3600} h`;
  if (s % 60 === 0) return `ogni ${s / 60} min`;
  return `ogni ${s}s`;
}
function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso || '';
  }
}
const DEC = { auto: '·', approved: '✓', denied: '✕' };

async function get(path) {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function cancelSchedule(id) {
  await fetch(`${base}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'cancel_schedule', id }),
  });
  refresh();
}

function renderSchedules(list) {
  schedCount.textContent = String(list.length);
  if (!list.length) {
    schedList.innerHTML = '<div class="empty">Nessun task ricorrente. Chiedimi in chat qualcosa di periodico.</div>';
    return;
  }
  schedList.innerHTML = '';
  for (const s of list) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-main">
        <div class="row-title">${escapeHtml(s.title)}</div>
        <div class="row-sub"><code>${escapeHtml(s.cron)}</code> · prossima: ${s.nextRun ? fmtTime(s.nextRun) : '—'}</div>
        <div class="row-instr">${escapeHtml(s.instruction)}</div>
      </div>
      <button class="btn ghost small no-drag" data-id="${escapeHtml(s.id)}">Annulla</button>`;
    schedList.appendChild(row);
  }
  for (const b of schedList.querySelectorAll('button[data-id]')) {
    b.onclick = () => cancelSchedule(b.dataset.id);
  }
}

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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function refresh() {
  try {
    const [status, sched, log] = await Promise.all([get('/status'), get('/schedules'), get('/log?n=40')]);
    dot.textContent = '● online';
    dot.classList.add('on');
    hb.textContent = fmtHeartbeat(status.heartbeatSeconds);
    cu.textContent = status.computerUse?.enabled ? 'attivo' : 'off';
    renderSchedules(sched.schedules || []);
    renderLog(log.entries || []);
  } catch {
    dot.textContent = '● offline';
    dot.classList.remove('on');
  }
}

refresh();
setInterval(refresh, 3000);

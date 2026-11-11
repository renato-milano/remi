/* Quaderno di Remi: le sessioni per argomento, da rivedere, riaprire e continuare. */
const bridge = window.notebook;
const $ = (id) => document.getElementById(id);

/** Colori dei passi della lavagna, nello stesso ordine: le frasi del dettaglio li riprendono. */
const STEP_INKS = ['--b', '--g', '--r', '--v', '--p'];
/** Colore stabile per argomento (lo stesso nome ha sempre lo stesso pallino). */
const TOPIC_INKS = ['--v', '--b', '--g', '--p', '--r', '--k'];
const NONE = '\u0000senza'; // chiave del gruppo "da classificare"
const KIND_LABEL = { panel: 'lavagna', scene: '3D', motion: '▶ scena', answer: '? domanda' };

const ui = {
  entries: [],
  topics: [],
  topic: 'all',
  kind: 'all',
  date: 'all',
  query: '',
  selected: null,
  editing: null,
};

function topicInk(name) {
  if (!name) return 'var(--k)';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `var(${TOPIC_INKS[h % TOPIC_INKS.length]})`;
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== undefined && c !== null && c !== false) node.append(c);
  return node;
}
/** replaceChildren senza i figli assenti (null, undefined, false). */
function fill(node, ...children) {
  node.replaceChildren(
    ...children.flat().filter((c) => c !== undefined && c !== null && c !== false),
  );
  return node;
}
const fileUrl = (p) => `file://${encodeURI(p.replace(/\\/g, '/'))}`;
const primaryKind = (e) =>
  e.kinds.includes('panel')
    ? 'panel'
    : e.kinds.includes('motion')
      ? 'motion'
      : e.kinds.includes('scene')
        ? 'scene'
        : 'answer';

/* ---------------- date ---------------- */

const DAY = 86_400_000;
function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function dateGroup(at) {
  const today = startOfDay(Date.now());
  if (at >= today) return 'today';
  if (at >= today - DAY) return 'yesterday';
  if (at >= today - 6 * DAY) return 'week';
  return 'older';
}
const DATE_LABEL = { today: 'Oggi', yesterday: 'Ieri', week: 'Questa settimana', older: 'Prima' };
function when(at) {
  const g = dateGroup(at);
  const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(at);
  if (g === 'today') return `oggi ${time}`;
  if (g === 'yesterday') return `ieri ${time}`;
  if (g === 'week') return new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(at);
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(at);
}
const secs = (s) => `${String(Math.round(s * 10) / 10).replace('.', ',')} s`;
function facts(e) {
  const out = [];
  if (e.steps) out.push(`${e.steps} ${e.steps === 1 ? 'passo' : 'passi'}`);
  if (e.parts) out.push(`${e.parts} ${e.parts === 1 ? 'parte' : 'parti'}`);
  if (e.duration) out.push(secs(e.duration));
  if (e.onBoard) out.push('sulla lavagna');
  return out;
}

/* ---------------- filtri ---------------- */

function matches(e, { topic = ui.topic, kind = ui.kind, date = ui.date } = {}) {
  if (topic !== 'all' && (topic === NONE ? e.topic : e.topic !== topic)) return false;
  if (kind !== 'all' && primaryKind(e) !== kind) return false;
  if (date !== 'all' && dateGroup(e.at) !== date) return false;
  if (ui.query) {
    const hay = [e.title, e.topic, e.question, e.onBoard, e.answer, ...(e.sentences || [])]
      .join(' ')
      .toLowerCase();
    if (!ui.query.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/* ---------------- barra laterale ---------------- */

function renderTopics() {
  const box = $('topics');
  const counts = new Map();
  for (const e of ui.entries)
    if (matches(e, { topic: 'all' }))
      counts.set(e.topic || NONE, (counts.get(e.topic || NONE) || 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const names = [...counts.keys()]
    .filter((t) => t !== NONE)
    .sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b, 'it'));
  if (ui.topic !== 'all' && ui.topic !== NONE && !ui.topics.includes(ui.topic)) ui.topic = 'all';
  const row = (key, label, n, ink) => {
    if (ui.editing === key) {
      const input = el('input', { value: label, 'aria-label': 'Nuovo nome dell’argomento' });
      const done = async (commit) => {
        ui.editing = null;
        const name = input.value.trim();
        if (commit && name && name !== label) {
          await bridge.renameTopic(label, name);
          if (ui.topic === label) ui.topic = name;
        } else renderTopics();
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') done(true);
        if (ev.key === 'Escape') done(false);
      });
      input.addEventListener('blur', () => done(true));
      queueMicrotask(() => input.select());
      return el('div', { class: 'topic' }, el('i', { class: 'dot', style: `--c:${ink}` }), input);
    }
    return el(
      'button',
      {
        class: 'topic',
        'aria-current': String(ui.topic === key),
        onclick: () => {
          ui.topic = key;
          render();
        },
        ondblclick: () => {
          if (key === 'all' || key === NONE) return;
          ui.editing = key;
          renderTopics();
        },
        title: key !== 'all' && key !== NONE ? 'Doppio clic per rinominare' : undefined,
      },
      key === 'all' ? null : el('i', { class: 'dot', style: `--c:${ink}` }),
      el('span', { class: 'name' }, label),
      el('span', { class: 'n' }, String(n)),
    );
  };
  fill(
    box,
    row('all', 'Tutto', total),
    ...names.map((t) => row(t, t, counts.get(t), topicInk(t))),
    counts.has(NONE) ? row(NONE, 'Da classificare…', counts.get(NONE), 'var(--k)') : null,
  );
  const dates = $('dates');
  const dcount = new Map();
  for (const e of ui.entries)
    if (matches(e, { date: 'all' }))
      dcount.set(dateGroup(e.at), (dcount.get(dateGroup(e.at)) || 0) + 1);
  dates.replaceChildren(
    ...['today', 'yesterday', 'week', 'older']
      .filter((g) => dcount.has(g))
      .map((g) =>
        el(
          'button',
          {
            class: 'topic',
            'aria-current': String(ui.date === g),
            onclick: () => {
              ui.date = ui.date === g ? 'all' : g;
              render();
            },
          },
          el('span', { class: 'name' }, DATE_LABEL[g]),
          el('span', { class: 'n' }, String(dcount.get(g))),
        ),
      ),
  );
}

/* ---------------- schede ---------------- */

function thumbOf(e, big = false) {
  const kind = primaryKind(e);
  const board = kind === 'panel';
  const box = el('div', { class: `${big ? 'pre' : 'thumb'}${board ? ' board' : ''}` });
  if (e.thumbPath)
    box.append(
      el('img', { src: fileUrl(e.thumbPath), alt: '', loading: 'lazy', draggable: 'false' }),
    );
  else if (kind === 'answer') box.append(el('div', { class: 'q' }, e.question || e.title));
  else box.append(el('div', { class: 'wait' }, 'miniatura in arrivo…'));
  if (!big) box.append(el('span', { class: `kind ${kind}` }, KIND_LABEL[kind]));
  return box;
}

function renderCards() {
  const list = ui.entries.filter((e) => matches(e));
  $('heading').textContent =
    ui.topic === 'all'
      ? 'Tutto quello che abbiamo visto'
      : ui.topic === NONE
        ? 'Da classificare'
        : ui.topic;
  $('count').textContent = `${list.length} ${list.length === 1 ? 'sessione' : 'sessioni'}`;
  for (const b of document.querySelectorAll('[data-kind]'))
    b.setAttribute('aria-pressed', String(b.dataset.kind === ui.kind));
  const box = $('cards');
  if (!list.length) {
    box.replaceChildren(
      el(
        'div',
        { class: 'empty' },
        el('b', {}, ui.entries.length ? 'Niente qui' : 'Il quaderno è vuoto'),
        ui.entries.length
          ? 'Prova un altro argomento o togli un filtro.'
          : 'Le lavagne, i modelli 3D e le risposte di Remi compariranno qui, divisi per argomento.',
      ),
    );
    return;
  }
  box.replaceChildren(
    ...list.map((e) =>
      el(
        'button',
        {
          class: 'card',
          'aria-current': String(ui.selected === e.id),
          onclick: () => select(e.id),
        },
        thumbOf(e),
        el(
          'div',
          { class: 'meta' },
          el('b', {}, e.title),
          el('small', {}, [when(e.at), ...facts(e)].join(' · ')),
          ui.topic === 'all'
            ? el(
                'small',
                { class: 'topicTag' },
                el('i', { style: `--c:${topicInk(e.topic)}` }),
                e.topic || 'argomento in arrivo…',
              )
            : null,
        ),
      ),
    ),
  );
}

/* ---------------- dettaglio ---------------- */

function select(id) {
  ui.selected = ui.selected === id ? null : id;
  render();
}

function renderDetail() {
  const box = $('detail');
  const e = ui.entries.find((x) => x.id === ui.selected);
  if (!e) {
    box.hidden = true;
    ui.selected = null;
    return;
  }
  box.hidden = false;
  const kind = primaryKind(e);
  const pre = thumbOf(e, true);
  pre.append(
    el(
      'button',
      { class: 'close', 'aria-label': 'Chiudi il dettaglio', onclick: () => select(e.id) },
      '×',
    ),
  );
  const how = e.imported ? 'dal banco di prova' : e.voiced ? 'a voce o indicando' : 'in chat';
  const said =
    e.sentences?.length && kind === 'panel'
      ? el(
          'ol',
          { class: 'said' },
          e.sentences.map((s, i) =>
            el(
              'li',
              {},
              el('i', { style: `--c:var(${STEP_INKS[i % STEP_INKS.length]})` }, String(i + 1)),
              el('span', {}, s),
            ),
          ),
        )
      : e.answer
        ? el('div', { class: 'answer' }, e.answer)
        : null;
  const note = el('p', { class: 'note', role: 'status' });
  const flash = (text, err = false) => {
    note.textContent = text;
    note.classList.toggle('err', err);
  };

  const canReplay = kind !== 'answer';
  const actions = el(
    'div',
    { class: 'acts' },
    canReplay
      ? el(
          'button',
          {
            class: 'btn pri',
            onclick: async () =>
              flash(
                (await bridge.replay(e.id, false))
                  ? 'Riaperta sullo schermo.'
                  : 'Non riesco a riaprirla.',
                false,
              ),
          },
          kind === 'panel' ? 'Riapri la lavagna' : 'Riapri il modello',
        )
      : null,
    kind === 'panel'
      ? el(
          'button',
          {
            class: 'btn',
            onclick: async () =>
              flash(
                (await bridge.replay(e.id, true))
                  ? 'Remi la rispiega a voce.'
                  : 'Non riesco a riaprirla.',
              ),
          },
          'Riascolta',
        )
      : null,
  );

  const ask = el('input', {
    type: 'text',
    placeholder: 'Chiedi ancora su questo…',
    'aria-label': 'Domanda di seguito',
  });
  const send = async () => {
    const text = ask.value.trim();
    if (!text) return;
    const ok = await bridge.ask(e.id, text);
    if (ok) ask.value = '';
    flash(ok ? 'Inviata: Remi risponde nel suo fumetto.' : 'Remi non è raggiungibile.', !ok);
  };
  ask.addEventListener('keydown', (ev) => ev.key === 'Enter' && send());

  const select_ = el('select', { 'aria-label': 'Argomento' });
  const options = [...new Set([...(ui.topics || []), e.topic].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'it'),
  );
  for (const t of options) select_.append(el('option', { value: t, selected: t === e.topic }, t));
  if (!e.topic) select_.prepend(el('option', { value: '', selected: true }, 'in arrivo…'));
  select_.append(el('option', { value: '\u0001nuovo' }, 'Nuovo argomento…'));
  const topicRow = el('div', { class: 'row' }, select_);
  select_.addEventListener('change', async () => {
    if (select_.value !== '\u0001nuovo') {
      if (select_.value) await bridge.update(e.id, { topic: select_.value });
      return;
    }
    const input = el('input', {
      type: 'text',
      placeholder: 'Nome dell’argomento',
      'aria-label': 'Nuovo argomento',
    });
    const ok = el('button', { class: 'btn', onclick: () => commit() }, 'Sposta');
    const commit = async () => {
      if (input.value.trim()) await bridge.update(e.id, { topic: input.value.trim() });
    };
    input.addEventListener('keydown', (ev) => ev.key === 'Enter' && commit());
    topicRow.replaceChildren(input, ok);
    input.focus();
  });

  const del = el('button', { class: 'btn danger' }, 'Elimina');
  del.addEventListener('click', async () => {
    if (!del.classList.contains('armed')) {
      del.classList.add('armed');
      del.textContent = 'Elimina davvero';
      setTimeout(() => {
        del.classList.remove('armed');
        del.textContent = 'Elimina';
      }, 3000);
      return;
    }
    await bridge.remove(e.id);
  });

  fill(
    box,
    pre,
    el('div', { class: 'when' }, [when(e.at), e.topic, how].filter(Boolean).join(' · ')),
    el('h2', {}, e.title),
    e.question
      ? el(
          'p',
          { class: 'asked' },
          'Hai chiesto: ',
          el('em', {}, `«${e.question}»`),
          e.onBoard ? ` sulla lavagna «${e.onBoard}»` : '',
        )
      : null,
    facts(e).length
      ? el(
          'div',
          { class: 'facts' },
          facts(e).map((f) => el('span', {}, f)),
        )
      : null,
    said,
    actions,
    note,
    el('hr'),
    el(
      'label',
      { class: 'field' },
      el('span', {}, 'Chiedi ancora'),
      el('div', { class: 'row' }, ask, el('button', { class: 'btn', onclick: send }, 'Invia')),
    ),
    el('div', { class: 'field' }, el('span', {}, 'Argomento'), topicRow),
    el('div', { class: 'acts' }, del),
  );
}

function render() {
  renderTopics();
  renderCards();
  renderDetail();
}

/* ---------------- dati ---------------- */

async function load() {
  const data = await bridge.list();
  ui.entries = data.entries || [];
  ui.topics = data.topics || [];
  renderTopics();
  renderCards();
  // chi sta scrivendo nel dettaglio (domanda, nuovo argomento) non perde il testo per un aggiornamento
  const detail = $('detail');
  const typing =
    detail.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName);
  const gone = ui.selected && !ui.entries.some((e) => e.id === ui.selected);
  if (!typing || gone) renderDetail();
}

$('search').addEventListener('input', (ev) => {
  ui.query = ev.target.value.trim().toLowerCase();
  render();
});
for (const b of document.querySelectorAll('[data-kind]')) {
  b.addEventListener('click', () => {
    ui.kind = b.dataset.kind;
    render();
  });
}
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && ui.selected && !/INPUT|SELECT/.test(document.activeElement?.tagName))
    select(ui.selected);
  if (ev.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    ev.preventDefault();
    $('search').focus();
  }
});
// l'archivio cambia (nuova sessione, argomento arrivato, miniatura pronta): si ricarica senza perdere i filtri
let reloadTimer = 0;
bridge.onChange(() => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 150);
});
load();

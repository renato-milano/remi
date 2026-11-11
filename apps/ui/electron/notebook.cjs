/**
 * Quaderno di Remi: archivio delle sessioni (lavagne, modelli 3D, scene animate, risposte ai turni
 * "indica") raggruppate per argomento.
 *
 * Registra i turni dagli eventi del daemon (la domanda arriva con l'evento `turn`), li salva in
 * userData/notebook e in background chiede al daemon l'argomento e fa la miniatura in una finestra
 * fuori schermo che carica la lavagna o il visore 3D veri.
 *
 *   notebook/index.json          elenco (metadati di ogni voce)
 *   notebook/entries/<id>.json   cosa serve a riaprirla: { panel?, scene? }
 *   notebook/thumbs/<id>.png     miniatura
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { BrowserWindow } = require('electron');

/** Argomento di riserva quando il modello non risponde. */
const FALLBACK_TOPIC = 'Altro';
/** La finestra delle miniature si chiude dopo questo tempo senza lavoro. */
const THUMB_IDLE_MS = 30_000;

/** "Come gira? [indicando un punto della lavagna «Elica»]" → domanda pulita e lavagna. */
function splitQuestion(raw = '') {
  const m = raw.match(/\s*\[indicando ([^\]]*)\]\s*$/);
  const question = (m ? raw.slice(0, m.index) : raw).trim();
  const board = m?.[1].match(/lavagna «([^»]*)»/)?.[1];
  return { question, onBoard: board || undefined };
}

/** Cosa contiene una scena: parti, movimento, durata, titolo. */
function sceneFacts(events) {
  const start = events.find((e) => e.op === 'start');
  const nodes = events.filter((e) => e.op === 'node');
  let duration = 0;
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.animation?.duration) duration = Math.max(duration, n.animation.duration);
    for (const c of n.children ?? []) visit(c);
  };
  for (const e of nodes) visit(e.node);
  return {
    title: start?.header?.title || '',
    parts: nodes.length,
    motion: duration > 0,
    duration: duration || undefined,
  };
}

function createNotebook({
  dir,
  debugDir,
  rendererDir,
  thumbPreload,
  sceneReady,
  daemonUrl,
  onChange,
  log = console.log,
}) {
  const entriesDir = path.join(dir, 'entries');
  const thumbsDir = path.join(dir, 'thumbs');
  fs.mkdirSync(entriesDir, { recursive: true });
  fs.mkdirSync(thumbsDir, { recursive: true });
  const indexFile = path.join(dir, 'index.json');

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  } catch {
    index = { version: 1, createdAt: Date.now(), importedDebug: false, entries: [] };
  }
  const save = () => {
    const tmp = `${indexFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(index, null, 1));
    fs.renameSync(tmp, indexFile);
  };
  const changed = () => {
    try {
      save();
    } catch (err) {
      log('[quaderno] indice non salvato:', err.message);
    }
    onChange?.();
  };
  const find = (id) => index.entries.find((e) => e.id === id);
  const topics = () => [...new Set(index.entries.map((e) => e.topic).filter(Boolean))];

  /* ---------------- voci ---------------- */

  function addEntry(meta, data) {
    const id = meta.id || randomUUID();
    fs.writeFileSync(path.join(entriesDir, `${id}.json`), JSON.stringify(data));
    const entry = { id, thumb: false, topic: null, ...meta };
    index.entries.push(entry);
    index.entries.sort((a, b) => b.at - a.at);
    changed();
    if (data.panel || data.scene) queue(() => makeThumb(entry, data));
    queue(() => assignTopic(entry));
    return entry;
  }

  /** Metadati di una voce dalla registrazione di un turno (o da un dump di debug). */
  function metaFrom({ at, question, onBoard, panel, scene, answer, fast, imported }) {
    const kinds = [];
    const facts = scene ? sceneFacts(scene.events) : undefined;
    if (panel) kinds.push('panel');
    if (scene) kinds.push(facts.motion ? 'motion' : 'scene');
    if (!kinds.length) kinds.push('answer');
    const sentences = panel
      ? panel.steps.map((s) => s.say).filter(Boolean)
      : answer
        ? [answer]
        : [];
    const title = (panel?.title || facts?.title || question || 'Risposta').slice(0, 120);
    return {
      at,
      title,
      question: question || undefined,
      onBoard,
      kinds,
      sentences,
      // a una lavagna o un modello la risposta scritta si aggiunge come spiegazione detta
      answer: panel ? undefined : answer || undefined,
      steps: panel?.steps.length,
      parts: facts?.parts,
      duration: facts?.duration,
      voiced: fast || undefined,
      imported: imported || undefined,
    };
  }

  /* ---------------- registrazione dei turni ---------------- */

  let cur = null;

  function finalize() {
    const t = cur;
    cur = null;
    if (!t) return;
    const panel = t.panel?.steps.length ? t.panel : undefined;
    const scene = t.scene?.events.some((e) => e.op === 'node') ? t.scene : undefined;
    const answer = t.answer.join('\n\n').trim();
    // le risposte solo a parole si archiviano dai turni "indica" (spiegazioni), non dalla chat
    if (!panel && !scene && !(t.fast && answer)) return;
    try {
      addEntry(metaFrom({ ...t, panel, scene, answer }), { panel, scene });
    } catch (err) {
      log('[quaderno] voce non salvata:', err.message);
    }
  }

  /** Eventi del daemon: domanda, lavagna, modello, risposta; il ritorno a riposo chiude il turno. */
  function observe(e) {
    if (!e || typeof e !== 'object') return;
    if (e.kind === 'turn') {
      finalize();
      const { question, onBoard } = splitQuestion(e.question);
      cur = {
        at: Date.now(),
        question,
        onBoard,
        fast: Boolean(e.fast),
        panel: null,
        scene: null,
        answer: [],
      };
      return;
    }
    if (!cur) return;
    if (e.kind === 'panel') {
      if (e.op === 'start')
        cur.panel = {
          title: e.title,
          rows: e.rows,
          cols: e.cols,
          ownColors: e.ownColors,
          steps: [],
        };
      // i segni sullo schermo valgono solo in quel momento: non si riaprono
      else if (e.op === 'step' && cur.panel) cur.panel.steps[e.index] = { say: e.say, svg: e.svg };
    } else if (e.kind === 'scene3d') {
      const { kind: _kind, ...event } = e;
      if (event.op === 'start') cur.scene = { events: [] };
      cur.scene?.events.push(event);
    } else if (e.kind === 'message' && !e.channel && e.content) {
      cur.answer.push(e.content);
    } else if (e.kind === 'state' && e.state?.status === 'idle') {
      finalize();
    }
  }

  /* ---------------- lavoro in background: argomenti e miniature, uno alla volta ---------------- */

  let chain = Promise.resolve();
  function queue(job) {
    chain = chain.then(job).catch((err) => log('[quaderno]', err?.message || err));
    return chain;
  }

  async function assignTopic(entry) {
    if (!find(entry.id) || entry.topic) return;
    // una domanda fatta su una lavagna va nello stesso argomento di quella lavagna
    const parent =
      entry.onBoard &&
      index.entries.find((e) => e.id !== entry.id && e.title === entry.onBoard && e.topic);
    let topic = parent?.topic;
    if (!topic) {
      try {
        const res = await fetch(`${daemonUrl}/notebook/topic`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: entry.title,
            question: entry.question,
            sentences: entry.sentences,
            topics: topics(),
          }),
          signal: AbortSignal.timeout(30_000),
        });
        topic = (await res.json()).topic;
      } catch {
        /* daemon spento o modello lento: argomento di riserva, si corregge a mano */
      }
    }
    const live = find(entry.id);
    if (!live || live.topic) return;
    live.topic = topic || FALLBACK_TOPIC;
    changed();
  }

  let thumbWin;
  let thumbPage;
  let idleTimer;
  async function page(file) {
    clearTimeout(idleTimer);
    if (!thumbWin || thumbWin.isDestroyed()) {
      thumbWin = new BrowserWindow({
        show: false,
        width: 1200,
        height: 760,
        transparent: true,
        frame: false,
        webPreferences: {
          offscreen: true,
          preload: thumbPreload,
          contextIsolation: true,
          sandbox: true,
        },
      });
      thumbWin.webContents.setFrameRate(30);
      thumbPage = undefined;
    }
    if (thumbPage !== file) {
      await thumbWin.loadFile(path.join(rendererDir, file));
      thumbPage = file;
    }
    return thumbWin.webContents;
  }
  function idle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      thumbWin?.destroy();
      thumbWin = undefined;
    }, THUMB_IDLE_MS);
  }

  async function makeThumb(entry, data) {
    if (!find(entry.id)) return;
    let png;
    try {
      if (data.scene) {
        await sceneReady;
        const wc = await page('scene3d.html');
        const events = data.scene.events.filter((e) => !String(e.op).startsWith('detail-'));
        await wc.executeJavaScript(
          `(() => { for (const e of ${JSON.stringify(events)}) window.remi3d.feed(e); })()`,
        );
        await new Promise((r) => setTimeout(r, 400));
        const b64 = await wc.executeJavaScript('window.remi3d.thumbnail(640)');
        if (b64) png = Buffer.from(b64, 'base64');
      } else if (data.panel) {
        const wc = await page('pointer.html');
        const rect = await wc.executeJavaScript(`renderBoardStill(${JSON.stringify(data.panel)})`);
        await new Promise((r) => setTimeout(r, 250));
        const image = await wc.capturePage(rect);
        if (!image.isEmpty()) png = image.resize({ width: 640, quality: 'best' }).toPNG();
      }
    } catch (err) {
      log('[quaderno] miniatura non fatta:', err.message);
    } finally {
      idle();
    }
    const live = find(entry.id);
    if (!png || !live) return;
    fs.writeFileSync(path.join(thumbsDir, `${entry.id}.png`), png);
    live.thumb = true;
    changed();
  }

  /* ---------------- sessioni già salvate per il debug ---------------- */

  /** Una volta sola: le lavagne e le scene salvate con OPENMATE_UI_DEBUG prima del quaderno. */
  function importDebug() {
    if (index.importedDebug || !debugDir) return 0;
    index.importedDebug = true;
    let count = 0;
    const read = (sub, prefix) => {
      try {
        return (
          fs
            .readdirSync(path.join(debugDir, sub))
            .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
            .map((f) => ({
              file: path.join(debugDir, sub, f),
              at: Number(f.slice(prefix.length, -5)),
            }))
            // dopo la nascita del quaderno le sessioni le registra lui: niente doppioni
            .filter((x) => Number.isFinite(x.at) && x.at < index.createdAt)
        );
      } catch {
        return [];
      }
    };
    for (const { file, at } of read('panels', 'panel-')) {
      try {
        const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
        const steps = (dump.steps || [])
          .filter((s) => s?.svg)
          .map((s) => ({ say: s.say, svg: s.svg }));
        if (!steps.length) continue;
        const panel = {
          title: dump.title,
          rows: dump.rows,
          cols: dump.cols,
          ownColors: dump.ownColors,
          steps,
        };
        addEntry(
          { ...metaFrom({ at, panel, imported: true }), id: `debug-panel-${at}` },
          { panel },
        );
        count++;
      } catch {
        /* dump illeggibile: si salta */
      }
    }
    for (const { file, at } of read('scenes', 'scene-')) {
      try {
        const events = JSON.parse(fs.readFileSync(file, 'utf8')).map(({ kind: _k, ...e }) => e);
        if (!events.some((e) => e.op === 'node')) continue;
        const scene = { events };
        addEntry(
          { ...metaFrom({ at, scene, imported: true }), id: `debug-scene-${at}` },
          { scene },
        );
        count++;
      } catch {
        /* dump illeggibile: si salta */
      }
    }
    changed();
    return count;
  }

  /* ---------------- per la finestra del quaderno ---------------- */

  return {
    observe,
    importDebug,
    list() {
      return {
        entries: index.entries.map((e) => ({
          ...e,
          thumbPath: e.thumb ? path.join(thumbsDir, `${e.id}.png`) : null,
        })),
        topics: topics(),
      };
    },
    get(id) {
      const entry = find(id);
      if (!entry) return null;
      try {
        return {
          entry,
          data: JSON.parse(fs.readFileSync(path.join(entriesDir, `${id}.json`), 'utf8')),
        };
      } catch {
        return { entry, data: {} };
      }
    },
    update(id, patch) {
      const entry = find(id);
      if (!entry) return false;
      if (typeof patch?.topic === 'string' && patch.topic.trim())
        entry.topic = patch.topic.trim().slice(0, 60);
      if (typeof patch?.title === 'string' && patch.title.trim())
        entry.title = patch.title.trim().slice(0, 120);
      changed();
      return true;
    },
    remove(id) {
      const i = index.entries.findIndex((e) => e.id === id);
      if (i < 0) return false;
      index.entries.splice(i, 1);
      for (const f of [path.join(entriesDir, `${id}.json`), path.join(thumbsDir, `${id}.png`)])
        fs.rmSync(f, { force: true });
      changed();
      return true;
    },
    renameTopic(from, to) {
      const name = String(to || '')
        .trim()
        .slice(0, 60);
      if (!name) return false;
      for (const e of index.entries) if (e.topic === from) e.topic = name;
      changed();
      return true;
    },
    /** Lavoro in background ancora in coda (test). */
    idle: () => chain,
  };
}

module.exports = { createNotebook, splitQuestion, sceneFacts };

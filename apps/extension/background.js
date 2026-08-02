/* OpenMate — service worker dell'estensione.
 * Attacca chrome.debugger alla scheda attiva e fa da ponte: riceve operazioni dal
 * daemon via WebSocket ed esegue snapshot/click/type/navigate nella scheda LIVE
 * (con i login reali dell'utente). Isolato dal daemon: comunica solo via WS. */

const WS_URL = 'ws://127.0.0.1:8787/ext';
const PROTOCOL = '1.3';

let ws = null;
let attachedTabId = null;
let reconnectTimer = null;

/* ---- funzioni eseguite NELLA pagina (via Runtime.evaluate) ---- */
// (referenziano document/location: valide solo lato pagina, mai chiamate qui)
function pageSnapshot() {
  const out = [];
  const q = 'a,button,input,textarea,select,[role=button],[role=link],[role=textbox],[onclick]';
  let i = 0;
  for (const el of Array.from(document.querySelectorAll(q))) {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || st.visibility === 'hidden' || st.display === 'none') continue;
    if (i >= 80) break;
    el.setAttribute('data-om-ref', String(i));
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const name = String(el.getAttribute('aria-label') || el.placeholder || el.innerText || el.value || el.name || el.alt || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    const value = el.value ? String(el.value).slice(0, 40) : undefined;
    out.push({ ref: i, role, name, value });
    i++;
  }
  return {
    title: document.title,
    url: location.href,
    elements: out,
    text: (document.body && document.body.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000),
  };
}
function pageRead() {
  return { text: (document.body && document.body.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000) };
}
function pageClick(ref) {
  const e = document.querySelector('[data-om-ref="' + ref + '"]');
  if (!e) return { error: 'elemento non trovato' };
  e.scrollIntoView({ block: 'center' });
  e.click();
  return { ok: true };
}
function pageType(ref, text, submit) {
  const e = document.querySelector('[data-om-ref="' + ref + '"]');
  if (!e) return { error: 'elemento non trovato' };
  e.focus();
  e.value = text;
  e.dispatchEvent(new Event('input', { bubbles: true }));
  e.dispatchEvent(new Event('change', { bubbles: true }));
  if (submit) {
    const f = e.form;
    if (f && f.requestSubmit) f.requestSubmit();
    else e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
  }
  return { ok: true };
}

/* ---- CDP helpers ---- */
function evalInPage(expr) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId: attachedTabId },
      'Runtime.evaluate',
      { expression: expr, returnByValue: true, awaitPromise: true },
      (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res && res.exceptionDetails) return reject(new Error(res.exceptionDetails.text || 'eval error'));
        resolve(res && res.result ? res.result.value : undefined);
      },
    );
  });
}
const call = (fn, ...args) => evalInPage('(' + fn.toString() + ')(' + args.map((a) => JSON.stringify(a)).join(',') + ')');

function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const to = setTimeout(finish, timeoutMs || 15000);
    function onUpd(id, info) {
      if (id === tabId && info.status === 'complete') finish();
    }
    function finish() {
      clearTimeout(to);
      chrome.tabs.onUpdated.removeListener(onUpd);
      setTimeout(resolve, 300);
    }
    chrome.tabs.onUpdated.addListener(onUpd);
  });
}

/* ---- operazioni richieste dal daemon ---- */
async function handleOp(op, args) {
  switch (op) {
    case 'open': {
      let url = String(args.url || '');
      if (!/^([a-z]+):/i.test(url)) url = 'https://' + url;
      await chrome.tabs.update(attachedTabId, { url });
      await waitTabComplete(attachedTabId);
      return call(pageSnapshot);
    }
    case 'snapshot':
      return call(pageSnapshot);
    case 'read':
      return call(pageRead);
    case 'click':
      await call(pageClick, args.ref);
      await waitTabComplete(attachedTabId, 4000);
      return call(pageSnapshot);
    case 'type':
      await call(pageType, args.ref, String(args.text || ''), Boolean(args.submit));
      if (args.submit) await waitTabComplete(attachedTabId, 4000);
      return call(pageSnapshot);
    case 'back':
      await chrome.tabs.goBack(attachedTabId).catch(() => {});
      await waitTabComplete(attachedTabId, 4000);
      return call(pageSnapshot);
    default:
      throw new Error('operazione sconosciuta: ' + op);
  }
}

/* ---- WebSocket verso il daemon ---- */
function connectWs() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = new WebSocket(WS_URL);
  ws.onopen = () => setBadge('ON', '#2e7d32');
  ws.onclose = () => {
    setBadge('', '');
    scheduleReconnect();
  };
  ws.onerror = () => {};
  ws.onmessage = async (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!msg || typeof msg.id === 'undefined') return;
    try {
      const result = await handleOp(msg.op, msg.args || {});
      ws.send(JSON.stringify({ id: msg.id, result }));
    } catch (e) {
      ws.send(JSON.stringify({ id: msg.id, error: String((e && e.message) || e) }));
    }
  };
}
function scheduleReconnect() {
  if (attachedTabId == null) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectWs, 2000);
}

/* ---- attach/detach sulla scheda attiva (click sull'icona) ---- */
async function toggle(tab) {
  if (attachedTabId === tab.id) return detach();
  if (attachedTabId != null) await detach();
  attachedTabId = tab.id;
  await new Promise((resolve, reject) =>
    chrome.debugger.attach({ tabId: tab.id }, PROTOCOL, () =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
    ),
  ).catch((e) => {
    attachedTabId = null;
    throw e;
  });
  await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.enable', {}).catch(() => {});
  connectWs();
  setBadge('ON', '#2e7d32');
}
async function detach() {
  const id = attachedTabId;
  attachedTabId = null;
  if (ws) {
    ws.close();
    ws = null;
  }
  if (id != null) await chrome.debugger.detach({ tabId: id }).catch(() => {});
  setBadge('', '');
}
function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

chrome.action.onClicked.addListener((tab) => {
  toggle(tab).catch((e) => console.warn('OpenMate toggle:', e.message));
});
chrome.debugger.onDetach.addListener((src) => {
  if (src.tabId === attachedTabId) detach();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === attachedTabId) detach();
});

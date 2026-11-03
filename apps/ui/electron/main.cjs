const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  Menu,
  safeStorage,
  shell,
  systemPreferences,
  desktopCapturer,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

const WIDTH = 500; // largo: robot su un lato, fumetto sull'altro (verso il centro)
const HEIGHT = 540;
const ROBOT_W = 200;
const ROBOT_MARGIN = 10;
let currentSide = 'right';
const HOTKEY = process.env.OPENMATE_HOTKEY || 'CommandOrControl+Shift+O';
// "Indica e chiedi": punta il mouse su qualcosa e premi questa combinazione.
const POINT_HOTKEY = process.env.OPENMATE_POINT_HOTKEY || 'Control+Alt+Space';
const PORT = Number(process.env.OPENMATE_PORT || 8787);
const SHOT_PORT = PORT + 1; // mini-server screenshot (Electron desktopCapturer)
const DAEMON_URL = process.env.OPENMATE_URL || `http://127.0.0.1:${PORT}`;
// Modalità demo/dev: non gestire il daemon né l'onboarding (daemon esterno).
const EXTERNAL = Boolean(process.env.OPENMATE_EXTERNAL);

let win; // companion
let onbWin; // onboarding
let settingsWin; // impostazioni
let daemonProc;
let paused = false;

const userData = app.getPath('userData');
const configFile = path.join(userData, 'openmate.config.json');
const keyFile = path.join(userData, 'openmate.key');
const storageRoot = path.join(userData, 'data');

// Il daemon è un processo Node separato. In dev restiamo sull'ESM del monorepo
// spawnato con `node` di sistema (ABI dei nativi = node dev). In pacchetto usiamo
// il bundle esbuild eseguito dal binario Electron in modalità Node
// (ELECTRON_RUN_AS_NODE), con NODE_PATH ai nativi ricompilati e spacchettati.
const isPackaged = app.isPackaged;
const daemonEntry = isPackaged
  ? path.join(process.resourcesPath, 'daemon', 'daemon.cjs')
  : path.join(__dirname, '..', '..', '..', 'packages', 'daemon', 'dist', 'index.js');
const nativeModulesDir = isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
  : path.join(__dirname, '..', '..', '..', 'node_modules');

/* ---------------- persistenza config + chiave (safeStorage) ---------------- */
function isOnboarded() {
  return fs.existsSync(configFile);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    return {};
  }
}

/** Aggiorna la config esistente dai valori delle Impostazioni. */
function saveSettings(data) {
  const config = readConfig();
  config.provider = config.provider || {};
  const p = data.provider || {};
  config.provider.name = p.name || config.provider.name || 'anthropic';
  if (p.model) config.provider.model = p.model;
  if (p.baseURL) config.provider.baseURL = p.baseURL;
  else delete config.provider.baseURL;
  config.provider.auth = p.auth === 'claude-subscription' ? 'claude-subscription' : 'api-key';
  config.autonomy = config.autonomy || { shell: { allow: [], deny: [] }, files: { allow: [] } };
  config.autonomy.autoApprove = ['none', 'read', 'write'].includes(data.autoApprove)
    ? data.autoApprove
    : config.autonomy.autoApprove || 'read';
  const minutes = Number(data.heartbeatMinutes) || 15;
  config.heartbeat = config.heartbeat || { cron: [] };
  config.heartbeat.intervalMs = minutes * 60000;
  config.computerUse = { enabled: Boolean(data.computerUse) };
  config.browser = {
    ...(config.browser || {}),
    enabled: Boolean(data.browser),
    mode: data.browserMode === 'extension' ? 'extension' : 'auto',
  };
  if (!config.storage) config.storage = { root: storageRoot };
  if (!config.budget) config.budget = { maxSteps: 12, wallClockMs: 120000 };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
  if (data.apiKey) saveKey(data.apiKey);
}

function saveKey(key) {
  if (!key) return;
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key)
    : Buffer.from(key, 'utf8');
  fs.writeFileSync(keyFile, data);
}
function loadKey() {
  if (!fs.existsSync(keyFile)) return '';
  const buf = fs.readFileSync(keyFile);
  try {
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch {
    return '';
  }
}

/* ---------------- login abbonamento Claude (riuso Claude Code) ---------------- */
// Legge (senza rinnovare) le credenziali di Claude Code per mostrare lo stato in
// UI. Versione JS leggera del probe in @openmate/llm (che è ESM, non richiedibile
// da questo main CommonJS). Vedi packages/llm/src/claude-subscription.ts.
function probeClaudeLogin() {
  const parse = (text) => {
    try {
      const o = JSON.parse(text)?.claudeAiOauth;
      if (!o?.accessToken || typeof o.expiresAt !== 'number') return null;
      return { loggedIn: true, expiresAt: o.expiresAt };
    } catch {
      return null;
    }
  };
  try {
    const file = path.join(os.homedir(), '.claude', '.credentials.json');
    const fromFile = parse(fs.readFileSync(file, 'utf8'));
    if (fromFile) return fromFile;
  } catch {
    /* prova il Keychain */
  }
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync(
        'security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-a', os.userInfo().username, '-w'],
        { encoding: 'utf8' },
      );
      const fromKc = parse(out.trim());
      if (fromKc) return fromKc;
    } catch {
      /* non loggato */
    }
  }
  return { loggedIn: false };
}
ipcMain.handle('claude-subscription-status', () => probeClaudeLogin());

function writePersona(name, tone) {
  const memDir = path.join(storageRoot, 'memory');
  fs.mkdirSync(memDir, { recursive: true });
  const toneLine =
    { conciso: 'Sono conciso e diretto.', curioso: 'Sono curioso e amichevole.', formale: 'Sono cortese e formale.' }[
      tone
    ] || 'Sono amichevole.';
  fs.writeFileSync(
    path.join(memDir, 'persona.md'),
    `# ${name}\n\nSono ${name}, il compagno AI personale su questo dispositivo. ${toneLine}\n`,
    'utf8',
  );
  const up = path.join(memDir, 'user-profile.md');
  if (!fs.existsSync(up)) fs.writeFileSync(up, '# Profilo utente\n\n(Ancora da conoscere.)\n', 'utf8');
}

function saveOnboarding(data) {
  fs.mkdirSync(storageRoot, { recursive: true });
  const minutes = Number(data.heartbeatMinutes) || 15;
  const p = data.provider || { name: 'anthropic', model: 'claude-sonnet-4-5' };
  const provider = { name: p.name || 'anthropic', model: p.model || 'claude-sonnet-4-5' };
  if (p.baseURL) provider.baseURL = p.baseURL;
  provider.auth = p.auth === 'claude-subscription' ? 'claude-subscription' : 'api-key';
  const config = {
    provider,
    heartbeat: { intervalMs: minutes * 60000, cron: [] },
    autonomy: {
      shell: { allow: [], deny: [] },
      files: { allow: [] },
      autoApprove: ['none', 'read', 'write'].includes(data.autoApprove) ? data.autoApprove : 'read',
    },
    budget: { maxSteps: 12, wallClockMs: 120000 },
    storage: { root: storageRoot },
    computerUse: { enabled: Boolean(data.computerUse) },
  };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
  saveKey(data.apiKey);
  writePersona(data.name || 'Remi', data.tone || 'curioso');
}

/* --------- screenshot via Electron (desktopCapturer) ---------
   Catturare dentro Electron lega la Registrazione schermo all'app (identità
   pulita, concedibile e affidabile), invece del node figlio con TCC ambigua. */
const http = require('node:http');
let shotServer;
function startShotServer() {
  if (shotServer || EXTERNAL) return;
  shotServer = http.createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith('/shot')) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const display = screen.getPrimaryDisplay();
      const sf = display.scaleFactor || 1;
      const size = { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) };
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
      const png = src.thumbnail.toPNG();
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png);
    } catch (e) {
      res.writeHead(500);
      res.end(String((e && e.message) || e));
    }
  });
  shotServer.on('error', (e) => console.log('[shot] server error', e.message));
  shotServer.listen(SHOT_PORT, '127.0.0.1');
}

/* ---------------- lifecycle del daemon ---------------- */
function startDaemon() {
  if (EXTERNAL || daemonProc) return;
  startShotServer();
  // Pacchetto: binario Electron come Node. Dev: `node` di sistema (override OPENMATE_NODE).
  const node = isPackaged ? process.execPath : process.env.OPENMATE_NODE || 'node';
  // In modalità abbonamento il daemon legge il token da Claude Code: niente API key.
  const usesSubscription = readConfig().provider?.auth === 'claude-subscription';
  daemonProc = spawn(node, [daemonEntry], {
    env: {
      ...process.env,
      // Solo in pacchetto: esegui il binario Electron come Node puro e risolvi i
      // moduli nativi (better-sqlite3, @nut-tree-fork/*, playwright-core) via NODE_PATH.
      ...(isPackaged ? { ELECTRON_RUN_AS_NODE: '1', NODE_PATH: nativeModulesDir } : {}),
      OPENMATE_CONFIG: configFile,
      OPENMATE_API_KEY: usesSubscription ? '' : loadKey(),
      OPENMATE_PORT: String(PORT),
      OPENMATE_SHOT_URL: `http://127.0.0.1:${SHOT_PORT}/shot`,
    },
    cwd: path.dirname(daemonEntry),
    stdio: 'inherit',
  });
  daemonProc.on('exit', (code) => {
    console.log('[daemon] exit', code);
    daemonProc = undefined;
  });
}
function stopDaemon() {
  if (daemonProc) daemonProc.kill();
  daemonProc = undefined;
}

/* ---------------- finestra companion (overlay) ---------------- */
function createCompanion() {
  if (win) {
    win.show();
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: workArea.x + workArea.width - WIDTH - 8,
    y: workArea.y + workArea.height - HEIGHT - 120,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // il preload usa node:fs/path per l'asset Rive
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => applyLayout());
  win.on('closed', () => {
    win = undefined;
  });

  if (process.env.OPENMATE_UI_DEBUG) {
    win.webContents.on('console-message', (_e, _lvl, message, line, source) =>
      console.log(`[renderer] ${message} (${source}:${line})`),
    );
    win.webContents.on('preload-error', (_e, p, err) => console.error(`[preload-error] ${p}: ${err}`));
    win.webContents.once('did-finish-load', () => console.log('[main] companion caricato'));
  }
}

/* ---------------- finestra onboarding ---------------- */
function openOnboarding() {
  onbWin = new BrowserWindow({
    width: 560,
    height: 640,
    resizable: false,
    title: 'Remi',
    backgroundColor: '#0a0c0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload-onboarding.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  onbWin.loadFile(path.join(__dirname, '..', 'renderer', 'onboarding.html'));
  onbWin.on('closed', () => {
    onbWin = undefined;
    // se l'utente chiude senza completare e non c'è companion, esci
    if (!win && !isOnboarded()) app.quit();
  });
}

ipcMain.on('onboarding-complete', (_e, data) => {
  saveOnboarding(data);
  startDaemon();
  createCompanion();
  if (onbWin) {
    onbWin.close();
    onbWin = undefined;
  }
});

/* ---------------- finestra impostazioni ---------------- */
let dashboardWin; // cruscotto
function openDashboard() {
  if (dashboardWin) {
    dashboardWin.focus();
    return;
  }
  dashboardWin = new BrowserWindow({
    width: 640,
    height: 720,
    title: 'Remi — Cruscotto',
    backgroundColor: '#0a0c0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload-dashboard.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  dashboardWin.loadFile(path.join(__dirname, '..', 'renderer', 'dashboard.html'));
  dashboardWin.on('closed', () => {
    dashboardWin = undefined;
  });
}

function openSettings() {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 520,
    height: 660,
    resizable: false,
    title: 'Remi — Impostazioni',
    backgroundColor: '#0a0c0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWin.webContents.on('did-finish-load', () => {
    settingsWin.webContents.send('settings-data', { config: readConfig(), hasKey: fs.existsSync(keyFile) });
  });
  settingsWin.on('closed', () => {
    settingsWin = undefined;
  });
}

ipcMain.on('settings-save', (_e, data) => {
  saveSettings(data);
  stopDaemon();
  startDaemon(); // riparte con la nuova config/chiave
  if (settingsWin) {
    settingsWin.close();
    settingsWin = undefined;
  }
});
ipcMain.on('settings-close', () => {
  if (settingsWin) {
    settingsWin.close();
    settingsWin = undefined;
  }
});

// Richiede i permessi del computer-use. Su macOS usa le API di sistema per
// FAR COMPARIRE l'app nella lista con un prompt (niente aggiunta manuale col +).
ipcMain.on('open-permission', async (_e, which) => {
  if (process.platform !== 'darwin') return;
  if (which === 'accessibility') {
    // Mostra il prompt e aggiunge l'app alla lista Accessibilità.
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    if (trusted) return; // già concesso
    // apri comunque il pannello per completare l'attivazione
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  } else {
    // Registrazione schermo: se non concesso, una cattura innesca il prompt/entry.
    if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
      try {
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
      } catch {
        /* ignora: serve solo a innescare il prompt */
      }
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
  }
});

/* ---------------- IPC companion ---------------- */
ipcMain.on('set-interactive', (_e, interactive) => {
  if (win) win.setIgnoreMouseEvents(!interactive, { forward: true });
});

let dragOffset = null;
let dragTimer = null;
ipcMain.on('drag-start', () => {
  if (!win) return;
  const cur = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragOffset = { x: cur.x - wx, y: cur.y - wy };
  win.setIgnoreMouseEvents(false);
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!win || !dragOffset) return;
    const p = screen.getCursorScreenPoint();
    win.setPosition(p.x - dragOffset.x, p.y - dragOffset.y);
  }, 16);
});
ipcMain.on('drag-end', () => {
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = null;
  dragOffset = null;
  applyLayout();
});

// Sceglie il lato del fumetto in base a dove si trova la finestra sullo schermo.
function robotOffset(side) {
  return side === 'right' ? WIDTH - ROBOT_MARGIN - ROBOT_W : ROBOT_MARGIN;
}
function applyLayout() {
  if (!win) return;
  const { workArea } = screen.getPrimaryDisplay();
  const [wx, wy] = win.getPosition();
  const side = wx + WIDTH / 2 > workArea.x + workArea.width / 2 ? 'right' : 'left';
  if (side !== currentSide) {
    // riposiziona la finestra per NON far saltare il robot quando cambia lato
    const robotCenter = wx + robotOffset(currentSide) + ROBOT_W / 2;
    win.setPosition(Math.round(robotCenter - robotOffset(side) - ROBOT_W / 2), wy);
    currentSide = side;
  }
  win.webContents.send('layout', side);
}

ipcMain.on('quit', () => app.quit());

/* ---------------- "indica e chiedi" (lavagna sul monitor indicato) ---------------- */
// Larghezza massima dello screenshot inviato al modello (come il computer-use).
const POINT_MAX_W = 1366;
// Zona ingrandita attorno al cursore, in punti logici.
const ZOOM_W = 520;
const ZOOM_H = 320;
// Dopo la risposta, la lavagna si cancella da sola.
const POINT_LINGER_MS = 60000;

let pointerWin;
let pointerReady;
let pendingPoint; // cattura in attesa della domanda
let pointTurn = false; // un turno "indica" è in corso
let pointBusy = false; // il daemon ha iniziato a lavorare sul turno (evita idle di un ciclo precedente)
let pointMuted = false; // l'utente ha chiuso la lavagna: ignora il resto del turno
let lingerTimer;

function ensurePointerWin(display) {
  if (!pointerWin) {
    pointerWin = new BrowserWindow({
      ...display.bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      enableLargerThanScreen: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload-pointer.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    pointerWin.setAlwaysOnTop(true, 'screen-saver');
    pointerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    pointerWin.setIgnoreMouseEvents(true, { forward: true });
    pointerReady = new Promise((resolve) => pointerWin.webContents.once('did-finish-load', resolve));
    pointerWin.loadFile(path.join(__dirname, '..', 'renderer', 'pointer.html'));
    pointerWin.on('closed', () => {
      pointerWin = undefined;
    });
  } else {
    pointerWin.setBounds(display.bounds);
  }
  return pointerReady;
}

function sendPointer(channel, payload) {
  if (pointerWin) pointerWin.webContents.send(channel, payload);
}

/** Restituisce il fuoco all'app che l'utente stava usando (macOS: niente "attivazione" di Remi). */
function releaseFocus() {
  if (!pointerWin) return;
  pointerWin.setIgnoreMouseEvents(true, { forward: true });
  if (process.platform === 'darwin') {
    const visible = BrowserWindow.getAllWindows().filter((w) => w.isVisible());
    app.hide();
    for (const w of visible) w.showInactive();
  } else {
    pointerWin.blur();
  }
}

function hidePointer() {
  clearTimeout(lingerTimer);
  sendPointer('pointer-clear');
  pointerWin?.hide();
}

/** Cattura il monitor `display` a piena risoluzione. */
async function grabDisplay(display) {
  const b = display.bounds;
  const sf = display.scaleFactor || 1;
  const size = { width: Math.round(b.width * sf), height: Math.round(b.height * sf) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  return src.thumbnail;
}

/**
 * Prepara il messaggio per il daemon: screenshot ridotto (coordinate in pixel di
 * questa immagine) + ingrandimento. Con `path` (area circoscritta, coordinate
 * globali) l'ingrandimento è l'area stessa; altrimenti la zona attorno a `cur`.
 */
function buildPointPayload(full, display, cur, path) {
  const b = display.bounds;
  const px = full.getSize().width / b.width; // pixel reali per punto logico
  const shot = full.getSize().width > POINT_MAX_W ? full.resize({ width: POINT_MAX_W, quality: 'good' }) : full;
  const k = shot.getSize().width / b.width;
  const local = (p) => ({ x: p.x - b.x, y: p.y - b.y });
  const c = local(cur);
  const payload = {
    image: shot.toPNG().toString('base64'),
    cursor: { x: c.x * k, y: c.y * k },
    frame: { x: b.x, y: b.y, w: b.width, h: b.height },
  };

  let zone;
  if (path) {
    const pts = path.map(local);
    payload.path = pts.map((p) => ({ x: p.x * k, y: p.y * k }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = 24;
    const x0 = Math.max(0, Math.min(...xs) - pad);
    const y0 = Math.max(0, Math.min(...ys) - pad);
    zone = {
      x: x0,
      y: y0,
      w: Math.min(b.width, Math.max(...xs) + pad) - x0,
      h: Math.min(b.height, Math.max(...ys) + pad) - y0,
    };
  } else {
    const w = Math.min(ZOOM_W, b.width);
    const h = Math.min(ZOOM_H, b.height);
    zone = {
      x: Math.max(0, Math.min(b.width - w, c.x - w / 2)),
      y: Math.max(0, Math.min(b.height - h, c.y - h / 2)),
      w,
      h,
    };
    payload.zoomCursor = { x: (c.x - zone.x) * px, y: (c.y - zone.y) * px };
  }
  let zoom = full.crop({
    x: Math.round(zone.x * px),
    y: Math.round(zone.y * px),
    width: Math.max(1, Math.round(zone.w * px)),
    height: Math.max(1, Math.round(zone.h * px)),
  });
  // un'area grande non serve a piena risoluzione (token e latenza)
  if (path && zoom.getSize().width > POINT_MAX_W) zoom = zoom.resize({ width: POINT_MAX_W, quality: 'good' });
  payload.zoom = zoom.toPNG().toString('base64');
  return payload;
}

/* --- "tieni premuto e circoscrivi": serve l'hook nativo per sapere quando si rilascia --- */
// Electron (globalShortcut) segnala solo la pressione. uiohook-napi vede anche il
// rilascio; se non è disponibile (o manca il permesso Accessibilità) si resta
// alla modalità "punto" con un solo tocco.
const TRACE_TICK_MS = 16;
const TRACE_MAX_MS = 10000; // sicurezza: se il rilascio non arriva, chiudi comunque
const TRACE_MIN_SIZE = 24; // sotto questa dimensione (punti) è un punto, non un'area

let hook;
let lastHookKeyDown = 0;
const pointDebug = (...args) => process.env.OPENMATE_UI_DEBUG && console.log('[point]', ...args);
let tracing; // { display, points, grab, timer, maxTimer, done }

function startKeyHook() {
  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.on('keydown', () => {
      lastHookKeyDown = Date.now();
    });
    uIOhook.on('keyup', () => {
      if (tracing) void endTrace();
    });
    uIOhook.start();
    hook = uIOhook;
    pointDebug('hook tastiera attivo');
  } catch (err) {
    console.warn('[point] hook tastiera non disponibile: solo modalità punto', err?.message || err);
  }
}

/** L'hook è vivo se ha visto la pressione della hotkey appena avvenuta. */
function hookAlive() {
  return Boolean(hook) && Date.now() - lastHookKeyDown < 600;
}

async function startPoint() {
  if (tracing) return; // ripetizione automatica del tasto mentre si traccia
  // seconda pressione mentre si sta chiedendo: annulla
  if (pendingPoint) {
    pendingPoint = undefined;
    hidePointer();
    releaseFocus();
    return;
  }
  const cur = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cur);
  const t = { display, points: [cur], done: false };
  tracing = t;
  // i disegni precedenti non devono finire nello screenshot
  if (pointerWin?.isVisible()) {
    hidePointer();
    await new Promise((r) => setTimeout(r, 80));
  }
  t.grab = grabDisplay(display);
  pointDebug('hotkey', hookAlive() ? 'tieni premuto per circoscrivere' : 'hook non attivo: modalità punto');
  if (!hookAlive()) {
    await endTrace();
    return;
  }
  // registra il percorso del mouse finché la hotkey resta premuta
  t.timer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const last = t.points[t.points.length - 1];
    if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 2) return;
    t.points.push(p);
    sendTrace(t);
  }, TRACE_TICK_MS);
  t.maxTimer = setTimeout(() => void endTrace(), TRACE_MAX_MS);
  // la lavagna compare solo a cattura fatta, così il tracciato non finisce nello screenshot
  t.grab
    .then(() => (t.done ? undefined : ensurePointerWin(display)))
    .then(() => {
      if (t.done || !pointerWin) return;
      pointerWin.setIgnoreMouseEvents(true, { forward: true });
      pointerWin.showInactive();
      sendTrace(t);
    })
    .catch(() => {});
}

/** Invia la posizione attuale del mouse: la lavagna ne fa alone e scia. */
function sendTrace(t) {
  if (!pointerWin?.isVisible()) return;
  const b = t.display.bounds;
  const p = t.points[t.points.length - 1];
  sendPointer('pointer-trace', { x: p.x - b.x, y: p.y - b.y });
}

/**
 * Zona interessata dal passaggio del mouse: inviluppo convesso del percorso
 * (un giro attorno a qualcosa ne include l'interno), allargato di `pad` punti
 * in ogni direzione, così una passata dritta copre una striscia e non una linea.
 */
function sweptArea(points, pad) {
  // ogni punto diventa un piccolo ottagono: l'inviluppo copre la striscia percorsa
  const offsets = [...Array(8)].map((_, i) => [Math.cos((i * Math.PI) / 4) * pad, Math.sin((i * Math.PI) / 4) * pad]);
  const pts = points
    .flatMap((p) => offsets.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy })))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

async function endTrace() {
  const t = tracing;
  if (!t || t.done) return;
  t.done = true;
  clearInterval(t.timer);
  clearTimeout(t.maxTimer);
  tracing = undefined;

  let full;
  try {
    full = await t.grab;
  } catch (err) {
    console.error('[point] cattura fallita', err);
    hidePointer();
    win?.webContents.send(
      'point-error',
      'Non riesco a catturare lo schermo: controlla il permesso Registrazione schermo.',
    );
    return;
  }
  const { display, points } = t;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const isArea =
    points.length > 3 &&
    Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= TRACE_MIN_SIZE;
  const end = points[points.length - 1];
  pointDebug(isArea ? `area (${points.length} punti)` : 'punto');
  const area = isArea ? sweptArea(points, 20) : undefined;
  pendingPoint = buildPointPayload(full, display, isArea ? end : points[0], area);

  await ensurePointerWin(display);
  pointerWin.setIgnoreMouseEvents(false);
  pointerWin.show();
  pointerWin.focus();
  if (process.platform === 'darwin') app.focus({ steal: true });
  const at = isArea ? end : points[0];
  sendPointer('pointer-ask', { x: at.x - display.bounds.x, y: at.y - display.bounds.y, area: isArea });
}

ipcMain.on('pointer-submit', async (_e, text) => {
  const capture = pendingPoint;
  pendingPoint = undefined;
  releaseFocus();
  if (!capture) return;
  clearTimeout(lingerTimer);
  pointMuted = false;
  setPointTurn(true);
  sendPointer('pointer-thinking');
  try {
    const res = await fetch(`${DAEMON_URL}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'point_message', content: text, ...capture }),
    });
    if (!res.ok) throw new Error(`daemon ${res.status}`);
  } catch (err) {
    console.error('[point] invio fallito', err);
    setPointTurn(false);
    sendPointer('pointer-answer', 'Non riesco a raggiungere Remi in questo momento.');
    lingerTimer = setTimeout(hidePointer, 6000);
  }
});

// la scheda della risposta è cliccabile (✕): il resto della lavagna lascia passare i click
ipcMain.on('pointer-interactive', (_e, on) => {
  if (pointerWin && !pendingPoint) pointerWin.setIgnoreMouseEvents(!on, { forward: true });
});

ipcMain.on('pointer-cancel', () => {
  if (pointTurn) {
    setPointTurn(false);
    pointMuted = true;
  }
  pendingPoint = undefined;
  hidePointer();
  releaseFocus();
});

function setPointTurn(on) {
  pointTurn = on;
  pointBusy = false;
  // il companion non ripete nel fumetto le risposte mostrate sulla lavagna
  win?.webContents.send('point-active', on);
}

/** Converte gli elementi (coordinate globali) nello spazio della lavagna. */
function showOverlay(items, clear) {
  if (!items.length) return;
  const first = items[0];
  const display = screen.getDisplayNearestPoint({ x: first.x, y: first.y });
  const needsMove = !pointerWin || !pointerWin.isVisible() || !sameBounds(pointerWin.getBounds(), display.bounds);
  const ready = needsMove ? ensurePointerWin(display) : Promise.resolve();
  ready.then(() => {
    if (!pointerWin) return;
    if (!pointerWin.isVisible()) pointerWin.showInactive();
    const wb = pointerWin.getBounds();
    const local = items.map((it) => ({ ...it, x: it.x - wb.x, y: it.y - wb.y }));
    sendPointer('pointer-draw', { items: local, clear });
    clearTimeout(lingerTimer);
    if (!pointTurn) lingerTimer = setTimeout(hidePointer, POINT_LINGER_MS);
  });
}

function sameBounds(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function handleDaemonEvent(e) {
  if (e.kind === 'state' && e.state?.status === 'idle') pointMuted = false;
  if (pointMuted) return;
  if (e.kind === 'overlay') {
    if (e.op === 'clear') sendPointer('pointer-clear');
    else showOverlay(e.items || [], Boolean(e.clear));
    return;
  }
  if (!pointTurn) return;
  if (e.kind === 'message') {
    sendPointer('pointer-answer', e.content);
  } else if (e.kind === 'action' && typeof e.summary === 'string' && !e.summary.startsWith('overlay.')) {
    sendPointer('pointer-status', `· ${e.summary}`);
  } else if (e.kind === 'state' && e.state?.status !== 'idle') {
    pointBusy = true;
  } else if (e.kind === 'state' && e.state?.status === 'idle' && pointBusy) {
    setPointTurn(false);
    sendPointer('pointer-done');
    clearTimeout(lingerTimer);
    lingerTimer = setTimeout(hidePointer, POINT_LINGER_MS);
  }
}

/** Ascolta gli eventi del daemon (SSE) dal processo main, con riconnessione. */
async function subscribeDaemon() {
  for (;;) {
    try {
      const res = await fetch(`${DAEMON_URL}/events`);
      if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
      const decoder = new TextDecoder();
      let buf = '';
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = frame
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          try {
            handleDaemonEvent(JSON.parse(data));
          } catch {
            /* frame non-JSON */
          }
        }
      }
    } catch {
      /* daemon non ancora pronto o riavviato */
    }
    if (pointTurn) setPointTurn(false);
    await new Promise((r) => setTimeout(r, 2500));
  }
}

function summon() {
  if (!win) return;
  win.show();
  win.focus();
  win.setIgnoreMouseEvents(false);
  win.webContents.send('summon');
}

async function postDaemon(kind) {
  try {
    await fetch(`${DAEMON_URL}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
  } catch (err) {
    console.error('postDaemon', err);
  }
}

function showContextMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: paused ? '☀  Sveglia' : '☾  Dormi',
      click: () => {
        postDaemon(paused ? 'resume' : 'pause');
        paused = !paused;
      },
    },
    { label: '⏹  Interrompi', click: () => postDaemon('interrupt') },
    { type: 'separator' },
    { label: 'Cosa stai facendo?', click: () => win?.webContents.send('show-activity') },
    { label: 'Cruscotto…', click: () => openDashboard() },
    { label: 'Impostazioni…', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Esci', role: 'quit' },
  ]);
  menu.popup({ window: win });
}
ipcMain.on('context-menu', showContextMenu);

/* ---------------- avvio ---------------- */
app.whenReady().then(() => {
  globalShortcut.register(HOTKEY, summon);
  if (!globalShortcut.register(POINT_HOTKEY, () => void startPoint())) {
    console.warn(`[point] hotkey ${POINT_HOTKEY} non disponibile (usata da un'altra app?)`);
  }
  startKeyHook();
  void subscribeDaemon();
  if (EXTERNAL || isOnboarded()) {
    startDaemon();
    createCompanion();
  } else {
    openOnboarding();
  }
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try {
    hook?.stop();
  } catch {
    /* già fermo */
  }
  stopDaemon();
});
// chiusura pulita (spegne anche il daemon) anche via segnale
process.on('SIGTERM', () => app.quit());
process.on('SIGINT', () => app.quit());
app.on('activate', () => {
  if (!win && !onbWin && (EXTERNAL || isOnboarded())) createCompanion();
});
app.on('window-all-closed', () => app.quit());

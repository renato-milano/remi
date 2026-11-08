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
const { spawn, execFile, execFileSync } = require('node:child_process');

const WIDTH = 500; // largo: robot su un lato, fumetto sull'altro (verso il centro)
const HEIGHT = 540;
const ROBOT_W = 200;
const ROBOT_MARGIN = 10;
let currentSide = 'right';
const HOTKEY = process.env.OPENMATE_HOTKEY || 'CommandOrControl+Shift+O';
// "Indica e chiedi": un tasto solo, tenuto premuto (⌥ destro su Mac; Ctrl destro altrove,
// perché Alt destro è AltGr e serve a scrivere @ # [ ] sulle tastiere europee).
// Nome di un tasto di uiohook-napi (es. 'AltRight', 'CtrlRight', 'MetaRight').
const POINT_KEY = process.env.OPENMATE_POINT_KEY || (process.platform === 'darwin' ? 'AltRight' : 'CtrlRight');
// Ripiego se l'hook nativo non parte (manca il permesso Accessibilità): combinazione classica.
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
// whisper-server (trascrizione locale della voce): compilato da packaging/build-whisper.sh
const whisperBin = path.join(
  isPackaged ? path.join(process.resourcesPath, 'whisper') : path.join(__dirname, '..', 'build', 'whisper'),
  process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server',
);
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
  config.voice = {
    ...(config.voice || {}),
    enabled: Boolean(data.voice),
    tts: ['auto', 'system', 'off'].includes(data.voiceTts) ? data.voiceTts : config.voice?.tts || 'auto',
    wakeWord: Boolean(data.wakeWord),
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
    // il daemon sta per usare mouse, tastiera o screenshot: niente finestre di Remi in mezzo
    if (req.url?.startsWith('/overlays-off')) {
      if (clearOverlaysForRemi()) await new Promise((r) => setTimeout(r, 80));
      res.writeHead(204);
      res.end();
      return;
    }
    if (!req.url || !req.url.startsWith('/shot')) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const display = screen.getPrimaryDisplay();
      const sf = display.scaleFactor || 1;
      let size = { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) };
      // ?w=1366: cattura già alla larghezza voluta (ridimensionare dopo, in JS, costa ~0,5 s a scatto)
      const maxW = Number(new URL(req.url, 'http://x').searchParams.get('w'));
      if (maxW > 0 && size.width > maxW) size = { width: maxW, height: Math.round((size.height * maxW) / size.width) };
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
      ...(fs.existsSync(whisperBin) ? { OPENMATE_WHISPER_BIN: whisperBin } : {}),
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
  if (win) return;
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
    show: false, // Remi resta nascosto: compare col doppio tocco, "Hey Remi" o quando deve parlarti
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
  if (data.voice) void askMicrophone();
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
let pointBoard; // il turno è una domanda su questa lavagna (chiusa): niente segni dove stava
// Remi sta usando mouse e tastiera: le sue finestre non devono prendersi i suoi clic (fino a fine turno)
let remiActing = false;
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

/* ---------------- finestra 3D (modelli costruiti in streaming) ---------------- */

let scene3dWin;
let scene3dReady;

/** Il bundle della finestra 3D (Three.js): in sviluppo si rigenera all'avvio, nel pacchetto è già pronto. */
function buildScene3dBundle() {
  if (isPackaged) return Promise.resolve();
  return new Promise((resolve) => {
    const child = spawn(process.env.OPENMATE_NODE || 'node', [path.join(__dirname, '..', 'scene3d', 'build.mjs')], {
      stdio: 'inherit',
    });
    child.on('exit', () => resolve());
    child.on('error', (err) => {
      console.warn('[scene3d] bundle non generato:', err.message);
      resolve();
    });
  });
}
const scene3dBundle = app.whenReady().then(buildScene3dBundle);

/** Finestra trasparente sul monitor dove sta l'utente: i clic passano, tranne sopra il modello e i controlli. */
function ensureScene3dWin() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (!scene3dWin) {
    scene3dWin = new BrowserWindow({
      ...display.workArea,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      fullscreenable: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload-scene3d.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    scene3dWin.setAlwaysOnTop(true, 'floating');
    scene3dWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    scene3dWin.setIgnoreMouseEvents(true, { forward: true });
    scene3dWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    scene3dWin.webContents.on('will-navigate', (event) => event.preventDefault());
    scene3dReady = scene3dBundle.then(
      () =>
        new Promise((resolve) => {
          scene3dWin.webContents.once('did-finish-load', resolve);
          scene3dWin.loadFile(path.join(__dirname, '..', 'renderer', 'scene3d.html'));
        }),
    );
    scene3dWin.on('closed', () => {
      scene3dWin = undefined;
    });
  } else if (!scene3dWin.isVisible()) {
    scene3dWin.setBounds(display.workArea);
  }
  return scene3dReady;
}

/** Eventi del modello 3D dal daemon: 'start' apre (o ripulisce) la finestra, il resto la costruisce. */
let scene3dQueue = Promise.resolve();
/** Con OPENMATE_UI_DEBUG ogni scena 3D si salva com'è arrivata (eventi), per riprodurla e misurarla. */
let scene3dDump;
function dumpScene3d(event) {
  if (!process.env.OPENMATE_UI_DEBUG) return;
  if (event.op === 'start') scene3dDump = { at: Date.now(), events: [] };
  if (!scene3dDump) return;
  scene3dDump.events.push({ kind: 'scene3d', ...event });
  if (event.op !== 'end') return;
  const dir = path.join(userData, 'debug', 'scenes');
  const file = path.join(dir, `scene-${scene3dDump.at}.json`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(scene3dDump.events));
    console.log(`[scene3d] scena salvata: ${file}`);
  } catch (err) {
    console.warn('[scene3d] scena non salvata:', err.message);
  }
  scene3dDump = undefined;
}

function handleScene3d(e) {
  const { kind: _kind, ...event } = e;
  dumpScene3d(event);
  if (event.op === 'end' && event.errors?.length)
    console.warn(`[scene3d] «${event.title}»: ${event.nodes} parti, scartato:\n  ${event.errors.join('\n  ')}`);
  if (event.op === 'start' && !scene3dWin?.isVisible()) ensureScene3dWin();
  if (!scene3dWin) return;
  // in ordine: le parti arrivate prima che la pagina sia pronta aspettano il caricamento
  scene3dQueue = scene3dQueue
    .then(() => scene3dReady)
    .then(() => {
      if (!scene3dWin) return;
      if (event.op === 'start') {
        scene3dWin.setIgnoreMouseEvents(true, { forward: true });
        scene3dWin.showInactive();
      }
      scene3dWin.webContents.send('scene3d-event', event);
    });
}
ipcMain.on('scene3d-interactive', (e, on) => {
  if (scene3dWin && e.sender === scene3dWin.webContents) scene3dWin.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on('scene3d-close', (e) => {
  if (!scene3dWin || e.sender !== scene3dWin.webContents) return;
  scene3dWin.setIgnoreMouseEvents(true, { forward: true });
  scene3dWin.hide();
});

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
// byte al secondo dei WAV dalla lavagna (16 kHz, 16 bit, mono)
const SAMPLE_RATE_BYTES = 16000 * 2;
const TRACE_MAX_MS = 10000; // sicurezza: se il rilascio non arriva, chiudi comunque
const TRACE_MIN_SIZE = 24; // sotto questa dimensione (punti) è un punto, non un'area

let hook;
const pointDebug = (...args) => process.env.OPENMATE_UI_DEBUG && console.log('[point]', ...args);
// tempi delle fasi di un turno, misurati dal rilascio della hotkey (log di debug)
let releasedAt = 0;
const phase = (name) =>
  process.env.OPENMATE_UI_DEBUG && releasedAt && console.log(`[tempi] +${Date.now() - releasedAt} ms  ${name}`);
let tracing; // { display, points, grab, timer, maxTimer, done }

/* --- tasto unico: tieni premuto = indica e parla, tocco = scrivi, doppio tocco = Remi --- */
const TAP_MS = 250; // sotto questa durata è un tocco
const DOUBLE_TAP_MS = 350; // un secondo tocco entro questo tempo è un doppio tocco
const key = { down: false, cancelled: false, double: false, lastTapUpAt: 0, suppressAsk: false };

function startKeyHook() {
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const code = UiohookKey[POINT_KEY];
    if (code === undefined) throw new Error(`tasto sconosciuto: ${POINT_KEY}`);
    uIOhook.on('keydown', (e) => {
      if (e.keycode !== code) {
        // un altro tasto mentre è premuto (es. ⌥+è): stavi scrivendo, non chiamando Remi
        if (key.down && !key.cancelled) {
          key.cancelled = true;
          cancelPoint();
        }
        return;
      }
      if (key.down) return; // ripetizione automatica
      key.down = true;
      key.cancelled = false;
      if (Date.now() - key.lastTapUpAt < DOUBLE_TAP_MS) {
        key.double = true;
        key.suppressAsk = true; // il primo tocco non apre la casella
        return;
      }
      void startPoint(true);
    });
    uIOhook.on('keyup', (e) => {
      if (e.keycode !== code) return;
      key.down = false;
      if (key.double) {
        key.double = false;
        toggleCompanion();
        return;
      }
      if (key.cancelled) return;
      const held = tracing ? Date.now() - tracing.pressedAt : 0;
      if (held < TAP_MS) key.lastTapUpAt = Date.now();
      void endTrace();
    });
    uIOhook.start();
    hook = uIOhook;
    pointDebug(`hook tastiera attivo (tasto ${POINT_KEY})`);
    return true;
  } catch (err) {
    console.warn('[point] hook tastiera non disponibile: uso la combinazione', POINT_HOTKEY, err?.message || err);
    return false;
  }
}

/** Annulla il gesto in corso (es. il tasto era parte di una combinazione). */
function cancelPoint() {
  const t = tracing;
  if (!t) return;
  t.done = true;
  clearInterval(t.timer);
  clearTimeout(t.maxTimer);
  tracing = undefined;
  if (t.recording) {
    sendPointer('pointer-rec-stop'); // la registrazione viene scartata
    void restoreVolume();
  }
  hidePointer();
}

/** `hold`: avviato dal tasto tenuto premuto (si conclude al rilascio); altrimenti è un tocco. */
async function startPoint(hold = false) {
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
  const t = { display, points: [cur], done: false, pressedAt: Date.now() };
  releasedAt = 0;
  tracing = t;
  // mouse sopra una lavagna di Remi: la domanda è su quella, che resta nello screenshot
  t.board = await boardUnderCursor(cur);
  if (t.board) {
    if (pointTurn) pointMuted = true; // il resto del turno precedente non si disegna più
    await new Promise((r) => setTimeout(r, 80)); // un fotogramma senza segni né scheda
  } else if (pointerWin?.isVisible()) {
    // i disegni precedenti non devono finire nello screenshot
    hidePointer();
    await new Promise((r) => setTimeout(r, 80));
  }
  t.grab = grabDisplay(display);
  // se resterai fermo, conta la finestra sotto il mouse: chiedila subito, in parallelo
  if (hold && !t.board) t.window = windowUnderCursor(cur);
  pointDebug('tasto', hold ? 'tieni premuto per indicare e parlare' : 'tocco: modalità punto');
  if (!hold) {
    await endTrace();
    return;
  }
  // voce: registra finché la hotkey resta premuta (serve il rilascio, quindi l'hook)
  if (voiceEnabled() && (await askMicrophone()) && !t.done) {
    t.recording = true;
    sendPointer('pointer-rec-start');
    void duckVolume();
    void postJson('/voice/warm').catch(() => {});
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
      t.shown = true;
      sendTrace(t);
    })
    .catch(() => {});
}

/**
 * La lavagna di Remi sotto il mouse, se c'è: { box, title, steps, rect }. `box` è nello spazio
 * della finestra-lavagna, `rect` in coordinate globali. La lavagna si ferma (muta, finita di
 * disegnare, senza segni sullo schermo) per finire così nello screenshot.
 */
async function boardUnderCursor(cur) {
  if (!pointerWin?.isVisible()) return null;
  const wc = pointerWin.webContents;
  const timeout = new Promise((r) => setTimeout(() => r(null), 150));
  const info = await Promise.race([wc.executeJavaScript('boardInfo()'), timeout]).catch(() => null);
  if (!info) return null;
  const wb = pointerWin.getBounds();
  const x = cur.x - wb.x;
  const y = cur.y - wb.y;
  const m = 16; // si può partire anche appena fuori dal bordo
  const { box } = info;
  if (x < box.x - m || x > box.x + box.w + m || y < box.y - m || y > box.y + box.h + m) return null;
  pointerWin.setIgnoreMouseEvents(true, { forward: true });
  await Promise.race([wc.executeJavaScript('holdBoard()'), timeout]).catch(() => {});
  pointDebug(`domanda sulla lavagna «${info.title}»`);
  return { ...info, rect: { x: box.x + wb.x, y: box.y + wb.y, w: box.w, h: box.h } };
}

/** Invia la posizione attuale del mouse: la lavagna ne fa alone e scia. */
function sendTrace(t) {
  // prima della cattura niente scia (con una lavagna aperta la finestra è già visibile)
  if (!t.shown || !pointerWin?.isVisible()) return;
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

/* --- tieni premuto senza muovere il mouse = indica tutta la finestra sotto il puntatore --- */
// macOS: elenco delle finestre di CoreGraphics (dalla più in alto), via JXA. Escluse le
// finestre di Remi (stesso pid), quelle di sistema (layer ≠ 0) e quelle trasparenti.
const MAC_WINDOW_JXA = `ObjC.import('CoreGraphics');
function run(argv) {
  const px = Number(argv[0]), py = Number(argv[1]), self = Number(argv[2]);
  const list = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID));
  for (let i = 0; i < list.count; i++) {
    const w = list.objectAtIndex(i);
    if (ObjC.unwrap(w.objectForKey('kCGWindowLayer')) !== 0) continue;
    if (ObjC.unwrap(w.objectForKey('kCGWindowOwnerPID')) === self) continue;
    const alpha = ObjC.unwrap(w.objectForKey('kCGWindowAlpha'));
    if (alpha !== undefined && alpha < 0.1) continue;
    const b = ObjC.deepUnwrap(w.objectForKey('kCGWindowBounds'));
    if (!b || b.Width < 80 || b.Height < 50) continue;
    if (px >= b.X && px <= b.X + b.Width && py >= b.Y && py <= b.Y + b.Height) {
      return JSON.stringify({ x: b.X, y: b.Y, w: b.Width, h: b.Height,
        app: ObjC.unwrap(w.objectForKey('kCGWindowOwnerName')) || '', title: ObjC.unwrap(w.objectForKey('kCGWindowName')) || '' });
    }
  }
  return '';
}`;
// Windows: finestra principale sotto il punto (WindowFromPoint → antenato radice).
const WIN_WINDOW_PS = `Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Ri, B; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(P p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
$p = New-Object W+P; $p.X = [int]$args[0]; $p.Y = [int]$args[1]
$h = [W]::GetAncestor([W]::WindowFromPoint($p), 2)
$pid2 = 0; [void][W]::GetWindowThreadProcessId($h, [ref]$pid2)
if ($pid2 -eq [int]$args[2]) { exit }
$r = New-Object W+R; [void][W]::GetWindowRect($h, [ref]$r)
$t = New-Object System.Text.StringBuilder 256; [void][W]::GetWindowText($h, $t, 256)
$app = (Get-Process -Id $pid2 -ErrorAction SilentlyContinue).ProcessName
@{ x = $r.L; y = $r.T; w = $r.Ri - $r.L; h = $r.B - $r.T; app = $app; title = $t.ToString() } | ConvertTo-Json -Compress`;

/** La finestra (di un'altra app) sotto il punto, in coordinate dello schermo, o null. */
function windowUnderCursor(pt) {
  return new Promise((resolve) => {
    const done = (err, stdout) => {
      try {
        const w = !err && stdout.trim() ? JSON.parse(stdout.trim()) : null;
        resolve(w && w.w > 0 && w.h > 0 ? w : null);
      } catch {
        resolve(null);
      }
    };
    const opts = { timeout: 1500 };
    if (process.platform === 'darwin') {
      execFile('osascript', ['-l', 'JavaScript', '-e', MAC_WINDOW_JXA, String(pt.x), String(pt.y), String(process.pid)], opts, done);
    } else if (process.platform === 'win32') {
      // WindowFromPoint lavora in pixel fisici: converti da/verso le coordinate di Electron
      const phys = screen.dipToScreenPoint(pt);
      // -Command non passa gli argomenti finali come $args: invoca un blocco con gli argomenti
      const cmd = `& {${WIN_WINDOW_PS}} ${Math.round(phys.x)} ${Math.round(phys.y)} ${process.pid}`;
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], opts, done);
    } else {
      // Linux (X11): xdotool, se installato
      execFile('sh', ['-c', 'eval $(xdotool getmouselocation --shell) && xdotool getwindowgeometry --shell $WINDOW && echo TITLE=$(xdotool getwindowname $WINDOW)'], opts, (err, out) => {
        if (err) return resolve(null);
        const v = Object.fromEntries(out.trim().split('\n').map((l) => l.split(/=(.*)/s)));
        resolve(v.WIDTH ? { x: +v.X, y: +v.Y, w: +v.WIDTH, h: +v.HEIGHT, app: '', title: v.TITLE || '' } : null);
      });
    }
  }).then((w) => {
    if (!w || process.platform !== 'win32') return w;
    const r = screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.w, height: w.h });
    return { ...w, x: r.x, y: r.y, w: r.width, h: r.height };
  });
}

/** Rettangolo {x, y, w, h} come percorso chiuso (4 angoli). */
function rectPath(r) {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/** Rettangolo della finestra, ritagliato sul monitor, come percorso chiuso (4 angoli). */
function windowArea(win, display) {
  const b = display.bounds;
  const x0 = Math.max(b.x, win.x);
  const y0 = Math.max(b.y, win.y);
  const x1 = Math.min(b.x + b.width, win.x + win.w);
  const y1 = Math.min(b.y + b.height, win.y + win.h);
  if (x1 - x0 < 40 || y1 - y0 < 40) return null;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/**
 * Mouse rimasto fermo (nessuna zona tracciata): vale tutta la finestra sotto il
 * puntatore, se si trova. Stessa regola per il tasto e per "Hey Remi".
 * `pick`: il risultato di resolvePath; `winPromise`: windowUnderCursor avviata prima.
 */
async function windowIfStill(pick, winPromise, display) {
  if (pick.area || !winPromise) return { ...pick, target: undefined };
  const win = await Promise.race([winPromise, new Promise((r) => setTimeout(() => r(null), 500))]);
  const rect = win && windowArea(win, display);
  if (!rect) return { ...pick, target: undefined };
  const b = display.bounds;
  const local = {
    x: pick.at.x - b.x,
    y: pick.at.y - b.y,
    area: true,
    box: { x: rect[0].x - b.x, y: rect[0].y - b.y, w: rect[2].x - rect[0].x, h: rect[2].y - rect[0].y },
  };
  pointDebug(`finestra: ${win.app} «${win.title}»`);
  sendPointer('pointer-window', local.box); // la finestra si illumina: è quella che Remi guarda
  return { at: pick.at, area: rect, local, target: { app: win.app, title: win.title } };
}

/**
 * Dal percorso del mouse: un punto (movimento minimo) o la zona attraversata.
 * `local`: posizione per la lavagna, con il rettangolo della zona (il pannello lo affianca).
 */
function resolvePath(points, display) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const isArea =
    points.length > 3 &&
    Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= TRACE_MIN_SIZE;
  pointDebug(isArea ? `area (${points.length} punti)` : 'punto');
  const at = isArea ? points[points.length - 1] : points[0];
  const area = isArea ? sweptArea(points, 20) : undefined;
  const b = display.bounds;
  const local = { x: at.x - b.x, y: at.y - b.y, area: isArea };
  if (area) {
    const ax = area.map((p) => p.x - b.x);
    const ay = area.map((p) => p.y - b.y);
    local.box = { x: Math.min(...ax), y: Math.min(...ay), w: Math.max(...ax) - Math.min(...ax), h: Math.max(...ay) - Math.min(...ay) };
  }
  return { at, area, local };
}

async function endTrace() {
  const t = tracing;
  if (!t || t.done) return;
  t.done = true;
  clearInterval(t.timer);
  clearTimeout(t.maxTimer);
  tracing = undefined;
  releasedAt = Date.now();
  if (t.recording) void restoreVolume(); // hai finito di parlare
  phase(`rilascio (tenuto ${releasedAt - t.pressedAt} ms)`);

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
  // tenuto premuto senza muovere il mouse: indica tutta la finestra sotto il puntatore
  // (un tocco breve resta un punto: apre la casella)
  const held = releasedAt - t.pressedAt >= TAP_MS;
  let pick = await windowIfStill(resolvePath(points, display), held ? t.window : null, display);
  // sulla lavagna, tenuto fermo = tutta la lavagna
  if (t.board && held && !pick.area) pick = { ...pick, area: rectPath(t.board.rect) };
  const { at, area, local, target } = pick;
  phase('screenshot pronto');
  const capture = buildPointPayload(full, display, at, area);
  if (target) capture.target = target;
  if (t.board) {
    const { title, steps, rect, box } = t.board;
    capture.board = { title, steps, rect };
    // la vecchia lavagna si chiude: la nuova parte dal suo posto (vedi placePanel)
    local.area = Boolean(area);
    local.box = undefined;
    local.panelAt = { x: box.x, y: box.y };
  }
  phase('immagini preparate (ridimensiona + ingrandimento)');

  // ha parlato? allora niente casella: trascrivi e invia
  const rec = t.recording ? await stopRecording() : null;
  if (rec) phase(`audio ricevuto (${rec.durationMs} ms, ${rec.wav ? Math.round(rec.wav.byteLength / 1024) : 0} kB)`);
  pointDebug('voce', rec ? `${rec.durationMs} ms, parlato: ${rec.speech}` : 'nessuna registrazione');
  if (rec?.speech && rec.wav) {
    sendPointer('pointer-ack'); // "ti ho sentito": subito, prima di trascrivere
    await ensurePointerWin(display);
    pointerWin.setIgnoreMouseEvents(true, { forward: true });
    pointerWin.showInactive();
    sendPointer('pointer-anchor', local);
    if (await submitVoice(capture, rec.wav)) return;
  }

  // un tocco breve potrebbe essere il primo di un doppio tocco: aspetta prima di aprire la casella
  const sinceTap = Date.now() - key.lastTapUpAt;
  if (sinceTap < DOUBLE_TAP_MS) await new Promise((r) => setTimeout(r, DOUBLE_TAP_MS - sinceTap));
  if (key.suppressAsk) {
    key.suppressAsk = false;
    hidePointer();
    return;
  }
  pendingPoint = capture;
  await ensurePointerWin(display);
  pointerWin.setIgnoreMouseEvents(false);
  pointerWin.show();
  pointerWin.focus();
  if (process.platform === 'darwin') app.focus({ steal: true });
  sendPointer('pointer-ask', local);
}

ipcMain.on('pointer-submit', (_e, text) => {
  const capture = pendingPoint;
  pendingPoint = undefined;
  releaseFocus();
  if (!capture) return;
  clearTimeout(lingerTimer);
  sendPointer('pointer-thinking');
  void submitPoint(capture, text, false);
});

/** Invia il turno "indica" al daemon. `voiceTurn`: domanda a voce → risposta anche a voce. */
async function submitPoint(capture, text, voiceTurn) {
  pointMuted = false;
  pointBoard = capture.board?.rect;
  setPointTurn(true);
  pointVoiceTurn = voiceTurn;
  try {
    const res = await fetch(`${DAEMON_URL}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'point_message', content: text, ...capture }),
    });
    if (!res.ok) throw new Error(`daemon ${res.status}`);
    phase('turno inviato al daemon');
  } catch (err) {
    console.error('[point] invio fallito', err);
    setPointTurn(false);
    sendPointer('pointer-answer', 'Non riesco a raggiungere Remi in questo momento.');
    lingerTimer = setTimeout(hidePointer, 6000);
  }
}

/* --- voce: si registra mentre la hotkey è premuta, si trascrive al rilascio --- */
let pointVoiceTurn = false;
let speakChain = Promise.resolve();
let recWaiter;

function voiceEnabled() {
  return Boolean(readConfig().voice?.enabled);
}

/** macOS: chiede il permesso del microfono la prima volta. */
async function askMicrophone() {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status === 'not-determined') return systemPreferences.askForMediaAccess('microphone');
  return false;
}

/*
 * Mentre Remi ascolta la domanda il volume del Mac scende, così il microfono non
 * capta video o live in sottofondo. Il volume di prima resta salvato su file finché
 * non è ripristinato: se Remi si chiude male, lo rimette al prossimo avvio.
 */
const DUCK_RATIO = 0.15;
const DUCK_MAX_MS = 20000;
const duckFile = path.join(userData, 'volume-before-listen.json');
let duck; // { before, ducked, timer }

function osa(script) {
  return new Promise((resolve, reject) =>
    execFile('osascript', ['-e', script], { timeout: 1500, encoding: 'utf8' }, (err, out) =>
      err ? reject(err) : resolve(out.trim()),
    ),
  );
}

async function duckVolume() {
  if (process.platform !== 'darwin' || duck) return;
  const me = {}; // segnaposto finché osascript risponde: restoreVolume lo toglie se l'ascolto finisce prima
  duck = me;
  try {
    const before = Number(await osa('output volume of (get volume settings)'));
    // già muto o uscita senza volume; oppure l'ascolto è già finito
    if (!Number.isFinite(before) || before <= 0 || duck !== me) {
      if (duck === me) duck = undefined;
      return;
    }
    const ducked = Math.round(before * DUCK_RATIO);
    fs.writeFileSync(duckFile, JSON.stringify({ before, ducked }));
    await osa(`set volume output volume ${ducked}`);
    if (duck !== me) return void restoreVolume({ before, ducked }); // finito nel frattempo
    duck = { before, ducked, timer: setTimeout(() => void restoreVolume(), DUCK_MAX_MS) };
    pointDebug(`volume ${before} → ${ducked} mentre ascolto`);
  } catch (err) {
    if (duck === me) duck = undefined;
    pointDebug('volume non abbassato:', err.message);
  }
}

/** Rimette il volume di prima, a meno che nel frattempo l'utente non l'abbia cambiato a mano. */
async function restoreVolume(saved = duck) {
  if (saved === duck) {
    if (duck?.timer) clearTimeout(duck.timer);
    duck = undefined;
  }
  if (!saved?.before) return;
  try {
    if (Number(await osa('output volume of (get volume settings)')) === saved.ducked) {
      await osa(`set volume output volume ${saved.before}`);
      pointDebug(`volume ripristinato a ${saved.before}`);
    }
  } catch (err) {
    pointDebug('volume non ripristinato:', err.message);
  }
  fs.rmSync(duckFile, { force: true });
}

/** In uscita non si può attendere: ripristino sincrono (il file resta se fallisce). */
function restoreVolumeNow() {
  const saved = duck;
  duck = undefined;
  if (!saved?.before) return;
  try {
    execFileSync('osascript', ['-e', `set volume output volume ${saved.before}`], { timeout: 1500 });
    fs.rmSync(duckFile, { force: true });
  } catch {
    /* ci riprova il prossimo avvio */
  }
}

/** All'avvio: se l'ultima volta Remi si è chiuso mentre ascoltava, il volume è ancora basso. */
function restoreVolumeLeftLow() {
  if (process.platform !== 'darwin' || !fs.existsSync(duckFile)) return;
  try {
    void restoreVolume(JSON.parse(fs.readFileSync(duckFile, 'utf8')));
  } catch {
    fs.rmSync(duckFile, { force: true });
  }
}

async function postJson(pathname, body) {
  const res = await fetch(`${DAEMON_URL}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return res.json().catch(() => ({ ok: false }));
}

/** Ferma la registrazione e attende l'audio dalla lavagna ({ wav, speech } o null). */
function stopRecording() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      recWaiter = undefined;
      resolve(null);
    }, 1500);
    recWaiter = (data) => {
      clearTimeout(timer);
      recWaiter = undefined;
      resolve(data);
    };
    sendPointer('pointer-rec-stop');
  });
}
ipcMain.on('pointer-rec-data', (_e, data) => recWaiter?.(data));
ipcMain.on('pointer-speaking', () => phase('voce: inizia a parlare'));

/** Domanda a voce: trascrive e invia, senza casella di testo. Torna false se non c'è parlato utile. */
async function submitVoice(capture, wav) {
  sendPointer('pointer-thinking');
  let out;
  try {
    out = await postJson('/voice/transcribe', { audio: Buffer.from(wav).toString('base64') });
  } catch {
    out = { ok: false, error: 'Remi non è raggiungibile' };
  }
  const text = out.ok ? String(out.text || '').trim() : '';
  phase(`trascrizione (${out.engine || '?'}): "${text}"`);
  if (!text) {
    if (!out.ok) console.warn('[voice] trascrizione fallita:', out.error);
    sendPointer('pointer-status', out.ok ? 'non ho capito, scrivi pure' : `voce non disponibile: ${out.error}`);
    return false;
  }
  // la trascrizione resta nel log (phase sopra), non sullo schermo
  void submitPoint(capture, text, true);
  return true;
}

/* --- "Hey Remi": la lavagna manda i pezzi di parlato, il daemon (whisper locale) decide --- */
let wakeBusy = false;
let listenWaiter;
// mentre "Hey Remi" è attivo: le posizioni recenti del mouse, per sapere cosa indicavi
// MENTRE parlavi (la frase viene riconosciuta solo dopo che l'hai finita)
const MOUSE_HISTORY_MS = 12000;
const mouseHistory = [];
let mouseTimer;

function startMouseHistory() {
  if (mouseTimer) return;
  mouseTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const last = mouseHistory[mouseHistory.length - 1];
    const now = Date.now();
    if (!last || Math.abs(p.x - last.x) + Math.abs(p.y - last.y) >= 2) mouseHistory.push({ x: p.x, y: p.y, t: now });
    while (mouseHistory.length && now - mouseHistory[0].t > MOUSE_HISTORY_MS) mouseHistory.shift();
  }, TRACE_TICK_MS * 2);
}

/** Percorso del mouse tra `from` e `to` (ms epoch), almeno la posizione attuale. */
function mousePath(from, to) {
  const path = mouseHistory.filter((p) => p.t >= from && p.t <= to).map(({ x, y }) => ({ x, y }));
  // la posizione all'inizio della finestra (il mouse fermo non produce campioni)
  const before = [...mouseHistory].reverse().find((p) => p.t < from);
  if (before) path.unshift({ x: before.x, y: before.y });
  return path.length ? path : [screen.getCursorScreenPoint()];
}

/** Attiva l'ascolto se la voce e "Hey Remi" sono abilitati e whisper locale è pronto. */
async function setupWakeWord() {
  const voice = readConfig().voice || {};
  if (!voice.enabled || !voice.wakeWord) return;
  // il daemon decide se è davvero disponibile (serve whisper locale: niente audio in rete)
  for (let i = 0; i < 20; i++) {
    try {
      const status = await (await fetch(`${DAEMON_URL}/status`)).json();
      if (status.voice?.wakeWord) {
        if (!(await askMicrophone())) return;
        await (pointerReady || ensurePointerWin(screen.getPrimaryDisplay()));
        sendPointer('pointer-wake', { enabled: true });
        startMouseHistory();
        pointDebug('"Hey Remi" in ascolto');
        return;
      }
      if (status.voice && status.voice.downloading === undefined && i > 2) return;
    } catch {
      /* daemon non ancora pronto */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

ipcMain.on('pointer-wake-segment', async (_e, wav) => {
  // il pezzo è appena finito: la sua durata dice da quando stavi parlando
  const segEnd = Date.now();
  const segStart = segEnd - ((wav.byteLength - 44) / (SAMPLE_RATE_BYTES)) * 1000;
  if (wakeBusy || pointTurn || tracing || pendingPoint) {
    sendPointer('pointer-wake-done');
    return;
  }
  wakeBusy = true;
  try {
    const out = await postJson('/voice/wake', { audio: Buffer.from(wav).toString('base64') });
    pointDebug(`ascoltato: "${out.text ?? out.error}"${out.wake ? ' → Hey Remi!' : ''}`);
    if (out.ok && out.wake) {
      const question = String(out.question || '').trim();
      // detta di fila con "Hey Remi": la domanda si ritrascrive col modello cloud (whisper locale
      // sbaglia i nomi), in parallelo allo screenshot
      const refined = question
        ? postJson('/voice/transcribe', { audio: Buffer.from(wav).toString('base64'), wake: true }).catch(() => ({}))
        : undefined;
      await onWake(question, mousePath(segStart, segEnd), refined);
    }
    else sendPointer('pointer-wake-done');
  } catch {
    sendPointer('pointer-wake-done');
  } finally {
    wakeBusy = false;
  }
});
ipcMain.on('pointer-listen-data', (_e, data) => listenWaiter?.(data));

/**
 * "Hey Remi": Remi compare e risponde su ciò che indichi col mouse. `spokenPath`:
 * il percorso del mouse mentre dicevi la frase (conta se la domanda era già lì).
 */
async function onWake(question, spokenPath, refined) {
  releasedAt = Date.now();
  phase(`"Hey Remi"${question ? ` + "${question}"` : ''}`);
  const cur = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cur);
  showCompanionFor(30000);
  sendPointer('pointer-ack');
  if (pointerWin?.isVisible()) {
    hidePointer(); // i disegni precedenti non devono finire nello screenshot
    await new Promise((r) => setTimeout(r, 80));
  }
  // se il mouse resterà fermo conta la finestra sotto il puntatore (come col tasto): chiedila subito
  const winPromise = windowUnderCursor(cur);
  // lo screenshot prima di mostrare alone e scia (non devono finirci dentro)
  const grab = grabDisplay(display);
  grab.catch(() => {});
  let full;
  try {
    full = await grab;
  } catch (err) {
    console.error('[point] cattura fallita', err);
    sendPointer('pointer-wake-done');
    return;
  }
  await ensurePointerWin(display);
  pointerWin.setIgnoreMouseEvents(true, { forward: true });
  pointerWin.showInactive();
  if (question) {
    // "Hey Remi, cos'è questo?" detto di fila: vale ciò che indicavi mentre lo dicevi
    const { at, area, local, target } = await windowIfStill(resolvePath(spokenPath, display), winPromise, display);
    const better = await refined;
    if (better?.ok && better.text) {
      phase(`trascrizione (${better.engine}): "${better.text}"`);
      question = better.text;
    }
    sendPointer('pointer-anchor', local);
    sendPointer('pointer-wake-done');
    sendPointer('pointer-thinking');
    const capture = buildPointPayload(full, display, at, area);
    if (target) capture.target = target;
    void submitPoint(capture, question, true);
    return;
  }
  // solo "Hey Remi": mentre ascolti la domanda, segui il mouse come col tasto premuto
  const b = display.bounds;
  const path = [cur];
  // niente anello fisso sul punto iniziale: l'alone segue il mouse
  sendPointer('pointer-anchor', { x: cur.x - b.x, y: cur.y - b.y, area: true });
  sendPointer('pointer-listen', { x: cur.x - b.x, y: cur.y - b.y });
  void duckVolume();
  const follow = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const last = path[path.length - 1];
    if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 2) return;
    path.push(p);
    sendPointer('pointer-trace', { x: p.x - b.x, y: p.y - b.y });
  }, TRACE_TICK_MS);
  const rec = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 17000);
    listenWaiter = (data) => {
      clearTimeout(timer);
      listenWaiter = undefined;
      resolve(data);
    };
  });
  clearInterval(follow);
  void restoreVolume();
  phase(rec?.speech ? 'domanda ascoltata' : 'nessuna domanda');
  if (rec?.speech && rec.wav) {
    const { at, area, local, target } = await windowIfStill(resolvePath(path, display), winPromise, display);
    sendPointer('pointer-anchor', local);
    const capture = buildPointPayload(full, display, at, area);
    if (target) capture.target = target;
    if (await submitVoice(capture, rec.wav)) return;
  }
  lingerTimer = setTimeout(hidePointer, 4000);
}

/** Divide la risposta in frasi (unendo quelle troppo corte): la prima si sente prima. */
function splitSentences(text) {
  const parts = text.match(/[^.!?…]+[.!?…]+[»")\]]*\s*|[^.!?…]+$/g) || [text];
  const out = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (out.length && out[out.length - 1].length < 30) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

/**
 * Legge una risposta: audio dal daemon (voce cloud) o voce di sistema nella lavagna.
 * Le frasi si sintetizzano in parallelo e si riproducono in ordine, così la prima
 * parte appena è pronta invece di aspettare l'audio dell'intera risposta.
 */
function speakAnswer(text) {
  speakParts(splitSentences(text).map((t) => ({ text: t })));
}

/**
 * Legge le parti in ordine (sintesi in parallelo). `step`: passo del pannello da
 * rivelare quando quella parte inizia a suonare; se la voce manca, il passo
 * viene rivelato subito, così il pannello non resta a metà.
 */
function speakParts(parts) {
  phase(`voce: richiesta audio (${parts.length} parti)`);
  const pending = parts.map((p) => postJson('/voice/speak', { text: p.text }).catch(() => ({ ok: false })));
  speakChain = speakChain.then(async () => {
    for (const [i, req] of pending.entries()) {
      const { text, step } = parts[i];
      const out = await req;
      if (i === 0) phase(out.audio ? 'voce: audio della prima parte pronto' : 'voce: nessun audio cloud');
      if (pointMuted) return;
      if (out.ok && out.audio) sendPointer('pointer-speak', { audio: out.audio, mediaType: out.mediaType, step });
      else if (out.ok && out.tts === 'system') {
        sendPointer('pointer-speak', { text, lang: readConfig().voice?.language || 'it', step });
      } else if (step !== undefined) sendPointer('pointer-step', step);
    }
  });
}

/* --- pannello di spiegazione in streaming: ogni passo arriva mentre il modello scrive --- */
let panelVoiced = false;
/** Con OPENMATE_UI_DEBUG il pannello ricevuto si salva com'è, per riprodurlo nel banco di prova. */
let panelDump;

function dumpPanel() {
  if (!panelDump) return;
  const dir = path.join(userData, 'debug', 'panels');
  const file = path.join(dir, `panel-${panelDump.at}.json`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(panelDump, null, 1));
    pointDebug(`pannello salvato: ${file}`);
  } catch (err) {
    pointDebug('pannello non salvato:', err.message);
  }
  panelDump = undefined;
}

function handlePanel(e) {
  if (process.env.OPENMATE_UI_DEBUG) {
    if (e.op === 'start') panelDump = { at: Date.now(), title: e.title, rows: e.rows, cols: e.cols, ownColors: e.ownColors, steps: [] };
    else if (e.op === 'step' && panelDump) panelDump.steps.push({ say: e.say, svg: e.svg, marks: e.marks });
    else if (e.op === 'end') dumpPanel();
  }
  if (e.op === 'start') {
    // con la voce ogni passo si disegna mentre viene pronunciato; senza, a tempo di lettura
    panelVoiced = pointVoiceTurn && readConfig().voice?.tts !== 'off';
    phase(`pannello: inizio "${e.title}"`);
    const ready = pointerWin ? Promise.resolve() : ensurePointerWin(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
    void ready.then(() => {
      if (!pointerWin) return;
      if (!pointerWin.isVisible()) pointerWin.showInactive();
      sendPointer('pointer-panel-start', { title: e.title, voiced: panelVoiced, rows: e.rows, cols: e.cols, ownColors: e.ownColors });
    });
    clearTimeout(lingerTimer);
  } else if (e.op === 'say') {
    // la frase arriva prima del disegno: la voce si prepara mentre il modello scrive l'SVG
    phase(`pannello: frase ${e.index + 1}`);
    if (panelVoiced) speakParts([{ text: e.say, step: e.index }]);
  } else if (e.op === 'step') {
    phase(`pannello: passo ${e.index + 1}`);
    // zone da cerchiare sullo schermo: da coordinate globali a quelle della lavagna
    const wb = pointerWin?.getBounds();
    // un segno dove stava la lavagna chiusa indicherebbe il vuoto
    const onBoard = (m) =>
      pointBoard &&
      m.x + m.w / 2 > pointBoard.x &&
      m.x + m.w / 2 < pointBoard.x + pointBoard.w &&
      m.y + m.h / 2 > pointBoard.y &&
      m.y + m.h / 2 < pointBoard.y + pointBoard.h;
    const marks = wb && e.marks ? e.marks.filter((m) => !onBoard(m)).map((m) => ({ ...m, x: m.x - wb.x, y: m.y - wb.y })) : [];
    sendPointer('pointer-panel-step', { index: e.index, say: e.say, svg: e.svg, marks });
  } else if (e.op === 'end') {
    sendPointer('pointer-panel-end');
    if (!pointTurn) lingerTimer = setTimeout(hidePointer, POINT_LINGER_MS);
  }
}

// la scheda della risposta è cliccabile (✕): il resto della lavagna lascia passare i click
ipcMain.on('pointer-interactive', (_e, on) => {
  if (pointerWin && !pendingPoint && !remiActing) pointerWin.setIgnoreMouseEvents(!on, { forward: true });
});

/**
 * Prima di ogni clic, tasto o screenshot del computer-use: il modello 3D si chiude
 * (coprirebbe la pagina e ne intercetterebbe i clic) e la lavagna lascia passare
 * tutti i clic fino alla fine del turno. Restituisce true se ha nascosto qualcosa.
 */
function clearOverlaysForRemi() {
  remiActing = true;
  pointerWin?.setIgnoreMouseEvents(true, { forward: true });
  if (!scene3dWin?.isVisible()) return false;
  scene3dWin.setIgnoreMouseEvents(true, { forward: true });
  scene3dWin.hide();
  return true;
}

/** Una risposta che la lavagna non può mostrare arriva comunque: dal fumetto di Remi. */
function companionSays(text) {
  showCompanionFor(Math.min(30000, 6000 + text.length * 40));
  win?.webContents.send('point-error', text);
}

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
  if (!on) pointVoiceTurn = false; // le risposte già in coda vengono comunque lette
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
  if (e.kind === 'state' && e.state?.status === 'idle') {
    pointMuted = false;
    remiActing = false;
  }
  if (pointTurn) {
    if (e.kind === 'state') phase(`daemon: stato ${e.state?.status}`);
    else if (e.kind === 'overlay') phase(`daemon: disegno (${e.items?.length ?? 0} elementi)`);
    else if (e.kind === 'message') phase('daemon: testo della risposta');
  }
  if (pointMuted) {
    // lavagna chiusa a metà turno: il resto non si disegna, ma la risposta finale arriva lo stesso
    if (e.kind === 'message' && !e.channel) companionSays(e.content);
    return;
  }
  if (e.kind === 'scene3d') {
    handleScene3d(e);
    return;
  }
  if (e.kind === 'panel') {
    handlePanel(e);
    return;
  }
  if (e.kind === 'overlay') {
    if (e.op === 'clear') sendPointer('pointer-clear');
    else showOverlay(e.items || [], Boolean(e.clear));
    return;
  }
  // un permesso va sempre mostrato, anche durante un turno "indica": altrimenti resta
  // invisibile e dopo 2 minuti viene negato da solo
  if (e.kind === 'approval_request') showCompanionFor(0);
  // fuori dai turni "indica" Remi si fa vedere anche per parlarti
  if (!pointTurn && e.kind === 'message' && !e.channel) showCompanionFor(Math.min(30000, 6000 + e.content.length * 40));
  if (!pointTurn) return;
  if (e.kind === 'message') {
    if (e.channel === 'panel') return; // già nel pannello, che la legge passo per passo
    // a voce la risposta si ascolta e basta: niente testo sullo schermo (resta nel log)
    if (pointVoiceTurn && readConfig().voice?.tts !== 'off') {
      pointDebug(`risposta: "${e.content}"`);
      sendPointer('pointer-status', '');
      speakAnswer(e.content);
      return;
    }
    // la lavagna può essere stata nascosta nel frattempo (es. un "Hey Remi" sentito per sbaglio)
    if (pointerWin?.isVisible()) sendPointer('pointer-answer', e.content);
    else companionSays(e.content);
  } else if (e.kind === 'action' && typeof e.summary === 'string' && !e.summary.startsWith('overlay.')) {
    pointDebug(`azione: ${e.summary}`); // solo nel log: sullo schermo non si elencano le azioni
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

/* --- Remi nascosto: compare quando lo chiami o quando deve parlarti --- */
let companionPinned = false; // mostrato dall'utente (resta finché non lo nasconde)
let companionAutoTimer;

function toggleCompanion() {
  if (!win) return;
  pointDebug(`Remi ${win.isVisible() && companionPinned ? 'nascosto' : 'mostrato'}`);
  clearTimeout(companionAutoTimer);
  if (win.isVisible() && companionPinned) {
    companionPinned = false;
    win.hide();
  } else {
    companionPinned = true;
    win.showInactive();
  }
}

/** Mostra Remi per un messaggio o un permesso; se non era stato chiamato, si rinasconde dopo. */
function showCompanionFor(ms) {
  if (!win) return;
  if (!win.isVisible()) win.showInactive();
  clearTimeout(companionAutoTimer);
  if (!companionPinned && ms) companionAutoTimer = setTimeout(() => !companionPinned && win?.hide(), ms);
}

function summon() {
  if (!win) return;
  companionPinned = true;
  clearTimeout(companionAutoTimer);
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
  restoreVolumeLeftLow();
  globalShortcut.register(HOTKEY, summon);
  if (!startKeyHook() && !globalShortcut.register(POINT_HOTKEY, () => void startPoint())) {
    console.warn(`[point] hotkey ${POINT_HOTKEY} non disponibile (usata da un'altra app?)`);
  }
  void subscribeDaemon();
  void setupWakeWord();
  // lavagna pronta (nascosta): il microfono deve poter partire alla prima pressione
  if (EXTERNAL || isOnboarded()) void ensurePointerWin(screen.getPrimaryDisplay());
  if (EXTERNAL || isOnboarded()) {
    startDaemon();
    createCompanion();
  } else {
    openOnboarding();
  }
});
app.on('will-quit', () => {
  restoreVolumeNow();
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
  // clic sull'icona nel Dock: Remi si fa vedere
  if (win && !win.isVisible()) toggleCompanion();
});
app.on('window-all-closed', () => app.quit());

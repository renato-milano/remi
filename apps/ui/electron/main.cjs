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
const { spawn } = require('node:child_process');

const WIDTH = 500; // largo: robot su un lato, fumetto sull'altro (verso il centro)
const HEIGHT = 540;
const ROBOT_W = 200;
const ROBOT_MARGIN = 10;
let currentSide = 'right';
const HOTKEY = process.env.OPENMATE_HOTKEY || 'CommandOrControl+Shift+O';
const PORT = Number(process.env.OPENMATE_PORT || 8787);
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
const daemonEntry = path.join(__dirname, '..', '..', '..', 'packages', 'daemon', 'dist', 'index.js');

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
  config.autonomy = config.autonomy || { shell: { allow: [], deny: [] }, files: { allow: [] } };
  config.autonomy.autoApprove = ['none', 'read', 'write'].includes(data.autoApprove)
    ? data.autoApprove
    : config.autonomy.autoApprove || 'read';
  const minutes = Number(data.heartbeatMinutes) || 15;
  config.heartbeat = config.heartbeat || { cron: [] };
  config.heartbeat.intervalMs = minutes * 60000;
  config.computerUse = { enabled: Boolean(data.computerUse) };
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
  writePersona(data.name || 'OpenMate', data.tone || 'curioso');
}

/* ---------------- lifecycle del daemon ---------------- */
function startDaemon() {
  if (EXTERNAL || daemonProc) return;
  const node = process.env.OPENMATE_NODE || 'node';
  daemonProc = spawn(node, [daemonEntry], {
    env: {
      ...process.env,
      OPENMATE_CONFIG: configFile,
      OPENMATE_API_KEY: loadKey(),
      OPENMATE_PORT: String(PORT),
    },
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
    title: 'OpenMate',
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
function openSettings() {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 520,
    height: 660,
    resizable: false,
    title: 'OpenMate — Impostazioni',
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
  if (EXTERNAL || isOnboarded()) {
    startDaemon();
    createCompanion();
  } else {
    openOnboarding();
  }
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopDaemon();
});
// chiusura pulita (spegne anche il daemon) anche via segnale
process.on('SIGTERM', () => app.quit());
process.on('SIGINT', () => app.quit());
app.on('activate', () => {
  if (!win && !onbWin && (EXTERNAL || isOnboarded())) createCompanion();
});
app.on('window-all-closed', () => app.quit());

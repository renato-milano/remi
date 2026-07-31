const { app, BrowserWindow, ipcMain, screen, globalShortcut, Menu } = require('electron');
const path = require('node:path');

const WIDTH = 300;
const HEIGHT = 540; // spazio sopra il robot per fumetti/card (finestra trasparente)
const DAEMON_URL = process.env.OPENMATE_URL || 'http://127.0.0.1:8787';
const HOTKEY = process.env.OPENMATE_HOTKEY || 'CommandOrControl+Shift+O';
let win;
let paused = false;

function createWindow() {
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
      // sandbox off: il preload usa node:fs/path per rilevare l'asset Rive
      sandbox: false,
    },
  });

  // Overlay sopra tutto, su tutti i desktop virtuali.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Click-through di default: i click passano al desktop sotto.
  // forward:true continua a inviare i mousemove al renderer per l'hit-test.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.env.OPENMATE_UI_DEBUG) {
    win.webContents.on('console-message', (_e, _lvl, message, line, source) => {
      console.log(`[renderer] ${message} (${source}:${line})`);
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`[did-fail-load] ${code} ${desc} ${url}`);
    });
    win.webContents.on('preload-error', (_e, p, err) => {
      console.error(`[preload-error] ${p}: ${err}`);
    });
    win.webContents.on('render-process-gone', (_e, d) => console.error('[render-gone]', d));
    win.webContents.once('did-finish-load', () => console.log('[main] renderer caricato'));
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

// Il renderer attiva/disattiva l'interattività quando il mouse è sul personaggio.
ipcMain.on('set-interactive', (_event, interactive) => {
  if (!win) return;
  win.setIgnoreMouseEvents(!interactive, { forward: true });
});

// Drag & drop della finestra: segue il cursore reale (robusto col click-through).
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
});

ipcMain.on('quit', () => app.quit());

// Hotkey globale: richiama il robot e mette il focus sull'input.
function summon() {
  if (!win) return;
  win.show();
  win.focus();
  win.setIgnoreMouseEvents(false);
  win.webContents.send('summon');
}

// POST di un comando al daemon (pause/resume/interrupt).
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

// Menu contestuale (tasto destro sul robot).
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
    { type: 'separator' },
    { label: 'Esci', role: 'quit' },
  ]);
  menu.popup({ window: win });
}
ipcMain.on('context-menu', showContextMenu);

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register(HOTKEY, summon);
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => app.quit());

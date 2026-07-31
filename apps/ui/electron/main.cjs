const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');

const WIDTH = 300;
const HEIGHT = 360;
let win;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: workArea.x + workArea.width - WIDTH - 24,
    y: workArea.y + workArea.height - HEIGHT - 24,
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
    },
  });

  // Overlay sopra tutto, su tutti i desktop virtuali.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Click-through di default: i click passano al desktop sotto.
  // forward:true continua a inviare i mousemove al renderer per l'hit-test.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// Il renderer attiva/disattiva l'interattività quando il mouse è sul personaggio.
ipcMain.on('set-interactive', (_event, interactive) => {
  if (!win) return;
  win.setIgnoreMouseEvents(!interactive, { forward: true });
});

ipcMain.on('quit', () => app.quit());

app.whenReady().then(createWindow);
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => app.quit());

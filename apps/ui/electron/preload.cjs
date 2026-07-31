const { contextBridge, ipcRenderer } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const rivePath = path.join(__dirname, '..', 'assets', 'character.riv');

contextBridge.exposeInMainWorld('overlay', {
  daemonUrl: process.env.OPENMATE_URL || 'http://127.0.0.1:8787',
  // Se presente un character.riv, l'app userà Rive; altrimenti il placeholder SVG.
  riveAsset: fs.existsSync(rivePath) ? `file://${rivePath}` : null,
  setInteractive: (interactive) => ipcRenderer.send('set-interactive', !!interactive),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  quit: () => ipcRenderer.send('quit'),
});

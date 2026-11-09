const { contextBridge, ipcRenderer } = require('electron');

// Finestra 3D: riceve le parti del modello dal daemon (via main) e chiede i clic solo sopra il modello.
contextBridge.exposeInMainWorld('scene3d', {
  onEvent: (cb) => ipcRenderer.on('scene3d-event', (_e, event) => cb(event)),
  interactive: (on) => ipcRenderer.send('scene3d-interactive', Boolean(on)),
  ready: () => ipcRenderer.send('scene3d-visible'),
  close: () => ipcRenderer.send('scene3d-close'),
  // revisione con la vista: main chiede due viste del modello costruito, il visore le rende e le rimanda
  onSnapshot: (cb) => ipcRenderer.on('scene3d-snapshot', () => cb()),
  snapshot: (images) => ipcRenderer.send('scene3d-snapshot', images),
});

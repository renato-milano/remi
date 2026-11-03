const { contextBridge, ipcRenderer } = require('electron');

// Lavagna "indica e chiedi": finestra trasparente a tutto schermo sul monitor indicato.
contextBridge.exposeInMainWorld('pointer', {
  submit: (text) => ipcRenderer.send('pointer-submit', String(text || '')),
  cancel: () => ipcRenderer.send('pointer-cancel'),
  setInteractive: (on) => ipcRenderer.send('pointer-interactive', Boolean(on)),
  onTrace: (cb) => ipcRenderer.on('pointer-trace', (_e, points) => cb(points)),
  onAsk: (cb) => ipcRenderer.on('pointer-ask', (_e, at) => cb(at)),
  onThinking: (cb) => ipcRenderer.on('pointer-thinking', () => cb()),
  onAnswer: (cb) => ipcRenderer.on('pointer-answer', (_e, text) => cb(text)),
  onStatus: (cb) => ipcRenderer.on('pointer-status', (_e, text) => cb(text)),
  onDone: (cb) => ipcRenderer.on('pointer-done', () => cb()),
  onDraw: (cb) => ipcRenderer.on('pointer-draw', (_e, d) => cb(d)),
  onClear: (cb) => ipcRenderer.on('pointer-clear', () => cb()),
});

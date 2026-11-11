const { contextBridge, ipcRenderer } = require('electron');

// Quaderno: le sessioni con Remi (lavagne, modelli 3D, scene animate, domande) per argomento.
contextBridge.exposeInMainWorld('notebook', {
  list: () => ipcRenderer.invoke('notebook-list'),
  get: (id) => ipcRenderer.invoke('notebook-get', String(id)),
  update: (id, patch) => ipcRenderer.invoke('notebook-update', String(id), patch),
  remove: (id) => ipcRenderer.invoke('notebook-delete', String(id)),
  renameTopic: (from, to) => ipcRenderer.invoke('notebook-rename-topic', String(from), String(to)),
  replay: (id, voice) => ipcRenderer.invoke('notebook-replay', String(id), Boolean(voice)),
  ask: (id, text) => ipcRenderer.invoke('notebook-ask', String(id), String(text)),
  onChange: (cb) => ipcRenderer.on('notebook-changed', () => cb()),
});

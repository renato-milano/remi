const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  onData: (cb) => ipcRenderer.on('settings-data', (_e, data) => cb(data)),
  save: (data) => ipcRenderer.send('settings-save', data),
  close: () => ipcRenderer.send('settings-close'),
});

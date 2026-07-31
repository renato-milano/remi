const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  platform: process.platform,
  onData: (cb) => ipcRenderer.on('settings-data', (_e, data) => cb(data)),
  save: (data) => ipcRenderer.send('settings-save', data),
  close: () => ipcRenderer.send('settings-close'),
  openPermission: (which) => ipcRenderer.send('open-permission', which),
});

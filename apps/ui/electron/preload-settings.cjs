const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  platform: process.platform,
  daemonUrl: process.env.OPENMATE_URL || 'http://127.0.0.1:8787',
  onData: (cb) => ipcRenderer.on('settings-data', (_e, data) => cb(data)),
  save: (data) => ipcRenderer.send('settings-save', data),
  close: () => ipcRenderer.send('settings-close'),
  claudeStatus: () => ipcRenderer.invoke('claude-subscription-status'),
  openPermission: (which) => ipcRenderer.send('open-permission', which),
});

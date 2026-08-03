const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onboarding', {
  platform: process.platform,
  complete: (data) => ipcRenderer.send('onboarding-complete', data),
  claudeStatus: () => ipcRenderer.invoke('claude-subscription-status'),
  openPermission: (which) => ipcRenderer.send('open-permission', which),
  quit: () => ipcRenderer.send('quit'),
});

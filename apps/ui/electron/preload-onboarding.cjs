const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onboarding', {
  complete: (data) => ipcRenderer.send('onboarding-complete', data),
  quit: () => ipcRenderer.send('quit'),
});

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('dash', {
  daemonUrl: process.env.OPENMATE_URL || 'http://127.0.0.1:8787',
});

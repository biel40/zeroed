// Sandboxed preloads must be CommonJS. Exposes the minimal desktop API typed in src/platform/DesktopShell.ts.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zeroedDesktop', Object.freeze({
  quit: () => ipcRenderer.send('zeroed:quit'),
}));

// Electron main process: one fullscreen window that runs the Vite build from the app:// origin.
import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_ENTRY_URL, APP_SCHEME, isAppUrl, isExternalWebUrl, resolveAppFile } from './appProtocol.mjs';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(desktopDir, '..', 'dist');

// Must run before `ready`. `stream` lets <audio> seek the music; `secure` keeps secure-context APIs.
protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
}]);

function serveAppFiles() {
  protocol.handle(APP_SCHEME, (request) => {
    const file = resolveAppFile(distDir, request.url);
    if (!file) return new Response('Not found', { status: 404 });
    // Forwarding the headers keeps Range requests working for media.
    return net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
  });
}

function isFullscreenToggle(input) {
  return input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'Enter' && input.alt));
}

function createMainWindow() {
  const window = new BrowserWindow({
    title: 'Zeroed',
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    fullscreen: true,
    show: false,
    backgroundColor: '#06090d',
    webPreferences: {
      preload: path.join(desktopDir, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The game keeps its own pause; throttling would stall co-op hosts that lose focus.
      backgroundThrottling: false,
    },
  });
  window.once('ready-to-show', () => window.show());

  const { webContents } = window;
  webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (isExternalWebUrl(url)) void shell.openExternal(url);
  });
  webContents.on('before-input-event', (event, input) => {
    if (isFullscreenToggle(input)) {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    } else if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') {
      webContents.toggleDevTools();
    }
  });

  void window.loadURL(APP_ENTRY_URL);
  return window;
}

function start() {
  // A second launch (e.g. from Steam while already running) focuses the open window instead.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  let mainWindow = null;
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  ipcMain.on('zeroed:quit', (event) => {
    if (isAppUrl(event.senderFrame?.url ?? '')) app.quit();
  });
  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(() => {
    // No native menu bar: its default accelerators (reload, zoom) would interfere with play.
    Menu.setApplicationMenu(null);
    serveAppFiles();
    mainWindow = createMainWindow();
  });
}

start();

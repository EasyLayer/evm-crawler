import { config } from 'dotenv';
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { bootstrap } from '@easylayer/evm-crawler';
import { NativeBalanceWatcher } from '../src/model';
import { GetBalanceQueryHandler } from '../src/query';
config({ path: join(app.getAppPath(), '.env') });
let crawlerReady = false;
app.whenReady().then(async () => {
  createWindow(); ipcMain.handle('crawler:ready', () => crawlerReady);
  bootstrap({ Models: [NativeBalanceWatcher], QueryHandlers: [GetBalanceQueryHandler] })
    .then(() => { crawlerReady = true; console.log('[main] crawler ready'); })
    .catch((error) => { console.error('[main] crawler failed to start:', error); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
function createWindow() {
  const win = new BrowserWindow({ width: 900, height: 650, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: join(__dirname, 'preload.js') } });
  if (process.env.NODE_ENV === 'development') { win.loadURL('http://localhost:5173'); win.webContents.openDevTools(); }
  else { win.loadFile(join(app.getAppPath(), 'dist', 'renderer', 'index.html')); }
  win.on('close', () => { app.quit(); });
  win.webContents.on('preload-error', (_event, preloadPath, error) => { console.error('[main] preload error:', preloadPath, error); });
}
app.on('window-all-closed', () => { app.quit(); });

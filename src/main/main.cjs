const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const cloud = require('../cloud/localCloud.cjs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1350,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#f3f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
}

ipcMain.handle('cloud:getDb', () => cloud.getDb());
ipcMain.handle('cloud:getCustomers', () => cloud.getCustomers());
ipcMain.handle('cloud:getStoresByCustomer', (_e, customerId) => cloud.getStoresByCustomer(customerId));
ipcMain.handle('cloud:getWallModels', () => cloud.getWallModels());
ipcMain.handle('cloud:createWall', (_e, payload) => cloud.createWall(payload));
ipcMain.handle('cloud:getUnassignedWalls', () => cloud.getUnassignedWalls());
ipcMain.handle('cloud:getWallDetails', (_e, chargingWallId) => cloud.getWallDetails(chargingWallId));
ipcMain.handle('cloud:allocateSlotNfcSerials', (_e, chargingWallId) => cloud.allocateSlotNfcSerials(chargingWallId));
ipcMain.handle('cloud:saveWallConfiguration', (_e, payload) => cloud.saveWallConfiguration(payload));
ipcMain.handle('cloud:createCheckInStation', (_e, payload) => cloud.createCheckInStation(payload));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

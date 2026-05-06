const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const cloud = require('../cloud/localCloud.cjs');


function createAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reset app data to default',
          click: async () => {
            const result = await dialog.showMessageBox({
              type: 'warning',
              buttons: ['Cancel', 'Reset'],
              defaultId: 0,
              cancelId: 0,
              title: 'Reset app data',
              message: 'Reset app data to default?',
              detail: 'This will overwrite data/local-cloud-db.json with data/local-cloud-db-default.json.'
            });
            if (result.response !== 1) return;
            try {
              cloud.resetDbToDefault();
              BrowserWindow.getAllWindows().forEach((window) => window.reload());
            } catch (error) {
              dialog.showErrorBox('Reset failed', error.message || String(error));
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const url = process.env.VITE_DEV_SERVER_URL;
  if (url) win.loadURL(url);
  else win.loadFile(path.join(__dirname, '../../index.html'));
}

ipcMain.handle('cloud:getDb', () => cloud.getDb());
ipcMain.handle('cloud:resetDbToDefault', () => cloud.resetDbToDefault());
ipcMain.handle('cloud:getCustomers', () => cloud.getCustomers());
ipcMain.handle('cloud:getStoresByCustomer', (_e, id) => cloud.getStoresByCustomer(id));
ipcMain.handle('cloud:getWallModels', () => cloud.getWallModels());
ipcMain.handle('cloud:createWall', (_e, p) => cloud.createWall(p));
ipcMain.handle('cloud:getUnassignedWalls', () => cloud.getUnassignedWalls());
ipcMain.handle('cloud:getWallDetails', (_e, id) => cloud.getWallDetails(id));
ipcMain.handle('cloud:allocateSlotNfcSerials', (_e, id) => cloud.allocateSlotNfcSerials(id));
ipcMain.handle('cloud:saveWallConfiguration', (_e, p) => cloud.saveWallConfiguration(p));
ipcMain.handle('cloud:createCheckInStation', (_e, p) => cloud.createCheckInStation(p));

app.whenReady().then(() => {
  createAppMenu();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

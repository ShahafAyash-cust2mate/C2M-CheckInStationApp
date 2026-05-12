const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const cloud = require('../cloud/localCloud.cjs');
const nfc = require('../nfc/pn532Service.cjs');
const settingsService = require('../settings/settingsService.cjs');
const scanner = require('../scanner/scannerBleService.cjs');
const arduino = require('../devices/arduinoService.cjs');




function createSettingsWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 760,
    backgroundColor: '#0f172a',
    title: 'Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const url = process.env.VITE_DEV_SERVER_URL;
  if (url) win.loadURL(`${url}#settings`);
  else win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { hash: 'settings' });
}

function createDeviceManagerWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    backgroundColor: '#0f172a',
    title: 'Device Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.maximize();
  const url = process.env.VITE_DEV_SERVER_URL;
  if (url) win.loadURL(`${url}#device-manager`);
  else win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { hash: 'device-manager' });
}

function createAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Device manager',
          click: () => createDeviceManagerWindow()
        },
        {
          label: 'Settings',
          click: () => createSettingsWindow()
        },
        { type: 'separator' },
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
    width: 1920,
    height: 1080,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.maximize();
  const url = process.env.VITE_DEV_SERVER_URL;
  if (url) win.loadURL(url);
  else win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
}


ipcMain.handle('nfc:listPorts', () => nfc.listSerialPorts());
ipcMain.handle('nfc:autoDetectPort', () => nfc.autoDetectPort());
ipcMain.handle('nfc:readTag', (_e, payload) => nfc.readNfcTag(payload.portPath, payload.options || {}));
ipcMain.handle('nfc:writeTag', (_e, payload) => nfc.writeNfcTag(payload.portPath, payload.value, payload.options || {}));
ipcMain.handle('nfc:testConnection', (_e, portPath) => nfc.testConnection(portPath));

ipcMain.handle('arduino:listPorts', () => arduino.listSerialPorts());
ipcMain.handle('arduino:autoDetectPort', () => arduino.autoDetectPort());
ipcMain.handle('arduino:testConnection', (_e, portPath) => arduino.testConnection(portPath));
ipcMain.handle('arduino:getBattery', (_e, portPath) => arduino.getBatteryStatus(portPath));
ipcMain.handle('arduino:isCharging', (_e, portPath) => arduino.isCharging(portPath));
ipcMain.handle('arduino:turnLedOn', (_e, payload) => arduino.turnLedOn(payload.portPath, payload.color));
ipcMain.handle('arduino:turnLedOff', (_e, portPath) => arduino.turnLedOff(portPath));
ipcMain.handle('arduino:turnHandleLedOn', (_e, payload) => arduino.turnHandleLedOn(payload.portPath, payload.color));
ipcMain.handle('arduino:turnHandleLedOff', (_e, portPath) => arduino.turnHandleLedOff(portPath));
ipcMain.handle('arduino:sendCommand', (_e, payload) => arduino.sendCommandToArduino(payload.portPath, payload.command, payload.payload || '', payload.timeoutMs));

ipcMain.handle('cloud:getDb', () => cloud.getDb());
ipcMain.handle('cloud:resetDbToDefault', () => cloud.resetDbToDefault());
ipcMain.handle('cloud:getCustomers', () => cloud.getCustomers());
ipcMain.handle('cloud:getStoresByCustomer', (_e, id) => cloud.getStoresByCustomer(id));
ipcMain.handle('cloud:getWallModels', () => cloud.getWallModels());
ipcMain.handle('cloud:createWall', (_e, p) => cloud.createWall(p));
ipcMain.handle('cloud:getUnassignedWalls', () => cloud.getUnassignedWalls());
ipcMain.handle('cloud:getUnassignedWallBySerial', (_e, serialNumber) => cloud.getUnassignedWallBySerial(serialNumber));
ipcMain.handle('cloud:getWallDetails', (_e, id) => cloud.getWallDetails(id));
ipcMain.handle('cloud:allocateSlotNfcSerials', (_e, id) => cloud.allocateSlotNfcSerials(id));
ipcMain.handle('cloud:saveWallConfiguration', (_e, p) => cloud.saveWallConfiguration(p));
ipcMain.handle('cloud:createCheckInStation', (_e, p) => cloud.createCheckInStation(p));
ipcMain.handle('cloud:validateWelcomeScreenSerial', (_e, payload) => cloud.validateWelcomeScreenSerial(payload.serialNumber, payload.chargingWallId));

app.whenReady().then(() => {
  createAppMenu();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });


ipcMain.handle('settings:read', () => settingsService.readSettings());
ipcMain.handle('settings:save', (_e, settings) => settingsService.saveSettings(settings));
ipcMain.handle('settings:reset', () => settingsService.resetSettings());

ipcMain.handle('scanner:testConnection', (_e, macFragment) => scanner.testConnection(macFragment));
ipcMain.handle('scanner:readScan', (_e, payload) => scanner.readScan(payload.macFragment, payload.timeoutMs));
ipcMain.handle('scanner:scanAvailable', (_e, timeoutMs) => scanner.scanAvailable(timeoutMs));

ipcMain.handle('scanner:disconnect', () => scanner.disconnectScanner());
ipcMain.handle('scanner:getStatus', () => scanner.getConnectionStatus());

ipcMain.handle('scanner:getVersion', (_e, payload) => scanner.getVersion(payload.macFragment, payload.timeoutMs));
ipcMain.handle('scanner:getLastValue', () => scanner.getLastValue());

ipcMain.handle('arduino:openWall', (_e, portPath, durationMs) => arduino.openWall(portPath, durationMs));

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const remoteCloud = require('../cloud/remoteCloud.cjs');
const nfc = require('../nfc/pn532Service.cjs');
const settingsService = require('../settings/settingsService.cjs');
const logger = require('../utils/logger.cjs');
const scanner = require('../scanner/scannerBleService.cjs');
const arduino = require('../devices/arduinoService.cjs');


function cloud() {
  logger.info('Cloud provider selected', { provider: 'remote-only' });
  return remoteCloud;
}


function attachRendererLogging(win, name) {
  try {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) logger.error(`Renderer console ${name}`, { level, message, line, sourceId });
      else logger.info(`Renderer console ${name}`, { level, message, line, sourceId });
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      logger.error(`Renderer process gone ${name}`, details);
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      logger.error(`Renderer did-fail-load ${name}`, { errorCode, errorDescription, validatedURL });
    });
  } catch (e) {
    logger.error('attachRendererLogging failed', { message: e.message || String(e) });
  }
}

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

  attachRendererLogging(win, "settings");
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
  attachRendererLogging(win, "device-manager");
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
          label: 'Open cloud log folder',
          click: async () => {
            logger.info('Open cloud log folder requested', { logPath: logger.logPath() });
            await shell.openPath(logger.logDir());
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
  attachRendererLogging(win, "main");
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


function cloudHandle(name, fn) {
  ipcMain.handle(name, async (_event, ...args) => {
    logger.info(`IPC ${name} start`, { args });
    try {
      const result = await fn(...args);
      logger.info(`IPC ${name} success`, { result });
      return result;
    } catch (error) {
      logger.error(`IPC ${name} failed`, { message: error.message || String(error), stack: error.stack });
      throw error;
    }
  });
}
cloudHandle('cloud:getDb', () => cloud().getDb());
cloudHandle('cloud:resetDbToDefault', () => cloud().resetDbToDefault());
cloudHandle('cloud:getCustomers', () => cloud().getCustomers());
cloudHandle('cloud:getStoresByCustomer', (id) => cloud().getStoresByCustomer(id));
cloudHandle('cloud:getWallModels', () => cloud().getWallModels());
cloudHandle('cloud:createWall', (p) => cloud().createWall(p));
cloudHandle('cloud:getUnassignedWalls', () => cloud().getUnassignedWalls());
cloudHandle('cloud:getUnassignedWallBySerial', (serialNumber) => cloud().getUnassignedWallBySerial(serialNumber));
cloudHandle('cloud:getWallDetails', (id) => cloud().getWallDetails(id));
cloudHandle('cloud:allocateSlotNfcSerials', (id) => cloud().allocateSlotNfcSerials(id));
cloudHandle('cloud:saveWallConfiguration', (p) => cloud().saveWallConfiguration(p));
cloudHandle('cloud:createCheckInStation', (p) => cloud().createCheckInStation(p));
cloudHandle('cloud:validateWelcomeScreenSerial', (payload) => cloud().validateWelcomeScreenSerial(payload.serialNumber, payload.chargingWallId));

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

ipcMain.handle('cloud:getLogPath', () => logger.logPath());

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cloudApi', {
  getDb: () => ipcRenderer.invoke('cloud:getDb'),
  resetDbToDefault: () => ipcRenderer.invoke('cloud:resetDbToDefault'),
  getCustomers: () => ipcRenderer.invoke('cloud:getCustomers'),
  getStoresByCustomer: (id) => ipcRenderer.invoke('cloud:getStoresByCustomer', id),
  getWallModels: () => ipcRenderer.invoke('cloud:getWallModels'),
  createWall: (p) => ipcRenderer.invoke('cloud:createWall', p),
  getUnassignedWalls: () => ipcRenderer.invoke('cloud:getUnassignedWalls'),
  getUnassignedWallBySerial: (serialNumber) => ipcRenderer.invoke('cloud:getUnassignedWallBySerial', serialNumber),
  getWallDetails: (id) => ipcRenderer.invoke('cloud:getWallDetails', id),
  allocateSlotNfcSerials: (id) => ipcRenderer.invoke('cloud:allocateSlotNfcSerials', id),
  saveWallConfiguration: (p) => ipcRenderer.invoke('cloud:saveWallConfiguration', p),
  createCheckInStation: (p) => ipcRenderer.invoke('cloud:createCheckInStation', p),
  validateWelcomeScreenSerial: (serialNumber, chargingWallId) => ipcRenderer.invoke('cloud:validateWelcomeScreenSerial', { serialNumber, chargingWallId })
});


contextBridge.exposeInMainWorld('nfcApi', {
  listPorts: () => ipcRenderer.invoke('nfc:listPorts'),
  autoDetectPort: () => ipcRenderer.invoke('nfc:autoDetectPort'),
  readTag: (portPath, options) => ipcRenderer.invoke('nfc:readTag', { portPath, options }),
  writeTag: (portPath, value, options) => ipcRenderer.invoke('nfc:writeTag', { portPath, value, options }),
  testConnection: (portPath) => ipcRenderer.invoke('nfc:testConnection', portPath)
});


contextBridge.exposeInMainWorld('arduinoApi', {
  listPorts: () => ipcRenderer.invoke('arduino:listPorts'),
  autoDetectPort: () => ipcRenderer.invoke('arduino:autoDetectPort'),
  testConnection: (portPath) => ipcRenderer.invoke('arduino:testConnection', portPath),
  getBattery: (portPath) => ipcRenderer.invoke('arduino:getBattery', portPath),
  isCharging: (portPath) => ipcRenderer.invoke('arduino:isCharging', portPath),
  turnLedOn: (portPath, color) => ipcRenderer.invoke('arduino:turnLedOn', { portPath, color }),
  turnLedOff: (portPath) => ipcRenderer.invoke('arduino:turnLedOff', portPath),
  turnHandleLedOn: (portPath, color) => ipcRenderer.invoke('arduino:turnHandleLedOn', { portPath, color }),
  turnHandleLedOff: (portPath) => ipcRenderer.invoke('arduino:turnHandleLedOff', portPath),
  openWall: (portPath, durationMs) => ipcRenderer.invoke('arduino:openWall', portPath, durationMs),
  sendCommand: (portPath, command, payload, timeoutMs) => ipcRenderer.invoke('arduino:sendCommand', { portPath, command, payload, timeoutMs })
});


contextBridge.exposeInMainWorld('settingsApi', {
  read: () => ipcRenderer.invoke('settings:read'),
  save: (settings) => ipcRenderer.invoke('settings:save', settings),
  reset: () => ipcRenderer.invoke('settings:reset')
});

contextBridge.exposeInMainWorld('scannerApi', {
  testConnection: (macFragment) => ipcRenderer.invoke('scanner:testConnection', macFragment),
  readScan: (macFragment, timeoutMs) => ipcRenderer.invoke('scanner:readScan', { macFragment, timeoutMs }),
  scanAvailable: (timeoutMs) => ipcRenderer.invoke('scanner:scanAvailable', timeoutMs),
  disconnect: () => ipcRenderer.invoke('scanner:disconnect'),
  getStatus: () => ipcRenderer.invoke('scanner:getStatus'),
  getVersion: (macFragment, timeoutMs) => ipcRenderer.invoke('scanner:getVersion', { macFragment, timeoutMs }),
  getLastValue: () => ipcRenderer.invoke('scanner:getLastValue')
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cloudApi', {
  getDb: () => ipcRenderer.invoke('cloud:getDb'),
  getCustomers: () => ipcRenderer.invoke('cloud:getCustomers'),
  getStoresByCustomer: (customerId) => ipcRenderer.invoke('cloud:getStoresByCustomer', customerId),
  getWallModels: () => ipcRenderer.invoke('cloud:getWallModels'),
  createWall: (payload) => ipcRenderer.invoke('cloud:createWall', payload),
  getUnassignedWalls: () => ipcRenderer.invoke('cloud:getUnassignedWalls'),
  getWallDetails: (chargingWallId) => ipcRenderer.invoke('cloud:getWallDetails', chargingWallId),
  allocateSlotNfcSerials: (chargingWallId) => ipcRenderer.invoke('cloud:allocateSlotNfcSerials', chargingWallId),
  saveWallConfiguration: (payload) => ipcRenderer.invoke('cloud:saveWallConfiguration', payload),
  createCheckInStation: (payload) => ipcRenderer.invoke('cloud:createCheckInStation', payload)
});

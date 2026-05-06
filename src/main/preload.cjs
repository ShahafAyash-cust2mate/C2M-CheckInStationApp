const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cloudApi', {
  getDb: () => ipcRenderer.invoke('cloud:getDb'),
  resetDbToDefault: () => ipcRenderer.invoke('cloud:resetDbToDefault'),
  getCustomers: () => ipcRenderer.invoke('cloud:getCustomers'),
  getStoresByCustomer: (id) => ipcRenderer.invoke('cloud:getStoresByCustomer', id),
  getWallModels: () => ipcRenderer.invoke('cloud:getWallModels'),
  createWall: (p) => ipcRenderer.invoke('cloud:createWall', p),
  getUnassignedWalls: () => ipcRenderer.invoke('cloud:getUnassignedWalls'),
  getWallDetails: (id) => ipcRenderer.invoke('cloud:getWallDetails', id),
  allocateSlotNfcSerials: (id) => ipcRenderer.invoke('cloud:allocateSlotNfcSerials', id),
  saveWallConfiguration: (p) => ipcRenderer.invoke('cloud:saveWallConfiguration', p),
  createCheckInStation: (p) => ipcRenderer.invoke('cloud:createCheckInStation', p)
});

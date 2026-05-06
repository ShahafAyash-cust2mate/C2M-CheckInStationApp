const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/local-cloud-db.json');
const defaultDbPath = path.join(__dirname, '../../data/local-cloud-db-default.json');
const emptyDb = {
  Customers: [], Stores: [], ChargingWallModels: [], CheckInStations: [],
  ChargingWalls: [], WelcomeScreens: [], ChargingSlots: [], ControlUnits: [],
  ControlUnitTwin: [], CheckInStationZones: [], CheckInStationZoneSlots: []
};


function resetDbToDefault() {
  if (!fs.existsSync(defaultDbPath)) {
    throw new Error('Default DB file was not found: data/local-cloud-db-default.json');
  }
  const raw = fs.readFileSync(defaultDbPath, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  fs.writeFileSync(dbPath, JSON.stringify(parsed, null, 2), 'utf8');
  return { ok: true };
}

function readDb() {
  if (!fs.existsSync(dbPath)) writeDb(emptyDb);
  return { ...emptyDb, ...JSON.parse(fs.readFileSync(dbPath, 'utf8') || '{}') };
}
function writeDb(db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8'); }
function nextId(rows, field) {
  return rows.filter(r => r && r[field] !== null && r[field] !== undefined && r[field] !== '')
    .reduce((m, r) => Math.max(m, Number(r[field] || 0)), 0) + 1;
}
function validRows(rows, idField) {
  return (rows || []).filter(r => r && r[idField] !== null && r[idField] !== undefined && r[idField] !== '');
}
function getDb() { return readDb(); }
function getCustomers() { return validRows(readDb().Customers, 'CustomerId'); }
function getStoresByCustomer(customerId) {
  return validRows(readDb().Stores, 'StoreId').filter(s => Number(s.CustomerId) === Number(customerId));
}
function getWallModels() { return validRows(readDb().ChargingWallModels, 'ChargingWallModelId'); }
function createWall(payload) {
  const db = readDb();
  db.ChargingWalls = validRows(db.ChargingWalls, 'ChargingWallId');
  const model = validRows(db.ChargingWallModels, 'ChargingWallModelId').find(m => Number(m.ChargingWallModelId) === Number(payload.ChargingWallModelId));
  if (!model) throw new Error('Model not found');
  const row = {
    ChargingWallId: nextId(db.ChargingWalls, 'ChargingWallId'),
    ChargingWallModelId: Number(model.ChargingWallModelId),
    CheckInStationId: null,
    SerialNumber: String(payload.SerialNumber || '').trim(),
    ChargingWallIndex: null
  };
  db.ChargingWalls.push(row);
  if (payload.WelcomeScreenSerialNumber) {
    db.WelcomeScreens = validRows(db.WelcomeScreens, 'WelcomeScreenId');
    db.WelcomeScreens.push({
      WelcomeScreenId: nextId(db.WelcomeScreens, 'WelcomeScreenId'),
      ChargingWallId: row.ChargingWallId,
      SerialNumber: String(payload.WelcomeScreenSerialNumber).trim()
    });
  }
  writeDb(db);
  return row;
}
function withModel(db, wall) {
  return { ...wall, ModelInfo: validRows(db.ChargingWallModels, 'ChargingWallModelId').find(m => Number(m.ChargingWallModelId) === Number(wall.ChargingWallModelId)) || null };
}
function getUnassignedWalls() {
  const db = readDb();
  return validRows(db.ChargingWalls, 'ChargingWallId')
    .filter(w => w.CheckInStationId === null || w.CheckInStationId === undefined || w.CheckInStationId === '')
    .map(w => withModel(db, w));
}
function getWallDetails(id) {
  const db = readDb();
  const wall = validRows(db.ChargingWalls, 'ChargingWallId').find(w => Number(w.ChargingWallId) === Number(id));
  if (!wall) throw new Error('Wall not found');
  const model = validRows(db.ChargingWallModels, 'ChargingWallModelId').find(m => Number(m.ChargingWallModelId) === Number(wall.ChargingWallModelId));
  return { wall, model };
}
function isScreenCell(model, row, col) {
  if (!model || !model.HasWelcomeScreen) return false;
  return row >= model.WelcomeScreenRowNumber &&
    row < model.WelcomeScreenRowNumber + model.WelcomeScreenRowSize &&
    col >= model.WelcomeScreenColumnNumber &&
    col < model.WelcomeScreenColumnNumber + model.WelcomeScreenColumnSize;
}
function existingNfcMax(db) {
  let max = 0;
  for (const slot of validRows(db.ChargingSlots, 'ChargingSlotId')) {
    const m = String(slot.NFCCode || '').match(/^CW00(\d{8})$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}
function allocateSlotNfcSerials(chargingWallId) {
  const db = readDb();
  const { model } = getWallDetails(chargingWallId);
  let next = existingNfcMax(db) + 1;
  const result = [];
  for (let r = 0; r < model.RowCount; r++) {
    for (let c = 0; c < model.ColumnCount; c++) {
      const sn = r * model.ColumnCount + c + 1;
      if (isScreenCell(model, r, c)) continue;
      result.push({ SlotNumber: sn, RowNumber: r, ColumnNumber: c, NFCCode: `CW00${String(next).padStart(8, '0')}` });
      next++;
    }
  }
  return result;
}
function saveWallConfiguration(payload) {
  const db = readDb();
  db.ChargingSlots = validRows(db.ChargingSlots, 'ChargingSlotId').filter(s => Number(s.ChargingWallId) !== Number(payload.ChargingWallId));
  for (const slot of payload.Slots || []) {
    db.ChargingSlots.push({
      ChargingSlotId: nextId(db.ChargingSlots, 'ChargingSlotId'),
      ChargingWallId: Number(payload.ChargingWallId),
      NFCCode: slot.NFCCode,
      RowNumber: Number(slot.RowNumber),
      ColumnNumber: Number(slot.ColumnNumber)
    });
  }
  writeDb(db);
  return { ok: true, SlotCount: (payload.Slots || []).length };
}
function createCheckInStation(payload) {
  const db = readDb();
  db.CheckInStations = validRows(db.CheckInStations, 'CheckInStationId');
  const station = { CheckInStationId: nextId(db.CheckInStations, 'CheckInStationId'), Name: String(payload.Name || '').trim(), StoreId: Number(payload.StoreId) };
  db.CheckInStations.push(station);
  db.ChargingWalls = validRows(db.ChargingWalls, 'ChargingWallId');
  db.WelcomeScreens = validRows(db.WelcomeScreens, 'WelcomeScreenId');
  (payload.Walls || []).forEach((item, index) => {
    const wall = db.ChargingWalls.find(w => Number(w.ChargingWallId) === Number(item.ChargingWallId));
    if (!wall) return;
    wall.CheckInStationId = station.CheckInStationId;
    wall.ChargingWallIndex = index;
  });
  writeDb(db);
  return station;
}
module.exports = { getDb, resetDbToDefault, getCustomers, getStoresByCustomer, getWallModels, createWall, getUnassignedWalls, getWallDetails, allocateSlotNfcSerials, saveWallConfiguration, createCheckInStation };

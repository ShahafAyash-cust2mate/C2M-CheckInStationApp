const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/local-cloud-db.json');

const emptyDb = {
  Customers: [],
  Stores: [],
  ChargingWallModels: [],
  CheckInStations: [],
  ChargingWalls: [],
  WelcomeScreens: [],
  ChargingSlots: [],
  ControlUnits: [],
  ControlUnitTwin: [],
  CheckInStationZones: [],
  CheckInStationZoneSlots: []
};

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === 'object' && !Object.values(row).every((v) => v === null || v === ''));
}

function readDb() {
  if (!fs.existsSync(dbPath)) writeDb(emptyDb);
  const raw = fs.readFileSync(dbPath, 'utf-8');
  const parsed = JSON.parse(raw || '{}');
  const db = { ...emptyDb, ...parsed };
  for (const key of Object.keys(emptyDb)) db[key] = normalizeArray(db[key]);
  return db;
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
}

function nextId(rows, field) {
  return rows.reduce((max, row) => Math.max(max, Number(row[field] || 0)), 0) + 1;
}

function getDb() { return readDb(); }
function getCustomers() { return readDb().Customers; }
function getStoresByCustomer(customerId) {
  return readDb().Stores.filter((s) => Number(s.CustomerId) === Number(customerId));
}
function getWallModels() { return readDb().ChargingWallModels; }

function createWall(payload) {
  const db = readDb();
  const model = db.ChargingWallModels.find((m) => Number(m.ChargingWallModelId) === Number(payload.ChargingWallModelId));
  if (!model) throw new Error('Charging wall model was not found');
  const serial = String(payload.SerialNumber || '').trim();
  if (!serial) throw new Error('SerialNumber is required');

  const row = {
    ChargingWallId: nextId(db.ChargingWalls, 'ChargingWallId'),
    ChargingWallModelId: model.ChargingWallModelId,
    CheckInStationId: null,
    SerialNumber: serial,
    ChargingWallIndex: null
  };
  db.ChargingWalls.push(row);
  writeDb(db);
  return row;
}

function getUnassignedWalls() {
  const db = readDb();
  return db.ChargingWalls
    .filter((w) => w.CheckInStationId === null || w.CheckInStationId === undefined || w.CheckInStationId === '')
    .map((w) => ({ ...w, ModelInfo: db.ChargingWallModels.find((m) => Number(m.ChargingWallModelId) === Number(w.ChargingWallModelId)) || null }));
}

function getWallDetails(chargingWallId) {
  const db = readDb();
  const wall = db.ChargingWalls.find((w) => Number(w.ChargingWallId) === Number(chargingWallId));
  if (!wall) throw new Error('Charging wall was not found');
  const model = db.ChargingWallModels.find((m) => Number(m.ChargingWallModelId) === Number(wall.ChargingWallModelId));
  if (!model) throw new Error('Charging wall model was not found');
  return { wall, model };
}

function cellIsScreen(model, row, col) {
  if (!model || !model.HasWelcomeScreen) return false;
  return row >= model.WelcomeScreenRowNumber &&
    row < model.WelcomeScreenRowNumber + model.WelcomeScreenRowSize &&
    col >= model.WelcomeScreenColumnNumber &&
    col < model.WelcomeScreenColumnNumber + model.WelcomeScreenColumnSize;
}

function existingNfcMax(db) {
  let max = 0;
  for (const slot of db.ChargingSlots) {
    const match = String(slot.NFCCode || '').match(/^CW00(\d{8})$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

function allocateSlotNfcSerials(chargingWallId) {
  const db = readDb();
  const { model } = getWallDetails(chargingWallId);
  let next = existingNfcMax(db) + 1;
  const result = [];

  for (let row = 0; row < Number(model.RowCount); row++) {
    for (let col = 0; col < Number(model.ColumnCount); col++) {
      if (cellIsScreen(model, row, col)) continue;
      const slotNumber = row * Number(model.ColumnCount) + col + 1;
      result.push({
        SlotNumber: slotNumber,
        RowNumber: row,
        ColumnNumber: col,
        NFCCode: `CW00${String(next).padStart(8, '0')}`
      });
      next++;
    }
  }
  return result;
}

function saveWallConfiguration(payload) {
  const db = readDb();
  const wall = db.ChargingWalls.find((w) => Number(w.ChargingWallId) === Number(payload.ChargingWallId));
  if (!wall) throw new Error('Charging wall was not found');

  db.ChargingSlots = db.ChargingSlots.filter((s) => Number(s.ChargingWallId) !== Number(wall.ChargingWallId));
  for (const slot of payload.Slots || []) {
    db.ChargingSlots.push({
      ChargingSlotId: nextId(db.ChargingSlots, 'ChargingSlotId'),
      ChargingWallId: wall.ChargingWallId,
      NFCCode: slot.NFCCode,
      RowNumber: slot.RowNumber,
      ColumnNumber: slot.ColumnNumber
    });
  }

  if (payload.WelcomeScreenSerialNumber) {
    const existing = db.WelcomeScreens.find((s) => Number(s.ChargingWallId) === Number(wall.ChargingWallId));
    if (existing) existing.SerialNumber = payload.WelcomeScreenSerialNumber;
    else db.WelcomeScreens.push({ WelcomeScreenId: nextId(db.WelcomeScreens, 'WelcomeScreenId'), ChargingWallId: wall.ChargingWallId, SerialNumber: payload.WelcomeScreenSerialNumber });
  }

  writeDb(db);
  return { ok: true, ChargingWallId: wall.ChargingWallId, SlotCount: (payload.Slots || []).length };
}

function createCheckInStation(payload) {
  const db = readDb();
  const station = { CheckInStationId: nextId(db.CheckInStations, 'CheckInStationId'), StoreId: Number(payload.StoreId) };
  db.CheckInStations.push(station);

  for (let i = 0; i < (payload.Walls || []).length; i++) {
    const item = payload.Walls[i];
    const wall = db.ChargingWalls.find((w) => Number(w.ChargingWallId) === Number(item.ChargingWallId));
    if (!wall) continue;
    wall.CheckInStationId = station.CheckInStationId;
    wall.ChargingWallIndex = i;
    if (item.WelcomeScreenSerialNumber) {
      const existing = db.WelcomeScreens.find((s) => Number(s.ChargingWallId) === Number(wall.ChargingWallId));
      if (existing) existing.SerialNumber = item.WelcomeScreenSerialNumber;
      else db.WelcomeScreens.push({ WelcomeScreenId: nextId(db.WelcomeScreens, 'WelcomeScreenId'), ChargingWallId: wall.ChargingWallId, SerialNumber: item.WelcomeScreenSerialNumber });
    }
  }

  writeDb(db);
  return station;
}

module.exports = { getDb, getCustomers, getStoresByCustomer, getWallModels, createWall, getUnassignedWalls, getWallDetails, allocateSlotNfcSerials, saveWallConfiguration, createCheckInStation };

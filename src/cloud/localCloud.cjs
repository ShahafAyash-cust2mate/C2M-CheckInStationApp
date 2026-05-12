const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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

function getDataDir() {
  if (process.env.C2M_DATA_DIR) return process.env.C2M_DATA_DIR;
  if (app && app.isPackaged) return path.join(app.getPath('userData'), 'data');
  return path.join(__dirname, '../../data');
}
function getDbPath() { return path.join(getDataDir(), 'local-cloud-db.json'); }
function getBundledDefaultDbPath() {
  if (app && app.isPackaged) {
    const resourceDefault = path.join(process.resourcesPath, 'data', 'local-cloud-db-default.json');
    if (fs.existsSync(resourceDefault)) return resourceDefault;
  }
  return path.join(__dirname, '../../data/local-cloud-db-default.json');
}
function ensureDataFiles() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    const defaultPath = getBundledDefaultDbPath();
    if (fs.existsSync(defaultPath)) fs.copyFileSync(defaultPath, dbPath);
    else fs.writeFileSync(dbPath, JSON.stringify(emptyDb, null, 2), 'utf8');
  }
}
function readDb() {
  ensureDataFiles();
  return { ...emptyDb, ...JSON.parse(fs.readFileSync(getDbPath(), 'utf8') || '{}') };
}
function writeDb(db) {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getDbPath(), JSON.stringify({ ...emptyDb, ...db }, null, 2), 'utf8');
}
function resetDbToDefault() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const defaultPath = getBundledDefaultDbPath();
  if (!fs.existsSync(defaultPath)) throw new Error('Default DB file was not found');
  fs.copyFileSync(defaultPath, getDbPath());
  return { ok: true, dbPath: getDbPath() };
}
function validRows(rows, idField) { return (rows || []).filter(r => r && r[idField] !== null && r[idField] !== undefined && r[idField] !== ''); }
function nextId(rows, field) { return validRows(rows, field).reduce((m, r) => Math.max(m, Number(r[field] || 0)), 0) + 1; }
function normSerial(value) { return String(value || '').trim().toUpperCase(); }
function serialRequired(value, label) {
  const serial = String(value || '').trim();
  if (!serial) throw new Error(`${label} is required`);
  return serial;
}
function assertUniqueChargingWallSerial(db, serialNumber, ignoreId = null) {
  const serial = normSerial(serialNumber);
  if (!serial) throw new Error('Charging wall serial number is required');
  const exists = validRows(db.ChargingWalls, 'ChargingWallId').some(w => normSerial(w.SerialNumber) === serial && Number(w.ChargingWallId) !== Number(ignoreId));
  if (exists) throw new Error(`Charging wall serial already exists: ${serialNumber}`);
}
function assertUniqueWelcomeScreenSerial(db, serialNumber, ignoreId = null) {
  const serial = normSerial(serialNumber);
  if (!serial) throw new Error('Welcome screen serial number is required');
  const exists = validRows(db.WelcomeScreens, 'WelcomeScreenId').some(w => normSerial(w.SerialNumber) === serial && Number(w.WelcomeScreenId) !== Number(ignoreId));
  if (exists) throw new Error(`Welcome screen serial already exists: ${serialNumber}`);
}
function getDb() { return readDb(); }
function getCustomers() { return validRows(readDb().Customers, 'CustomerId'); }
function getStoresByCustomer(customerId) { return validRows(readDb().Stores, 'StoreId').filter(s => Number(s.CustomerId) === Number(customerId)); }
function getWallModels() { return validRows(readDb().ChargingWallModels, 'ChargingWallModelId'); }
function withModel(db, wall) {
  const welcomeScreen = validRows(db.WelcomeScreens, 'WelcomeScreenId').find(s => Number(s.ChargingWallId) === Number(wall.ChargingWallId)) || null;
  return {
    ...wall,
    Status: Number(wall.Status || 0),
    ModelInfo: validRows(db.ChargingWallModels, 'ChargingWallModelId').find(m => Number(m.ChargingWallModelId) === Number(wall.ChargingWallModelId)) || null,
    WelcomeScreenSerial: welcomeScreen?.SerialNumber || ''
  };
}
function getWallById(db, id) { return validRows(db.ChargingWalls, 'ChargingWallId').find(w => Number(w.ChargingWallId) === Number(id)) || null; }
function getWallDetails(id) {
  const db = readDb();
  const wall = getWallById(db, id);
  if (!wall) throw new Error('Wall not found');
  const model = validRows(db.ChargingWallModels, 'ChargingWallModelId').find(m => Number(m.ChargingWallModelId) === Number(wall.ChargingWallModelId));
  const welcomeScreen = validRows(db.WelcomeScreens, 'WelcomeScreenId').find(s => Number(s.ChargingWallId) === Number(wall.ChargingWallId)) || null;
  return { wall, model, welcomeScreen };
}
function findWelcomeScreenBySerial(serialNumber) {
  const db = readDb();
  const serial = normSerial(serialNumber);
  if (!serial) return null;
  return validRows(db.WelcomeScreens, 'WelcomeScreenId').find(w => normSerial(w.SerialNumber) === serial) || null;
}
function validateWelcomeScreenSerial(serialNumber, chargingWallId = null) {
  const screen = findWelcomeScreenBySerial(serialNumber);
  if (!screen) throw new Error(`Welcome screen serial was not found in local cloud: ${serialNumber}`);
  if (chargingWallId !== null && chargingWallId !== undefined && chargingWallId !== '' && Number(screen.ChargingWallId) !== Number(chargingWallId)) {
    throw new Error(`Welcome screen serial ${serialNumber} belongs to another charging wall`);
  }
  return screen;
}

function generateAndPersistSlotNfcSerials(db, wall, model) {
  const wallId = Number(wall.ChargingWallId);

  const existing = validRows(db.ChargingSlots, 'ChargingSlotId')
    .filter(s => Number(s.ChargingWallId) === wallId)
    .sort((a, b) => Number(a.RowNumber) - Number(b.RowNumber) || Number(a.ColumnNumber) - Number(b.ColumnNumber));

  if (existing.length > 0) {
    return existing.map(s => ({
      SlotNumber: Number(s.RowNumber) * Number(model.ColumnCount) + Number(s.ColumnNumber) + 1,
      RowNumber: Number(s.RowNumber),
      ColumnNumber: Number(s.ColumnNumber),
      NFCCode: s.NFCCode,
      Status: Number(s.Status || 0)
    }));
  }

  db.ChargingSlots = validRows(db.ChargingSlots, 'ChargingSlotId');
  let next = existingNfcMax(db) + 1;
  const generated = [];

  for (let r = 0; r < model.RowCount; r++) {
    for (let c = 0; c < model.ColumnCount; c++) {
      const slotNumber = r * model.ColumnCount + c + 1;
      if (isScreenCell(model, r, c)) continue;

      const nfcCode = `CW00${String(next).padStart(8, '0')}`;
      next++;

      const row = {
        ChargingSlotId: nextId(db.ChargingSlots, 'ChargingSlotId'),
        ChargingWallId: wallId,
        NFCCode: nfcCode,
        RowNumber: r,
        ColumnNumber: c,
        Status: 0
      };

      db.ChargingSlots.push(row);
      generated.push({ SlotNumber: slotNumber, RowNumber: r, ColumnNumber: c, NFCCode: nfcCode, Status: 0 });
    }
  }

  return generated;
}


function createWall(payload) {
  const db = readDb();
  db.ChargingWalls = validRows(db.ChargingWalls, 'ChargingWallId');
  db.WelcomeScreens = validRows(db.WelcomeScreens, 'WelcomeScreenId');
  db.ChargingSlots = validRows(db.ChargingSlots, 'ChargingSlotId');
  const serial = serialRequired(payload.SerialNumber, 'Charging wall serial number');
  assertUniqueChargingWallSerial(db, serial);
  const model = validRows(db.ChargingWallModels, 'ChargingWallModelId').find(m => Number(m.ChargingWallModelId) === Number(payload.ChargingWallModelId));
  if (!model) throw new Error('Model not found');
  const welcomeSerial = String(payload.WelcomeScreenSerialNumber || '').trim();
  if (model.HasWelcomeScreen) {
    serialRequired(welcomeSerial, 'Welcome screen serial number');
    assertUniqueWelcomeScreenSerial(db, welcomeSerial);
  } else if (welcomeSerial) {
    assertUniqueWelcomeScreenSerial(db, welcomeSerial);
  }
  const row = {
    ChargingWallId: nextId(db.ChargingWalls, 'ChargingWallId'),
    ChargingWallModelId: Number(model.ChargingWallModelId),
    CheckInStationId: null,
    SerialNumber: serial,
    ChargingWallIndex: null,
    Status: 0
  };
  db.ChargingWalls.push(row);
  if (welcomeSerial) {
    db.WelcomeScreens.push({
      WelcomeScreenId: nextId(db.WelcomeScreens, 'WelcomeScreenId'),
      ChargingWallId: row.ChargingWallId,
      SerialNumber: welcomeSerial
    });
  }

  // Generate and save NFC sticker serials at Create Charging Wall time.
  // From this point onward, other flows only return existing serials.
  const slots = generateAndPersistSlotNfcSerials(db, row, model);

  writeDb(db);
  return { ...row, Slots: slots };
}
function getUnassignedWalls() {
  const db = readDb();
  return validRows(db.ChargingWalls, 'ChargingWallId')
    .filter(w => w.CheckInStationId === null || w.CheckInStationId === undefined || w.CheckInStationId === '')
    .map(w => withModel(db, w));
}

function getUnassignedWallBySerial(serialNumber) {
  const db = readDb();
  const serial = normSerial(serialNumber);
  if (!serial) throw new Error('Charging wall serial is required');
  const wall = validRows(db.ChargingWalls, 'ChargingWallId')
    .filter(w => w.CheckInStationId === null || w.CheckInStationId === undefined || w.CheckInStationId === '')
    .find(w => normSerial(w.SerialNumber) === serial);
  if (!wall) throw new Error(`Unassigned charging wall serial was not found in local cloud: ${serialNumber}`);
  return withModel(db, wall);
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
  const wallId = Number(chargingWallId);
  const { wall, model } = getWallDetails(wallId);

  // Do not generate a new set if this wall already has NFC serials.
  const existing = validRows(db.ChargingSlots, 'ChargingSlotId')
    .filter(s => Number(s.ChargingWallId) === wallId)
    .sort((a, b) => Number(a.RowNumber) - Number(b.RowNumber) || Number(a.ColumnNumber) - Number(b.ColumnNumber))
    .map(s => ({
      SlotNumber: Number(s.RowNumber) * Number(model.ColumnCount) + Number(s.ColumnNumber) + 1,
      RowNumber: Number(s.RowNumber),
      ColumnNumber: Number(s.ColumnNumber),
      NFCCode: s.NFCCode,
      Status: Number(s.Status || 0)
    }));

  if (existing.length > 0) return existing;

  // Backward compatibility only: old DB files may contain walls created before v57.
  const generated = generateAndPersistSlotNfcSerials(db, wall, model);
  writeDb(db);
  return generated;
}
function saveWallConfiguration(payload) {
  const db = readDb();
  const wall = getWallById(db, payload.ChargingWallId);
  if (!wall) throw new Error('Charging wall not found');
  if (payload.WelcomeScreenSerialNumber) validateWelcomeScreenSerial(payload.WelcomeScreenSerialNumber, payload.ChargingWallId);

  db.ChargingSlots = validRows(db.ChargingSlots, 'ChargingSlotId');

  // Do not regenerate NFC serials here. They are created when the wall is created.
  // This save only ensures the submitted slot rows exist/are updated.
  for (const slot of payload.Slots || []) {
    const existing = db.ChargingSlots.find(s =>
      Number(s.ChargingWallId) === Number(payload.ChargingWallId) &&
      Number(s.RowNumber) === Number(slot.RowNumber) &&
      Number(s.ColumnNumber) === Number(slot.ColumnNumber)
    );

    if (existing) {
      existing.NFCCode = slot.NFCCode || existing.NFCCode;
      existing.Status = Number(slot.Status ?? existing.Status ?? 0);
    } else {
      db.ChargingSlots.push({
        ChargingSlotId: nextId(db.ChargingSlots, 'ChargingSlotId'),
        ChargingWallId: Number(payload.ChargingWallId),
        NFCCode: slot.NFCCode,
        RowNumber: Number(slot.RowNumber),
        ColumnNumber: Number(slot.ColumnNumber),
        Status: Number(slot.Status || 0)
      });
    }
  }

  if (payload.Status !== undefined && payload.Status !== null) {
    wall.Status = Number(payload.Status);
  }
  writeDb(db);
  return { ok: true, SlotCount: (payload.Slots || []).length, Status: Number(wall.Status || 0) };
}
function createCheckInStation(payload) {
  const db = readDb();
  const wallsPayload = payload.Walls || [];
  if (!Number(payload.StoreId)) throw new Error('Store is required');
  db.CheckInStations = validRows(db.CheckInStations, 'CheckInStationId');
  db.ChargingWalls = validRows(db.ChargingWalls, 'ChargingWallId');
  db.WelcomeScreens = validRows(db.WelcomeScreens, 'WelcomeScreenId');
  const seenWallIds = new Set();
  const seenWelcomeSerials = new Set();
  for (const item of wallsPayload) {
    if (seenWallIds.has(Number(item.ChargingWallId))) throw new Error('The same charging wall was selected more than once');
    seenWallIds.add(Number(item.ChargingWallId));
    if (item.WelcomeScreenSerial) {
      const serialKey = normSerial(item.WelcomeScreenSerial);
      if (seenWelcomeSerials.has(serialKey)) throw new Error(`The same welcome screen serial was selected more than once: ${item.WelcomeScreenSerial}`);
      seenWelcomeSerials.add(serialKey);
    }
    const wall = getWallById(db, item.ChargingWallId);
    if (!wall) throw new Error(`Charging wall was not found: ${item.ChargingWallId}`);
    if (Number(wall.Status || 0) !== 1) throw new Error(`Charging wall ${wall.SerialNumber} cannot be added to a check-in station because its status is not pass`);
    const model = validRows(db.ChargingWallModels, 'ChargingWallModelId').find(m => Number(m.ChargingWallModelId) === Number(wall.ChargingWallModelId));
    const dbWelcomeScreen = validRows(db.WelcomeScreens, 'WelcomeScreenId').find(ws => Number(ws.ChargingWallId) === Number(wall.ChargingWallId)) || null;
    item.WelcomeScreenSerial = item.WelcomeScreenSerial || dbWelcomeScreen?.SerialNumber || '';
    if (model && model.HasWelcomeScreen) {
      serialRequired(item.WelcomeScreenSerial, 'Welcome screen serial number');
      validateWelcomeScreenSerial(item.WelcomeScreenSerial, wall.ChargingWallId);
    } else if (item.WelcomeScreenSerial) {
      validateWelcomeScreenSerial(item.WelcomeScreenSerial, wall.ChargingWallId);
    }
  }
  const station = { CheckInStationId: nextId(db.CheckInStations, 'CheckInStationId'), Name: String(payload.Name || '').trim(), StoreId: Number(payload.StoreId) };
  db.CheckInStations.push(station);
  wallsPayload.forEach((item, index) => {
    const wall = db.ChargingWalls.find(w => Number(w.ChargingWallId) === Number(item.ChargingWallId));
    if (!wall) return;
    wall.CheckInStationId = station.CheckInStationId;
    wall.ChargingWallIndex = index;
  });
  writeDb(db);
  return station;
}
module.exports = {
  getDb,
  resetDbToDefault,
  getCustomers,
  getStoresByCustomer,
  getWallModels,
  createWall,
  getUnassignedWalls,
  getUnassignedWallBySerial,
  getWallDetails,
  allocateSlotNfcSerials,
  saveWallConfiguration,
  createCheckInStation,
  findWelcomeScreenBySerial,
  validateWelcomeScreenSerial
};

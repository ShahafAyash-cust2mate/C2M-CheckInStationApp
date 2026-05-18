let retailerStoresCache = new Map();
'use strict';

const settingsService = require('../settings/settingsService.cjs');
const logger = require('../utils/logger.cjs');

let tokenCache = { accessToken: '', expiresAt: 0, key: '' };

function trimSlash(value) { return String(value || '').trim().replace(/\/+$/, ''); }

function normalizeRetailerBaseUrl(value) {
  let base = String(value || '').trim();
  if (!base) base = 'https://customer1.cart.dev.do-c2m.com/retailer/v1';
  base = base.replace(/\/docs\/?#?\/?$/i, '');
  base = base.replace(/\/docs#\/?$/i, '');
  base = base.replace(/\/docs.*$/i, '');
  base = trimSlash(base);
  if (/\/retailer$/i.test(base)) base = `${base}/v1`;
  return base;
}
function toCamelStatus(value) {
  if (value === undefined || value === null || value === '') return 'unknown';
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (v === 'pass' || v === 'passed' || v === '1') return 'pass';
    if (v === 'fail' || v === 'failed' || v === '2') return 'fail';
    return 'unknown';
  }
  const n = Number(value || 0);
  if (n === 1) return 'pass';
  if (n === 2) return 'fail';
  return 'unknown';
}
function toLocalStatus(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  const v = String(value).toLowerCase();
  if (v === 'pass' || v === 'passed' || v === '1') return 1;
  if (v === 'fail' || v === 'failed' || v === '2') return 2;
  return 0;
}
function errFromBody(status, text) {
  try {
    const j = JSON.parse(text || '{}');
    return j.message || j.error || text || `HTTP ${status}`;
  } catch {
    return text || `HTTP ${status}`;
  }
}
function getConfig() {
  const s = settingsService.readSettings();
  const cloudBaseUrl = trimSlash(s.cloudBaseUrl || s.cloudApiBaseUrl || '');
  const tokenUrl = String(s.cloudTokenUrl || '').trim() || (cloudBaseUrl ? `${cloudBaseUrl.replace(/\/check-in-stations$/,'')}/oauth2/token` : '');
  return {
    enabled: true,
    cloudBaseUrl,
    retailerBaseUrl: normalizeRetailerBaseUrl(s.retailerBaseUrl),
    tokenUrl,
    clientId: String(s.cloudClientId || '').trim(),
    clientSecret: String(s.cloudClientSecret || ''),
    timeoutMs: Number(s.cloudRequestTimeoutMs || 30000)
  };
}
function ensureConfig(cfg) {
    if (!cfg.cloudBaseUrl) throw new Error('Cloud Base URL is missing in Settings');
  if (!cfg.tokenUrl) throw new Error('Cloud Token URL is missing in Settings');
  if (!cfg.clientId || !cfg.clientSecret) throw new Error('Cloud OAuth client ID/secret are missing in Settings');
}
async function withTimeout(promise, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await promise(ac.signal); }
  finally { clearTimeout(t); }
}
async function getAccessToken() {
  const cfg = getConfig();
  ensureConfig(cfg);
  logger.info('OAuth token request/config', { tokenUrl: cfg.tokenUrl, clientId: cfg.clientId });
  const key = `${cfg.tokenUrl}|${cfg.clientId}`;
  if (tokenCache.accessToken && tokenCache.key === key && Date.now() < tokenCache.expiresAt - 30000) { logger.info('OAuth token cache hit', { tokenUrl: cfg.tokenUrl, clientId: cfg.clientId }); return tokenCache.accessToken; }

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`, 'ascii').toString('base64');
  const resp = await withTimeout((signal) => fetch(cfg.tokenUrl, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  }), cfg.timeoutMs);
  const text = await resp.text();
  if (!resp.ok) { logger.error('OAuth token request failed', { status: resp.status, response: text }); throw new Error(`Cloud token request failed: ${errFromBody(resp.status, text)}`); }
  const json = text ? JSON.parse(text) : {};
  if (!json.access_token) throw new Error('Cloud token response did not include access_token');
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in || 3300) * 1000,
    key
  };
  logger.info('OAuth token request success', { tokenUrl: cfg.tokenUrl, expiresIn: json.expires_in || 3300 });
  return tokenCache.accessToken;
}
function apiPath(path) {
  const cfg = getConfig();
  ensureConfig(cfg);
  const base = cfg.cloudBaseUrl.endsWith('/check-in-stations') ? cfg.cloudBaseUrl : `${cfg.cloudBaseUrl}/check-in-stations`;
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
async function request(path, options = {}) {
  const cfg = getConfig();
  const token = await getAccessToken();
  const method = options.method || 'GET';
  const url = apiPath(path);
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  logger.info('Cloud API request', { method, path, url, body: options.body });
  const started = Date.now();
  try {
    const resp = await withTimeout((signal) => fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal
    }), cfg.timeoutMs);
    const text = await resp.text();
    logger.info('Cloud API response', { method, path, url, status: resp.status, ok: resp.ok, durationMs: Date.now() - started, response: text });
    if (!resp.ok) throw new Error(`Cloud API ${method} ${path} failed: ${errFromBody(resp.status, text)}`);
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    logger.error('Cloud API request failed', { method, path, url, durationMs: Date.now() - started, message: error.message || String(error), stack: error.stack });
    throw error;
  }
}
async function requestAbsolute(url, options = {}) {
  const cfg = getConfig();
  const token = await getAccessToken();
  const method = options.method || 'GET';
  logger.info('Cloud API absolute request', { method, url, body: options.body });
  const started = Date.now();
  try {
    const resp = await withTimeout((signal) => fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal
    }), cfg.timeoutMs);
    const text = await resp.text();
    logger.info('Cloud API absolute response', { method, url, status: resp.status, ok: resp.ok, durationMs: Date.now() - started, response: text });
    if (!resp.ok) throw new Error(`Cloud API ${method} ${url} failed: ${errFromBody(resp.status, text)}`);
    return text ? JSON.parse(text) : null;
  } catch (error) {
    logger.error('Cloud API absolute request failed', { method, url, durationMs: Date.now() - started, message: error.message || String(error), stack: error.stack });
    throw error;
  }
}
function firstDefined(...values) { return values.find(v => v !== undefined && v !== null); }
function modelToLocal(m) {
  if (!m) return null;
  return {
    ChargingWallModelId: firstDefined(m.ChargingWallModelId, m.chargingWallModelId),
    Description: firstDefined(m.Description, m.description, m.ModelDescription, m.modelDescription, m.DisplayName, m.displayName, m.Name, m.name, ''),
    Model: firstDefined(m.Model, m.model),
    RowCount: firstDefined(m.RowCount, m.rowCount),
    ColumnCount: firstDefined(m.ColumnCount, m.columnCount),
    HasWelcomeScreen: Boolean(firstDefined(m.HasWelcomeScreen, m.hasWelcomeScreen, false)),
    WelcomeScreenRowNumber: firstDefined(m.WelcomeScreenRowNumber, m.welcomeScreenRowNumber, null),
    WelcomeScreenColumnNumber: firstDefined(m.WelcomeScreenColumnNumber, m.welcomeScreenColumnNumber, null),
    WelcomeScreenRowSize: firstDefined(m.WelcomeScreenRowSize, m.welcomeScreenRowSize, null),
    WelcomeScreenColumnSize: firstDefined(m.WelcomeScreenColumnSize, m.welcomeScreenColumnSize, null)
  };
}
function slotNumber(model, row, col) { return Number(row) * Number(model?.ColumnCount || model?.columnCount || 0) + Number(col) + 1; }
function isScreenCell(model, row, col) {
  const m = modelToLocal(model);
  if (!m?.HasWelcomeScreen) return false;
  return row >= m.WelcomeScreenRowNumber && row < m.WelcomeScreenRowNumber + m.WelcomeScreenRowSize && col >= m.WelcomeScreenColumnNumber && col < m.WelcomeScreenColumnNumber + m.WelcomeScreenColumnSize;
}
function generatedFallbackTag(wallId, slotNum) {
  return `CW${String(wallId).padStart(4, '0')}${String(slotNum).padStart(4, '0')}`;
}
function slotToLocal(s, model = null, wallId = null) {
  const localModel = modelToLocal(model);
  const rowNumber = firstDefined(s.RowNumber, s.rowNumber, null);
  const columnNumber = firstDefined(s.ColumnNumber, s.columnNumber, null);
  const sn = rowNumber === null || columnNumber === null ? firstDefined(s.SlotNumber, s.slotNumber, null) : slotNumber(localModel, rowNumber, columnNumber);
  const tag = firstDefined(s.NFCTag, s.nfcTag, s.NFCCode, s.nfcCode, '');
  return {
    SlotNumber: sn,
    ChargingSlotId: firstDefined(s.ChargingSlotId, s.chargingSlotId, null),
    ChargingWallId: firstDefined(s.ChargingWallId, s.chargingWallId, wallId),
    NFCId: firstDefined(s.NFCId, s.nfcId, ''),
    NFCTag: tag,
    NFCCode: tag,
    RowNumber: rowNumber,
    ColumnNumber: columnNumber,
    Status: toLocalStatus(firstDefined(s.Status, s.status, 0))
  };
}
function wallToLocal(w) {
  if (!w) return null;
  const model = modelToLocal(firstDefined(w.ModelInfo, w.modelInfo, w.model, null));
  return {
    ChargingWallId: firstDefined(w.ChargingWallId, w.chargingWallId),
    ChargingWallModelId: firstDefined(w.ChargingWallModelId, w.chargingWallModelId, model?.ChargingWallModelId),
    CheckInStationId: firstDefined(w.CheckInStationId, w.checkInStationId, null),
    SerialNumber: firstDefined(w.SerialNumber, w.serialNumber),
    ChargingWallIndex: firstDefined(w.ChargingWallIndex, w.chargingWallIndex, null),
    Status: toLocalStatus(firstDefined(w.Status, w.status, 0)),
    ModelInfo: model,
    WelcomeScreenSerial: firstDefined(w.WelcomeScreenSerial, w.welcomeScreenSerial, ''),
    Slots: (firstDefined(w.Slots, w.slots, []) || []).map(s => slotToLocal(s, model, firstDefined(w.ChargingWallId, w.chargingWallId)))
  };
}
function stationToLocal(s) {
  return {
    CheckInStationId: firstDefined(s.CheckInStationId, s.checkInStationId),
    Name: firstDefined(s.Name, s.name),
    StoreId: firstDefined(s.StoreId, s.storeId),
    Walls: (firstDefined(s.Walls, s.walls, []) || []).map(wallToLocal)
  };
}
function slotToRemote(s) {
  return {
    ...(s.ChargingSlotId ? { chargingSlotId: Number(s.ChargingSlotId) } : {}),
    ...(s.ChargingWallId ? { chargingWallId: Number(s.ChargingWallId) } : {}),
    nfcId: String(s.NFCId || s.nfcId || ''),
    nfcTag: String(s.NFCTag || s.NFCCode || s.nfcTag || ''),
    rowNumber: Number(s.RowNumber ?? s.rowNumber),
    columnNumber: Number(s.ColumnNumber ?? s.columnNumber),
    status: toCamelStatus(firstDefined(s.Status, s.status, 0))
  };
}
function createSlotsFromModel(wall) {
  const model = wall.ModelInfo;
  const slots = [];
  if (!model) return slots;
  for (let r = 0; r < Number(model.RowCount || 0); r++) {
    for (let c = 0; c < Number(model.ColumnCount || 0); c++) {
      if (isScreenCell(model, r, c)) continue;
      const sn = slotNumber(model, r, c);
      const tag = generatedFallbackTag(wall.ChargingWallId, sn);
      slots.push({
        SlotNumber: sn,
        ChargingSlotId: null,
        ChargingWallId: wall.ChargingWallId,
        NFCId: '',
        NFCTag: tag,
        NFCCode: tag,
        RowNumber: r,
        ColumnNumber: c,
        Status: 0
      });
    }
  }
  return slots;
}
async function getWallModels() { return (await request('/charging-wall-models')).map(modelToLocal); }
async function createWall(payload) {
  const body = {
    serialNumber: payload.SerialNumber,
    chargingWallModelId: Number(payload.ChargingWallModelId),
    ...(payload.WelcomeScreenSerialNumber ? { welcomeScreenSerialNumber: payload.WelcomeScreenSerialNumber } : {})
  };
  const row = wallToLocal(await request('/charging-walls', { method: 'POST', body }));
  if (!row.Slots?.length) row.Slots = createSlotsFromModel(row);
  return { ...row, Slots: row.Slots };
}
async function listWalls(params = {}) {
  const qs = new URLSearchParams();
  if (params.checkInStationId !== undefined && params.checkInStationId !== null) qs.set('checkInStationId', String(params.checkInStationId));
  if (params.serial) qs.set('serial', String(params.serial));
  const list = await request(`/charging-walls${qs.toString() ? `?${qs}` : ''}`);
  return (list || []).map(wallToLocal);
}
async function getUnassignedWalls() { return listWalls({ checkInStationId: '' }).catch(() => listWalls()); }
async function getUnassignedWallBySerial(serialNumber) {
  const serial = String(serialNumber || '').trim();
  if (!serial) throw new Error('Charging wall serial is required');
  const walls = await listWalls({ serial });
  const wall = walls.find(w => String(w.SerialNumber || '').toUpperCase() === serial.toUpperCase()) || walls[0];
  if (!wall) throw new Error(`Charging wall serial was not found in cloud: ${serial}`);
  return wall;
}
async function getWallDetails(id) {
  const wall = wallToLocal(await request(`/charging-walls/${Number(id)}`));
  return {
    wall,
    model: wall.ModelInfo,
    welcomeScreen: wall.WelcomeScreenSerial ? { ChargingWallId: wall.ChargingWallId, SerialNumber: wall.WelcomeScreenSerial } : null
  };
}
async function allocateSlotNfcSerials(id) {
  const wall = wallToLocal(await request(`/charging-walls/${Number(id)}`));
  if (wall.Slots && wall.Slots.length) return wall.Slots;
  return createSlotsFromModel(wall);
}
async function saveWallConfiguration(payload) {
  const body = {
    ...(payload.WelcomeScreenSerialNumber ? { welcomeScreenSerialNumber: payload.WelcomeScreenSerialNumber } : {}),
    ...(payload.Status !== undefined && payload.Status !== null ? { status: toCamelStatus(payload.Status) } : {}),
    slots: (payload.Slots || []).map(slotToRemote)
  };
  const r = await request(`/charging-walls/${Number(payload.ChargingWallId)}/slots`, { method: 'PUT', body });
  return { ok: Boolean(r?.ok ?? true), SlotCount: firstDefined(r?.SlotCount, r?.slotCount, body.slots.length), Status: toLocalStatus(firstDefined(r?.Status, r?.status, payload.Status ?? 0)) };
}
async function createCheckInStation(payload) {
  const body = {
    name: payload.Name,
    storeId: Number(payload.StoreId),
    walls: (payload.Walls || []).map(w => ({ chargingWallId: Number(w.ChargingWallId) }))
  };
  const r = await request('', { method: 'POST', body });
  return stationToLocal(r);
}
async function validateWelcomeScreenSerial(serialNumber, chargingWallId = null) {
  const qs = new URLSearchParams();
  qs.set('serialNumber', serialNumber);
  if (chargingWallId) qs.set('chargingWallId', String(chargingWallId));
  const list = await request(`/welcome-screens?${qs}`);
  const screen = Array.isArray(list) ? list[0] : list;
  if (!screen) throw new Error(`Welcome screen serial was not found in cloud: ${serialNumber}`);
  return {
    WelcomeScreenId: firstDefined(screen.WelcomeScreenId, screen.welcomeScreenId),
    ChargingWallId: firstDefined(screen.ChargingWallId, screen.chargingWallId),
    SerialNumber: firstDefined(screen.SerialNumber, screen.serialNumber),
    WelcomeScreenDeviceId: firstDefined(screen.WelcomeScreenDeviceId, screen.welcomeScreenDeviceId, null)
  };
}
async function getDb() {
  const stations = (await request('')).map(stationToLocal);
  const db = { Customers: [], Stores: [], ChargingWallModels: [], CheckInStations: [], ChargingWalls: [], ChargingSlots: [], WelcomeScreens: [] };
  db.CheckInStations = stations.map(s => ({ CheckInStationId: s.CheckInStationId, Name: s.Name, StoreId: s.StoreId }));
  for (const st of stations) {
    for (const w of st.Walls || []) {
      db.ChargingWalls.push({ ChargingWallId: w.ChargingWallId, ChargingWallModelId: w.ChargingWallModelId, CheckInStationId: st.CheckInStationId, SerialNumber: w.SerialNumber, ChargingWallIndex: w.ChargingWallIndex, Status: w.Status, ModelInfo: w.ModelInfo, WelcomeScreenSerial: w.WelcomeScreenSerial, Slots: w.Slots });
      if (w.WelcomeScreenSerial) db.WelcomeScreens.push({ WelcomeScreenId: null, ChargingWallId: w.ChargingWallId, SerialNumber: w.WelcomeScreenSerial });
      db.ChargingSlots.push(...(w.Slots || []));
    }
  }
  return db;
}

function unwrapList(payload, names = []) {
  if (Array.isArray(payload)) return payload;
  for (const name of names) {
    if (Array.isArray(payload?.[name])) return payload[name];
  }
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function tryRequests(paths, absoluteUrls = []) {
  let lastError = null;
  for (const path of paths) {
    try { return await request(path); } catch (e) { lastError = e; logger.warn('Cloud API fallback failed', { path, message: e.message || String(e) }); }
  }
  for (const url of absoluteUrls) {
    try { return await requestAbsolute(url); } catch (e) { lastError = e; logger.warn('Cloud API absolute fallback failed', { url, message: e.message || String(e) }); }
  }
  throw lastError || new Error('Cloud API request failed');
}

function deviceManagementBaseUrl() {
  const cfg = getConfig();
  const base = cfg.cloudBaseUrl ? String(cfg.cloudBaseUrl).replace(/\/check-in-stations$/,'') : '';
  if (!base) throw new Error('Cloud Base URL is missing in Settings');
  return base;
}

function retailerBaseUrlCandidates() {
  const cfg = getConfig();
  return [normalizeRetailerBaseUrl(cfg.retailerBaseUrl)];
}

async function getCustomers() {
  // v85: restored the exact retailer root call that worked earlier:
  // GET https://customer1.cart.dev.do-c2m.com/retailer/v1/retailers
  // Stores are cached from this same response; no second store API call.
  const base = retailerBaseUrlCandidates()[0];
  const url = `${base}/retailers`;
  logger.info('v85 Retailer API getCustomers direct with embedded stores', { url });
  const payload = await requestAbsolute(url);

  retailerStoresCache = new Map();

  const list = unwrapList(payload, ['retailers', 'customers']);
  return list.map(r => {
    const retailerId = firstDefined(r.CustomerId, r.customerId, r.retailerId, r.id);
    const stores = unwrapList(r.stores || r.Stores || [], ['stores']).map(s => ({
      StoreId: firstDefined(s.StoreId, s.storeId, s.id),
      CustomerId: firstDefined(s.CustomerId, s.customerId, s.retailerId, retailerId),
      StoreName: firstDefined(s.StoreName, s.storeName, s.Name, s.name, s.displayName),
      RetailerStoreId: firstDefined(s.retailerStoreId, s.RetailerStoreId)
    })).filter(s => s.StoreId !== undefined && s.StoreId !== null);

    if (retailerId !== undefined && retailerId !== null) {
      retailerStoresCache.set(String(retailerId), stores);
    }

    return {
      CustomerId: retailerId,
      CustomerName: firstDefined(r.CustomerName, r.customerName, r.Name, r.name, r.displayName),
      Stores: stores
    };
  }).filter(r => r.CustomerId !== undefined && r.CustomerId !== null);
}

async function getStoresByCustomer(customerId) {
  // v85: stores are taken from getCustomers() response only.
  const key = String(customerId);
  if (retailerStoresCache.has(key)) {
    logger.info('v85 getStoresByCustomer using embedded retailer stores cache', {
      retailerId: customerId,
      count: retailerStoresCache.get(key).length
    });
    return retailerStoresCache.get(key);
  }

  await getCustomers();
  return retailerStoresCache.get(key) || [];
}


async function resetDbToDefault() {
  logger.info('resetDbToDefault ignored: real cloud mode only');
  return { ok: true, cloudOnly: true };
}


async function getFullState() {
  logger.info('getFullState called in real cloud mode');
  const stations = await getStations();
  return { cloudOnly: true, stations };
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
  validateWelcomeScreenSerial,
  toLocalStatus,
  toCamelStatus
};


'use strict';

const BLE_SERVICE_UUID = 'fff0';
const BLE_RX_UUID = 'fff1';
const BLE_TX_UUID = 'fff2';
const BLE_SCAN_TIMEOUT_MS = 10000;
const BLE_READY_TIMEOUT_MS = 15000;
const BLE_CONNECT_TIMEOUT_MS = 10000;
const BLE_DISCOVER_TIMEOUT_MS = 10000;
const LINE_DELIMITER = '\r\n';
const VERSION_COMMAND = Buffer.from('VERSON?', 'ascii');
const VERSION_RESPONSE_REGEX = /^V\d.*$/;

let noble = null;
let activeConnection = null;
let lastScannerValue = '';

function getNoble() {
  if (noble) return noble;

  const mod = require('@stoprocent/noble');

  if (mod && typeof mod.withBindings === 'function') {
    noble = mod.withBindings('win');
  } else if (mod && mod.default && typeof mod.default.withBindings === 'function') {
    noble = mod.default.withBindings('win');
  } else if (mod && mod.noble && typeof mod.noble.startScanning === 'function') {
    noble = mod.noble;
  } else if (mod && mod.default && typeof mod.default.startScanning === 'function') {
    noble = mod.default;
  } else {
    noble = mod;
  }

  if (!noble || typeof noble.startScanning !== 'function') {
    throw new Error('@stoprocent/noble did not expose a usable noble instance');
  }

  noble.setMaxListeners?.(50);
  return noble;
}

function normalizeMac(mac) {
  return String(mac || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

function isValidMacFragment(value) {
  const normalized = normalizeMac(value);
  return normalized.length >= 6 && normalized.length <= 12 && /^[0-9a-f]+$/.test(normalized);
}

function formatMacAddress(mac) {
  const normalized = normalizeMac(mac);
  return normalized.match(/.{1,2}/g)?.join(':') ?? String(mac || '');
}

function peripheralToDto(peripheral) {
  const raw = normalizeMac(peripheral.address || peripheral.id || peripheral.uuid || '');
  return {
    id: peripheral.id || '',
    uuid: peripheral.uuid || '',
    address: peripheral.address || '',
    mac: formatMacAddress(raw),
    rawMac: raw,
    name: peripheral.advertisement?.localName || '',
    rssi: peripheral.rssi,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopScanningSafe() {
  const n = getNoble();
  try { n.stopScanning(); } catch {}
  await wait(150);
}

function waitForAdapterReady() {
  const n = getNoble();

  return new Promise((resolve, reject) => {
    if (n.state === 'poweredOn') return resolve();

    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      n.removeListener('stateChange', onStateChange);
      err ? reject(err) : resolve();
    };

    const timeout = setTimeout(() => {
      finish(new Error(`BLE adapter not ready (state: ${n.state}) after ${BLE_READY_TIMEOUT_MS}ms`));
    }, BLE_READY_TIMEOUT_MS);

    const onStateChange = (state) => {
      if (state === 'poweredOn') finish();
      else if (state === 'unsupported' || state === 'unauthorized') finish(new Error(`BLE adapter unusable (state: ${state})`));
    };

    n.on('stateChange', onStateChange);
  });
}

/**
 * scanForPeripheral(macAddress) returns the matching peripheral object.
 */
async function scanForPeripheral(macAddress, timeoutMs = BLE_SCAN_TIMEOUT_MS) {
  const n = getNoble();
  const macFragment = normalizeMac(macAddress);

  if (!isValidMacFragment(macFragment)) {
    throw new Error(`Invalid scanner MAC address / fragment: "${macAddress}". Enter 6-12 hex characters.`);
  }

  await waitForAdapterReady();
  await stopScanningSafe();

  return await new Promise((resolve, reject) => {
    let settled = false;
    const discovered = [];

    const finish = (err, peripheral) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      n.removeListener('discover', onDiscover);
      try { n.stopScanning(); } catch {}
      err ? reject(err) : resolve(peripheral);
    };

    const onDiscover = (peripheral) => {
      const dto = peripheralToDto(peripheral);
      const label = `${dto.mac || dto.rawMac || dto.id || dto.uuid}${dto.name ? ' (' + dto.name + ')' : ''}`;
      discovered.push(label);

      const candidates = [peripheral.address, peripheral.id, peripheral.uuid].map(normalizeMac);
      if (candidates.some((value) => value && value.includes(macFragment))) {
        finish(null, peripheral);
      }
    };

    const timeout = setTimeout(() => {
      const suffix = discovered.length
        ? ` Discovered: ${discovered.slice(0, 10).join(', ')}`
        : ' No BLE advertisements were discovered.';
      finish(new Error(`Scanner [${macAddress}] not found within ${timeoutMs}ms.${suffix}`));
    }, Number(timeoutMs || BLE_SCAN_TIMEOUT_MS));

    n.on('discover', onDiscover);

    try {
      n.startScanning([], false);
    } catch (err) {
      finish(err);
    }
  });
}

/**
 * connectPeripheral(peripheral) receives the peripheral returned by scanForPeripheral and connects.
 */
function connectPeripheral(peripheral, timeoutMs = BLE_CONNECT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!peripheral) return reject(new Error('connectPeripheral received empty peripheral'));
    if (peripheral.state === 'connected') return resolve(peripheral);

    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      err ? reject(err) : resolve(peripheral);
    };

    const timeout = setTimeout(() => {
      finish(new Error(`Scanner peripheral connect timeout after ${timeoutMs}ms`));
    }, Number(timeoutMs || BLE_CONNECT_TIMEOUT_MS));

    try {
      peripheral.connect((err) => finish(err));
    } catch (err) {
      finish(err);
    }
  });
}

function disconnectPeripheral(peripheral) {
  return new Promise((resolve) => {
    if (!peripheral || peripheral.state === 'disconnected') return resolve();
    try { peripheral.disconnect(() => resolve()); }
    catch { resolve(); }
  });
}

function discoverCharacteristics(peripheral, timeoutMs = BLE_DISCOVER_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, chars) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      err ? reject(err) : resolve(chars || []);
    };

    const timeout = setTimeout(() => {
      finish(new Error(`Scanner BLE characteristic discovery timeout after ${timeoutMs}ms`));
    }, Number(timeoutMs || BLE_DISCOVER_TIMEOUT_MS));

    try {
      peripheral.discoverSomeServicesAndCharacteristics(
        [BLE_SERVICE_UUID],
        [BLE_RX_UUID, BLE_TX_UUID],
        (err, _services, characteristics) => finish(err, characteristics)
      );
    } catch (err) {
      finish(err);
    }
  });
}

function subscribeCharacteristic(characteristic, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      err ? reject(err) : resolve();
    };

    const timeout = setTimeout(() => {
      finish(new Error(`Scanner RX subscribe timeout after ${timeoutMs}ms`));
    }, Number(timeoutMs || 5000));

    try {
      characteristic.subscribe((err) => finish(err));
    } catch (err) {
      finish(err);
    }
  });
}

async function closeActiveConnection() {
  if (!activeConnection?.peripheral) {
    activeConnection = null;
    return;
  }

  const peripheral = activeConnection.peripheral;
  if (activeConnection?.rx && activeConnection?.onData) {
    activeConnection.rx.removeListener('data', activeConnection.onData);
  }
  activeConnection = null;
  await disconnectPeripheral(peripheral);
}

function attachPersistentScannerListener(conn) {
  if (!conn?.rx || conn.onData) return;

  conn.rxBuffer = '';

  conn.onData = (data) => {
    conn.rxBuffer += data.toString('ascii');
    const lines = conn.rxBuffer.split(LINE_DELIMITER);
    conn.rxBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (VERSION_RESPONSE_REGEX.test(trimmed)) {
        conn.lastVersion = trimmed;
        continue;
      }

      lastScannerValue = trimmed;
      conn.lastValue = trimmed;
      conn.lastValueAt = Date.now();
    }
  };

  conn.rx.on('data', conn.onData);
}

async function openScanner(macAddress, timeoutMs = BLE_SCAN_TIMEOUT_MS) {
  const normalizedMac = normalizeMac(macAddress);

  if (
    activeConnection?.peripheral &&
    activeConnection?.peripheralInfo?.rawMac?.includes(normalizedMac) &&
    activeConnection.peripheral.state === 'connected'
  ) {
    return activeConnection;
  }

  await closeActiveConnection();

  const peripheral = await scanForPeripheral(macAddress, timeoutMs);
  await connectPeripheral(peripheral);

  const chars = await discoverCharacteristics(peripheral);
  const rx = chars.find((c) => c.uuid === BLE_RX_UUID);
  const tx = chars.find((c) => c.uuid === BLE_TX_UUID);

  if (!rx || !tx) {
    await disconnectPeripheral(peripheral);
    throw new Error(`Scanner connected but required BLE characteristics were not found. RX=${Boolean(rx)}, TX=${Boolean(tx)}`);
  }

  await subscribeCharacteristic(rx);
  await wait(500);

  const peripheralInfo = peripheralToDto(peripheral);
  activeConnection = { peripheral, rx, tx, peripheralInfo, onData: null, rxBuffer: '', lastValue: '', lastValueAt: 0, lastVersion: '' };
  attachPersistentScannerListener(activeConnection);

  peripheral.once('disconnect', () => {
    if (activeConnection?.peripheral === peripheral) activeConnection = null;
  });

  return activeConnection;
}

/**
 * Connect/test only opens and keeps the BLE connection.
 * It does not send any command.
 */
async function testConnection(macAddress) {
  try {
    const conn = await openScanner(macAddress, BLE_SCAN_TIMEOUT_MS);
    return {
      connected: true,
      ...conn.peripheralInfo,
      message: 'Scanner connected',
    };
  } catch (err) {
    return {
      connected: false,
      mac: formatMacAddress(macAddress),
      rawMac: normalizeMac(macAddress),
      message: err?.message || String(err),
    };
  }
}

function writeCharacteristic(characteristic, data, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      err ? reject(err) : resolve();
    };
    const timeout = setTimeout(() => finish(new Error(`Scanner write command timeout after ${timeoutMs}ms`)), Number(timeoutMs || 5000));
    try {
      characteristic.write(data, true, (err) => finish(err));
    } catch (err) {
      finish(err);
    }
  });
}

async function getVersion(macAddress, timeoutMs = 5000) {
  const conn = await openScanner(macAddress, BLE_SCAN_TIMEOUT_MS);
  conn.lastVersion = '';

  await writeCharacteristic(conn.tx, VERSION_COMMAND, timeoutMs);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (conn.lastVersion) {
      return { connected: true, version: conn.lastVersion, ...conn.peripheralInfo, message: `Scanner version: ${conn.lastVersion}` };
    }
    await wait(50);
  }

  return { connected: true, version: '', ...conn.peripheralInfo, message: 'Scanner connected, no version response' };
}

async function readScan(macAddress, timeoutMs = 20000) {
  const conn = await openScanner(macAddress, BLE_SCAN_TIMEOUT_MS);

  if (conn.lastValue) {
    const value = conn.lastValue;
    conn.lastValue = '';
    return { value, ...conn.peripheralInfo };
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const baseline = conn.lastValueAt || 0;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timeout);
      err ? reject(err) : resolve(value);
    };

    const interval = setInterval(() => {
      if (conn.lastValue && conn.lastValueAt > baseline) {
        const value = conn.lastValue;
        conn.lastValue = '';
        finish(null, { value, ...conn.peripheralInfo });
      }
    }, 50);

    const timeout = setTimeout(
      () => finish(new Error(`No scanner data received within ${timeoutMs}ms`)),
      Number(timeoutMs || 20000)
    );
  });
}

function getLastValue() {
  if (activeConnection?.lastValue) {
    const value = activeConnection.lastValue;
    activeConnection.lastValue = '';
    return { hasValue: true, value, ...activeConnection.peripheralInfo };
  }

  if (lastScannerValue) {
    const value = lastScannerValue;
    lastScannerValue = '';
    return { hasValue: true, value };
  }

  return { hasValue: false, value: '' };
}

async function scanAvailable(timeoutMs = 10000) {
  await waitForAdapterReady();
  await stopScanningSafe();

  const n = getNoble();
  const found = [];

  return await new Promise((resolve, reject) => {
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      n.removeListener('discover', onDiscover);
      try { n.stopScanning(); } catch {}
      err ? reject(err) : resolve(found);
    };

    const onDiscover = (peripheral) => {
      const dto = peripheralToDto(peripheral);
      if (!found.some((x) => x.rawMac === dto.rawMac || x.id === dto.id || x.uuid === dto.uuid)) found.push(dto);
    };

    const timeout = setTimeout(() => finish(), Number(timeoutMs || 10000));

    n.on('discover', onDiscover);

    try {
      n.startScanning([], false);
    } catch (err) {
      finish(err);
    }
  });
}

async function disconnectScanner() {
  await closeActiveConnection();
  return { connected: false, message: 'Scanner disconnected' };
}

function getConnectionStatus() {
  if (activeConnection?.peripheral?.state === 'connected') {
    return { connected: true, ...activeConnection.peripheralInfo, message: 'Scanner connected', lastValue: activeConnection.lastValue || '' };
  }

  return { connected: false, message: 'Scanner disconnected' };
}

module.exports = {
  normalizeMac,
  isValidMacFragment,
  formatMacAddress,
  scanForPeripheral,
  connectPeripheral,
  disconnectScanner,
  getConnectionStatus,
  testConnection,
  getVersion,
  readScan,
  getLastValue,
  scanAvailable,
};

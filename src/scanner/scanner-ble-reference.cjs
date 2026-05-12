'use strict';

const { withBindings } = require('@stoprocent/noble');

const BLE_SERVICE_UUID = 'fff0';
const BLE_RX_UUID = 'fff1';
const BLE_TX_UUID = 'fff2';
const BLE_SCAN_TIMEOUT_MS = 10000;
const BLE_READY_TIMEOUT_MS = 15000;
const LINE_DELIMITER = '\r\n';
const VERSION_COMMAND = Buffer.from('VERSON?', 'ascii');
const VERSION_RESPONSE_REGEX = /^V\d.*$/;

const noble = withBindings('win');

function normalizeMac(mac) {
  return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

function isValidMac(normalized) {
  return normalized.length >= 6 && normalized.length <= 12 && /^[0-9a-f]+$/.test(normalized);
}

function matchesMacFragment(peripheralAddress, macFragment) {
  return normalizeMac(peripheralAddress).includes(macFragment);
}

function formatMacAddress(mac) {
  return normalizeMac(mac).match(/.{1,2}/g)?.join(':') ?? mac;
}

function fatal(message) {
  console.error(`[BLE] FATAL: ${message}`);
  process.exit(1);
}

function waitForAdapterReady() {
  return new Promise((resolve, reject) => {
    if (noble.state === 'poweredOn') {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      noble.removeListener('stateChange', onStateChange);
      reject(new Error(`BLE adapter not ready (state: ${noble.state}) after ${BLE_READY_TIMEOUT_MS}ms`));
    }, BLE_READY_TIMEOUT_MS);

    const onStateChange = (state) => {
      if (state === 'poweredOn') {
        clearTimeout(timeout);
        noble.removeListener('stateChange', onStateChange);
        resolve();
      } else if (state === 'unsupported' || state === 'unauthorized') {
        clearTimeout(timeout);
        noble.removeListener('stateChange', onStateChange);
        reject(new Error(`BLE adapter unusable (state: ${state})`));
      }
    };

    noble.on('stateChange', onStateChange);
  });
}

function scanForPeripheral(macAddress) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      noble.removeListener('discover', onDiscover);
      noble.stopScanning();
      reject(new Error(`Device [${macAddress}] not found within ${BLE_SCAN_TIMEOUT_MS}ms`));
    }, BLE_SCAN_TIMEOUT_MS);

    const onDiscover = (peripheral) => {
      if (matchesMacFragment(peripheral.address, macAddress)) {
        clearTimeout(timeout);
        noble.stopScanning();
        noble.removeListener('discover', onDiscover);
        resolve(peripheral);
      }
    };

    noble.on('discover', onDiscover);
    noble.startScanning([], false);
  });
}

function connectPeripheral(peripheral) {
  return new Promise((resolve, reject) => {
    peripheral.connect((err) => (err ? reject(err) : resolve()));
  });
}

function discoverCharacteristics(peripheral) {
  return new Promise((resolve, reject) => {
    peripheral.discoverSomeServicesAndCharacteristics([BLE_SERVICE_UUID], [BLE_RX_UUID, BLE_TX_UUID], (err, _services, chars) =>
      err ? reject(err) : resolve(chars),
    );
  });
}

function subscribeCharacteristic(characteristic) {
  return new Promise((resolve, reject) => {
    characteristic.subscribe((err) => (err ? reject(err) : resolve()));
  });
}

function writeCharacteristic(characteristic, data) {
  return new Promise((resolve, reject) => {
    characteristic.write(data, true, (err) => (err ? reject(err) : resolve()));
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const rawMac = process.argv[2];
  if (!rawMac) {
    fatal('Usage: node scanner-ble.js <MAC_ADDRESS>\n  Example: node scanner-ble.js AA:BB:CC:DD:EE:FF');
  }

  const macAddress = normalizeMac(rawMac);
  if (!isValidMac(macAddress)) {
    fatal(`Invalid MAC address: normalized: "${macAddress}", also should be 6-12 hex characters`);
  }

  await waitForAdapterReady();

  console.log(`Scanning for device [${macAddress}]...`);
  const peripheral = await scanForPeripheral(macAddress);
  console.log(`Found, Connecting to ${formatMacAddress(peripheral.address)}`);
  await connectPeripheral(peripheral);
  console.log(`Connected to ${formatMacAddress(peripheral.address)}`);

  // section Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (reason) => {
    if(shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`Shutting down gracefully: ${reason}`);
    noble.stopScanning();
    if (peripheral.state !== 'disconnected') {
      await new Promise((resolve) => peripheral.disconnect(() => resolve()));
    }
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  
  // end section

  peripheral.once('disconnect', () => {
    if (shuttingDown) {
      console.log('Peripheral disconnected');
    } else {
      fatal('Peripheral disconnected');
    }
  });

  const chars = await discoverCharacteristics(peripheral);
  const rx = chars.find((c) => c.uuid === BLE_RX_UUID);
  const tx = chars.find((c) => c.uuid === BLE_TX_UUID);

  if (!rx || !tx) {
    fatal(`Required characteristics not found (RX: ${!!rx}, TX: ${!!tx})`);
  }

  let rxBuffer = '';
  let firmwareResolved = false;

  rx.on('data', (data) => {
    rxBuffer += data.toString('ascii');
    const lines = rxBuffer.split(LINE_DELIMITER);
    rxBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      if (!firmwareResolved && VERSION_RESPONSE_REGEX.test(trimmed)) {
        firmwareResolved = true;
        console.log(`Firmware version: ${trimmed}`);
        continue;
      }

      console.log(trimmed);
    }
  });

  await subscribeCharacteristic(rx);
  await wait(500); // Scanner might disconnect if command sent too early after connection

  await writeCharacteristic(tx, VERSION_COMMAND);
}

main().catch((err) => {
  fatal(err.message || String(err));
});

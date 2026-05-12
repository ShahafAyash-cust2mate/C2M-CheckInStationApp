
'use strict';

const { SerialPort } = require('serialport');

const BAUD_RATE = 115200;
const RESPONSE_TIMEOUT_MS = 2500;
const AUTO_DETECT_TIMEOUT_MS = 3500;

let nextRequestId = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePayload(payloadRaw) {
  const payload = {};
  if (!payloadRaw) return payload;
  for (const token of String(payloadRaw).split(';')) {
    if (!token) continue;
    const idx = token.indexOf('=');
    if (idx <= 0) continue;
    payload[token.slice(0, idx)] = token.slice(idx + 1);
  }
  return payload;
}

function isStatusOk(payload) {
  return String(payload.status || '').toUpperCase() === 'OK';
}

function openPort(portPath) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path: portPath, baudRate: BAUD_RATE, autoOpen: false });
    port.open((err) => err ? reject(err) : resolve(port));
  });
}

function closePort(connection) {
  return new Promise((resolve) => {
    if (!connection || !connection.isOpen) return resolve();
    connection.close(() => resolve());
  });
}

function sendAndWait(connection, command, payload = '', timeoutMs = RESPONSE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!connection?.isOpen) {
      resolve(null);
      return;
    }

    const id = ++nextRequestId;
    const message = `REQ|${id}|${command}|${payload || ''}\n`;
    let buffer = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connection.removeListener('data', onData);
      resolve(result);
    };

    const onData = (data) => {
      buffer += data.toString('utf8');
      while (buffer.includes('\n')) {
        const newline = buffer.indexOf('\n');
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;

        const parts = line.split('|');
        if (parts.length !== 4) continue;
        const [type, idRaw, cmd, payloadRaw] = parts;
        if (type.toUpperCase() !== 'RES') continue;
        if (Number(idRaw) !== id) continue;
        if (String(cmd).toUpperCase() !== String(command).toUpperCase()) continue;

        const responsePayload = parsePayload(payloadRaw);
        finish({
          command,
          success: isStatusOk(responsePayload),
          payload: responsePayload,
          rawLine: line,
        });
      }
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    connection.on('data', onData);
    connection.write(message, (err) => {
      if (err) finish(null);
    });
  });
}

function parseBool01(value) {
  if (value === true || value === 'true' || value === 'True') return true;
  if (value === false || value === 'false' || value === 'False') return false;
  return String(value) === '1';
}

function parseBattery(payload) {
  return {
    batteryPercent: Number(payload.battery_percent ?? 0),
    charging: parseBool01(payload.charging),
    averageTimeToFullMinutes: Number(payload.average_time_to_full ?? -1),
    runTimeToEmptyMinutes: Number(payload.run_time_to_empty ?? -1),
    raw: payload,
  };
}

async function listSerialPorts() {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer || '',
    serialNumber: p.serialNumber || '',
    pnpId: p.pnpId || '',
    vendorId: p.vendorId || '',
    productId: p.productId || '',
    label: [p.path, p.manufacturer, p.pnpId].filter(Boolean).join(' | '),
  }));
}

function scorePort(port) {
  const text = `${port.path || ''} ${port.manufacturer || ''} ${port.pnpId || ''}`.toLowerCase();
  let score = 0;
  if (text.includes('arduino')) score += 100;
  if (text.includes('usb serial device')) score += 80;
  if (text.includes('vid_2341')) score += 60;
  if (text.includes('usb')) score += 35;
  if (text.includes('ch340') || text.includes('wch')) score += 30;
  if (text.includes('silicon labs') || text.includes('cp210')) score += 25;
  if (text.includes('ftdi')) score += 25;
  if (text.includes('acpi')) score -= 30;
  if (text.includes('standard port types')) score -= 20;
  return score;
}

async function testConnection(portPath) {
  let connection;
  try {
    connection = await openPort(portPath);

    // Many Arduino boards reset when the serial port opens.
    // Wait before the first command, then retry GET_VERSIONS several times.
    await sleep(1800);

    let version = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      version = await sendAndWait(connection, 'GET_VERSIONS', '', AUTO_DETECT_TIMEOUT_MS);
      if (version?.success) break;
      await sleep(400);
    }

    if (!version?.success) {
      return { connected: false, portPath, message: 'Arduino did not respond to GET_VERSIONS' };
    }

    return {
      connected: true,
      portPath,
      message: 'Arduino connected',
      version: version.payload.version || '',
      hardwareVersion: version.payload.hardware_version || '',
      revision: version.payload.revision || '',
      payload: version.payload,
    };
  } catch (err) {
    return { connected: false, portPath, message: err?.message || String(err) };
  } finally {
    await closePort(connection);
  }
}

async function autoDetectPort() {
  const ports = await listSerialPorts();
  const ordered = [...ports].sort((a, b) => scorePort(b) - scorePort(a));
  for (const port of ordered) {
    const result = await testConnection(port.path);
    if (result.connected) return { portPath: port.path, port, ...result };
  }
  return null;
}

async function execute(portPath, command, payload = '', timeoutMs = RESPONSE_TIMEOUT_MS) {
  let connection;
  try {
    connection = await openPort(portPath);
    await sleep(350);
    let result = await sendAndWait(connection, command, payload, timeoutMs);
    if (!result) {
      await sleep(800);
      result = await sendAndWait(connection, command, payload, timeoutMs);
    }
    if (!result) throw new Error(`${command} timed out`);
    if (!result.success) throw new Error(`${command} failed: ${JSON.stringify(result.payload)}`);
    return result;
  } finally {
    await closePort(connection);
  }
}

async function getBatteryStatus(portPath) {
  const result = await execute(portPath, 'GET_BATTERY');
  return parseBattery(result.payload);
}

async function isCharging(portPath) {
  const battery = await getBatteryStatus(portPath);
  return { charging: Boolean(battery.charging), battery };
}

async function sendCommandToArduino(portPath, command, payload = '', timeoutMs = RESPONSE_TIMEOUT_MS) {
  const result = await execute(portPath, command, payload, timeoutMs);
  return { ok: true, payload: result.payload };
}

async function turnLedOn(portPath, color = { red: 0, green: 255, blue: 0 }) {
  const payload = `red=${Number(color.red ?? 0)};green=${Number(color.green ?? 255)};blue=${Number(color.blue ?? 0)};on_duration=0;off_duration=0;time=0`;
  const result = await execute(portPath, 'TOP_LED_ON', payload);
  return { ok: true, payload: result.payload };
}

async function turnLedOff(portPath) {
  const result = await execute(portPath, 'TOP_LED_OFF');
  return { ok: true, payload: result.payload };
}

async function turnHandleLedOn(portPath, color = { red: 0, green: 255, blue: 0 }) {
  const payload = `red=${Number(color.red ?? 0)};green=${Number(color.green ?? 255)};blue=${Number(color.blue ?? 0)};on_duration=0;off_duration=0;time=0`;
  const candidateCommands = ['HANDLE_LED_ON', 'HANDLE_LED', 'BOTTOM_LED_ON', 'LED_HANDLE_ON'];
  let lastError = null;
  for (const command of candidateCommands) {
    try {
      const result = await execute(portPath, command, payload);
      return { ok: true, command, payload: result.payload };
    } catch (err) { lastError = err; }
  }
  throw lastError || new Error('Handle LED command failed');
}

async function turnHandleLedOff(portPath) {
  const candidateCommands = ['HANDLE_LED_OFF', 'BOTTOM_LED_OFF', 'LED_HANDLE_OFF'];
  let lastError = null;
  for (const command of candidateCommands) {
    try {
      const result = await execute(portPath, command);
      return { ok: true, command, payload: result.payload };
    } catch (err) { lastError = err; }
  }
  throw lastError || new Error('Handle LED off command failed');
}

async function openWall(portPath, durationMs = 10000) {
  // API doc:
  // REQ|38|OPEN_WALL|time_to_open=10\n
  // time_to_open is seconds, range 1..99.
  const seconds = Math.max(1, Math.min(99, Math.round(Number(durationMs || 10000) / 1000)));
  const result = await execute(portPath, 'OPEN_WALL', `time_to_open=${seconds}`, Math.max(RESPONSE_TIMEOUT_MS, (seconds * 1000) + 2000));
  return { ok: true, command: 'OPEN_WALL', time_to_open: seconds, payload: result.payload };
}


module.exports = {
  listSerialPorts,
  autoDetectPort,
  testConnection,
  getBatteryStatus,
  isCharging,
  turnLedOn,
  turnLedOff,
  turnHandleLedOn,
  turnHandleLedOff,
  openWall,
  sendCommandToArduino,
  _internal: { parsePayload, sendAndWait },
};


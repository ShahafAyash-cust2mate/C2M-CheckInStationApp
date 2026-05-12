#!/usr/bin/env node
'use strict';

/**
 * Standalone PN532 NFC Read/Write CLI Tool
 *
 * Communicates with a PN532 NFC chip over serial (UART) to detect,
 * read, and write MIFARE Ultralight NFC tags.
 *
 * Usage:
 *   npm install serialport
 *   node pn532.js
 */

const { SerialPort } = require('serialport');
const readline = require('readline');

// ───────────────────────────── PN532 Constants ──────────────────────────────

const PN532 = {
  // SAMConfiguration: normal mode, no timeout, no IRQ
  INIT_COMMAND: Buffer.from([
    0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x03, 0xfd, 0xd4,
    0x14, 0x01, 0x17, 0x00,
  ]),

  // InRelease — release all targets so they can be detected again
  IN_RELEASE_COMMAND: Buffer.from([
    0x00, 0x00, 0xff, 0x03, 0xfd, 0xd4, 0x52, 0x00, 0xda, 0x00,
  ]),

  // InListPassiveTarget — query for ISO14443A tags (max 2 targets)
  QUERY_COMMAND: Buffer.from([
    0x00, 0x00, 0xff, 0x04, 0xfc, 0xd4, 0x4a, 0x02, 0x00, 0xe0, 0x00,
  ]),

  ACK_FRAME: Buffer.from([0x00, 0x00, 0xff, 0x00, 0xff, 0x00]),
  FRAME_START: Buffer.from([0x00, 0x00, 0xff]),

  RESPONSE_TFI: 0xd5,
  INIT_RESPONSE_CODE: 0x15,
  IN_RELEASE_RESPONSE_CODE: 0x53,
  QUERY_RESPONSE_CODE: 0x4b,
  IN_DATA_EXCHANGE_RESPONSE_CODE: 0x41,

  FRAME_TOTAL_OVERHEAD: 7,
  LEN_OFFSET: 3,
  TFI_OFFSET: 5,
  RESPONSE_CODE_OFFSET: 6,
  NBTG_OFFSET: 7,
  TARGET_BLOCK_PREFIX_SIZE: 4,

  WRITE_PAGE_COMMAND_CODE: 0x40,
  WRITE_TARGET_NUMBER: 0x01,
  MIFARE_ULTRALIGHT_WRITE: 0xa2,
  MIFARE_ULTRALIGHT_READ: 0x30,

  DEFAULT_WRITE_START_PAGE: 4,
  LAST_WRITABLE_PAGE: 27,  // pages 28-31 = LOCK2-4 + CFG0 + CFG1 — do NOT write
  MAX_READ_PAGE: 44,       // try reading up to this page; stop on first failure
};

// MIFARE Ultralight / NTAG page map for display labels
const PAGE_LABELS = {
  0: 'UID/SN',
  1: 'UID/SN',
  2: 'UID/LOCK0',
  3: 'CC',
  4: 'DATA',
  5: 'DATA',
  28: 'LOCK2',
  29: 'LOCK3',
  30: 'LOCK4',
  31: 'CFG0',
  32: 'CFG1',
  // pages 33–44 exist on some NTAG variants
};

const COMMAND_TIMEOUT_MS = 5000;
const BAUD_RATE = 115200;

// ───────────────────────────── Frame Helpers ────────────────────────────────

function buildPn532Frame(payload) {
  const len = payload.length;
  const lcs = (0x100 - len) & 0xff;
  const dcs = (0x100 - payload.reduce((sum, b) => sum + b, 0)) & 0xff;
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0xff, len, lcs]),
    payload,
    Buffer.from([dcs, 0x00]),
  ]);
}

function getPn532ResponseFrame(buffer, startOffset = 0) {
  let frameStart = startOffset;

  while (frameStart < buffer.length) {
    frameStart = buffer.indexOf(PN532.FRAME_START, frameStart);
    if (frameStart < 0) return null;

    const bytesAvailable = buffer.length - frameStart;

    if (bytesAvailable < PN532.ACK_FRAME.length) return null;

    // Skip ACK frames
    if (buffer.subarray(frameStart, frameStart + PN532.ACK_FRAME.length).equals(PN532.ACK_FRAME)) {
      frameStart += PN532.ACK_FRAME.length;
      continue;
    }

    if (bytesAvailable < PN532.FRAME_TOTAL_OVERHEAD) return null;

    const LEN = buffer[frameStart + PN532.LEN_OFFSET];
    const totalFrameLength = PN532.FRAME_TOTAL_OVERHEAD + LEN;
    if (bytesAvailable < totalFrameLength) return null;

    const endOffset = frameStart + totalFrameLength;
    const frame = buffer.subarray(frameStart, endOffset);
    return { frame, endOffset };
  }

  return null;
}

function isExpectedPn532Response(response, expectedResponseCode) {
  if (response.length <= PN532.RESPONSE_CODE_OFFSET) return false;
  if (response[PN532.TFI_OFFSET] !== PN532.RESPONSE_TFI) return false;
  return response[PN532.RESPONSE_CODE_OFFSET] === expectedResponseCode;
}

// ───────────────────────────── Serial I/O ───────────────────────────────────

function sendCommand(connection, command, expectedResponseCode, timeout = COMMAND_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!connection?.isOpen) {
      resolve(null);
      return;
    }

    let isSettled = false;
    let responseBuffer = Buffer.alloc(0);

    const finish = (response) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeoutId);
      connection.removeListener('data', dataHandler);
      resolve(response);
    };

    const tryResolve = () => {
      let scanOffset = 0;
      while (true) {
        const result = getPn532ResponseFrame(responseBuffer, scanOffset);
        if (!result) return false;
        if (!isExpectedPn532Response(result.frame, expectedResponseCode)) {
          scanOffset = result.endOffset;
          continue;
        }
        finish(result.frame);
        return true;
      }
    };

    const dataHandler = (data) => {
      responseBuffer = Buffer.concat([responseBuffer, data]);
      tryResolve();
    };

    const timeoutId = setTimeout(() => {
      if (!tryResolve()) finish(null);
    }, timeout);

    connection.on('data', dataHandler);
    connection.write(command, (err) => {
      if (err) {
        console.error(`  Serial write error: ${err.message}`);
        finish(null);
      }
    });
  });
}

// ───────────────────────────── PN532 Commands ───────────────────────────────

async function initializeReader(connection) {
  const response = await sendCommand(connection, PN532.INIT_COMMAND, PN532.INIT_RESPONSE_CODE);
  return Boolean(response);
}

async function releaseTargets(connection) {
  const response = await sendCommand(connection, PN532.IN_RELEASE_COMMAND, PN532.IN_RELEASE_RESPONSE_CODE);
  return Boolean(response);
}

async function detectTag(connection) {
  await releaseTargets(connection);
  const response = await sendCommand(connection, PN532.QUERY_COMMAND, PN532.QUERY_RESPONSE_CODE);
  if (!response) return null;
  const tagIds = extractTagIds(response);
  return tagIds[0] ?? null;
}

function extractTagIds(response) {
  if (response.length <= PN532.NBTG_OFFSET || response[PN532.NBTG_OFFSET] === 0) return [];

  const numberOfTags = response[PN532.NBTG_OFFSET];
  const tagIds = [];
  let offset = PN532.NBTG_OFFSET + 1;

  for (let i = 0; i < numberOfTags; i++) {
    const tagIdLengthOffset = offset + PN532.TARGET_BLOCK_PREFIX_SIZE;
    if (tagIdLengthOffset >= response.length) break;
    const tagIdLength = response[tagIdLengthOffset];
    const tagIdDataOffset = tagIdLengthOffset + 1;
    const tagIdEnd = tagIdDataOffset + tagIdLength;
    if (response.length < tagIdEnd) break;
    tagIds.push(response.subarray(tagIdDataOffset, tagIdEnd).toString('hex'));
    offset = tagIdEnd;
  }

  return tagIds;
}

// ── Read page (MIFARE Ultralight READ returns 16 bytes = 4 pages) ───────────

async function readPage(connection, page) {
  const command = buildPn532Frame(
    Buffer.from([0xd4, PN532.WRITE_PAGE_COMMAND_CODE, PN532.WRITE_TARGET_NUMBER, PN532.MIFARE_ULTRALIGHT_READ, page]),
  );
  const response = await sendCommand(connection, command, PN532.IN_DATA_EXCHANGE_RESPONSE_CODE);
  if (!response) return null;

  const statusOffset = PN532.RESPONSE_CODE_OFFSET + 1;
  if (response[statusOffset] !== 0x00) return null;

  // Data starts after status byte
  const dataOffset = statusOffset + 1;
  return response.subarray(dataOffset, dataOffset + 16);
}

// ── Write page (exactly 4 bytes) ────────────────────────────────────────────

async function writePage(connection, page, data) {
  if (data.length !== 4) {
    console.error('  writePage requires exactly 4 bytes');
    return false;
  }

  const command = buildPn532Frame(
    Buffer.from([0xd4, PN532.WRITE_PAGE_COMMAND_CODE, PN532.WRITE_TARGET_NUMBER, PN532.MIFARE_ULTRALIGHT_WRITE, page, ...data]),
  );
  const response = await sendCommand(connection, command, PN532.IN_DATA_EXCHANGE_RESPONSE_CODE);
  if (!response) return false;

  const statusOffset = PN532.RESPONSE_CODE_OFFSET + 1;
  return response[statusOffset] === 0x00;
}

// ── Read ALL pages ──────────────────────────────────────────────────────────

async function readAllPages(connection) {
  console.log('\n  Reading all tag pages (0 up to ' + PN532.MAX_READ_PAGE + ') …');
  console.log('  Each READ command returns 4 pages (16 bytes).\n');

  const pages = [];
  let readCount = 0;

  // READ (0x30) returns 16 bytes = 4 pages starting from the requested page.
  // We step by 4 and stop when a read fails (tag boundary reached).
  for (let startPage = 0; startPage <= PN532.MAX_READ_PAGE; startPage += 4) {
    const data = await readPage(connection, startPage);
    readCount++;

    if (!data) {
      console.log(`  ⓘ  Read #${readCount} at page ${startPage} failed — end of tag memory.`);
      break;
    }

    if (readCount > 1) {
      console.log(`  ⓘ  Read #${readCount} at page ${startPage} (bytes ${startPage * 4}–${startPage * 4 + 15})`);
    } else {
      console.log(`  ⓘ  Read #${readCount} at page ${startPage} (bytes 0–15)`);
    }

    const pagesInChunk = Math.min(4, PN532.MAX_READ_PAGE - startPage + 1);
    for (let i = 0; i < pagesInChunk; i++) {
      pages.push({
        page: startPage + i,
        data: data.subarray(i * 4, (i + 1) * 4),
      });
    }
  }

  console.log(`\n  Total: ${readCount} READ command(s), ${pages.length} page(s) retrieved.\n`);

  // Display table
  console.log('  Page | Hex               | ASCII | Label');
  console.log('  ─────┼───────────────────┼───────┼──────────');
  for (const { page, data } of pages) {
    const hex = [...data].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...data].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    const label = PAGE_LABELS[page] || (page >= PN532.DEFAULT_WRITE_START_PAGE && page <= PN532.LAST_WRITABLE_PAGE ? 'USER' : '');
    const writable = page >= PN532.DEFAULT_WRITE_START_PAGE && page <= PN532.LAST_WRITABLE_PAGE;
    const marker = writable ? '' : ' 🔒';
    console.log(`    ${String(page).padStart(2)}  | ${hex.padEnd(17)} | ${ascii.padEnd(4)}  | ${label}${marker}`);
  }

  // Show combined user data interpretation (pages 6–27)
  const userPages = pages.filter((p) => p.page >= PN532.DEFAULT_WRITE_START_PAGE && p.page <= PN532.LAST_WRITABLE_PAGE);
  if (userPages.length > 0) {
    const combined = Buffer.concat(userPages.map((p) => p.data));
    const end = combined.indexOf(0x00);
    const str = combined.subarray(0, end === -1 ? combined.length : end).toString('utf8');
    console.log(`\n  User data (pages ${PN532.DEFAULT_WRITE_START_PAGE}–${PN532.LAST_WRITABLE_PAGE}) as text: "${str}"`);
  }

  return pages;
}

// ── Write string (auto-split across pages) ──────────────────────────────────

async function writeString(connection, text) {
  const data = Buffer.from(text, 'utf8');
  const maxBytes = (PN532.LAST_WRITABLE_PAGE - PN532.DEFAULT_WRITE_START_PAGE + 1) * 4; // 88 bytes

  console.log(`\n  Text: "${text}"`);
  console.log(`  Encoded size: ${data.length} bytes`);
  console.log(`  Available capacity: ${maxBytes} bytes (pages ${PN532.DEFAULT_WRITE_START_PAGE}–${PN532.LAST_WRITABLE_PAGE}, 4 bytes/page)`);
  console.log('  ⚠  Multi-byte UTF-8 characters (e.g. emoji, CJK) take 2–4 bytes each.');
  console.log('  ⚠  Pages 28+ are LOCK/CFG registers and will NOT be written to.');

  if (data.length > maxBytes) {
    console.error(`  ✗ Text too long! ${data.length} bytes exceeds ${maxBytes} byte capacity.`);
    return false;
  }

  const totalPages = Math.ceil(data.length / 4);
  console.log(`\n  Will write ${totalPages} page(s) starting at page ${PN532.DEFAULT_WRITE_START_PAGE}.`);
  console.log('  Detecting tag and writing immediately …\n');

  const tagId = await detectTag(connection);
  if (!tagId) {
    console.log('  ✗ No tag found. Place a tag on the reader and try again.');
    return false;
  }
  console.log(`  Tag UID: ${tagId}`);

  for (let i = 0; i < totalPages; i++) {
    const page = PN532.DEFAULT_WRITE_START_PAGE + i;
    const chunk = Buffer.alloc(4, 0x00);
    data.copy(chunk, 0, i * 4, Math.min((i + 1) * 4, data.length));

    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    process.stdout.write(`  Page ${page}: [${hex}] … `);

    const ok = await writePage(connection, page, chunk);
    console.log(ok ? '✓' : '✗ FAILED');
    if (!ok) return false;
  }

  console.log('\n  Write complete!');
  return true;
}

// ── Erase all user pages ─────────────────────────────────────────────────────

async function eraseUserPages(connection) {
  const totalPages = PN532.LAST_WRITABLE_PAGE - PN532.DEFAULT_WRITE_START_PAGE + 1;
  console.log(`\n  This will write 0x00 to all ${totalPages} user pages (${PN532.DEFAULT_WRITE_START_PAGE}–${PN532.LAST_WRITABLE_PAGE}).`);
  console.log('  Detecting tag and erasing immediately …\n');

  const tagId = await detectTag(connection);
  if (!tagId) {
    console.log('  ✗ No tag found. Place a tag on the reader and try again.');
    return false;
  }
  console.log(`  Tag UID: ${tagId}\n`);

  const blank = Buffer.alloc(4, 0x00);
  for (let page = PN532.DEFAULT_WRITE_START_PAGE; page <= PN532.LAST_WRITABLE_PAGE; page++) {
    process.stdout.write(`  Page ${String(page).padStart(2)}: [00 00 00 00] … `);
    const ok = await writePage(connection, page, blank);
    console.log(ok ? '✓' : '✗ FAILED');
    if (!ok) return false;
  }

  console.log('\n  Erase complete!');
  return true;
}



async function writeSinglePage(connection, rl) {
  const pageStr = await ask(rl, `  Page number (${PN532.DEFAULT_WRITE_START_PAGE}–${PN532.LAST_WRITABLE_PAGE}): `);
  const page = parseInt(pageStr, 10);
  if (isNaN(page) || page < PN532.DEFAULT_WRITE_START_PAGE || page > PN532.LAST_WRITABLE_PAGE) {
    console.log(`  Invalid page. Must be ${PN532.DEFAULT_WRITE_START_PAGE}–${PN532.LAST_WRITABLE_PAGE}.`);
    return;
  }

  const input = await ask(rl, '  4 bytes as hex (e.g. "43324D31") or text (e.g. "C2M1"): ');
  let data;
  if (/^[0-9a-fA-F]{8}$/.test(input)) {
    data = Buffer.from(input, 'hex');
  } else if (input.length <= 4) {
    data = Buffer.alloc(4, 0x00);
    Buffer.from(input, 'utf8').copy(data);
  } else {
    console.log('  Input must be 8 hex chars or up to 4 ASCII chars.');
    return;
  }

  console.log('  Detecting tag and writing immediately …');
  const tagId = await detectTag(connection);
  if (!tagId) {
    console.log('  ✗ No tag found. Place a tag on the reader and try again.');
    return;
  }
  console.log(`  Tag UID: ${tagId}`);

  const hex = [...data].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  process.stdout.write(`  Writing page ${page}: [${hex}] … `);
  const ok = await writePage(connection, page, data);
  console.log(ok ? '✓' : '✗ FAILED');
}

// ───────────────────────────── CLI Helpers ───────────────────────────────────

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function listAndSelectPort(rl) {
  const ports = await SerialPort.list();
  if (ports.length === 0) {
    console.log('  No serial ports found.');
    return null;
  }

  console.log('\n  Available serial ports:');
  ports.forEach((p, i) => {
    const info = [p.manufacturer, p.pnpId].filter(Boolean).join(' | ');
    console.log(`    ${i + 1}. ${p.path}${info ? `  (${info})` : ''}`);
  });

  const choice = await ask(rl, `\n  Select port [1–${ports.length}]: `);
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= ports.length) {
    console.log('  Invalid selection.');
    return null;
  }

  return ports[idx].path;
}

function openPort(path) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate: BAUD_RATE, autoOpen: false });
    port.open((err) => {
      if (err) reject(err);
      else resolve(port);
    });
  });
}

// ───────────────────────────── Main ─────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║    PN532 NFC Tag Reader/Writer Tool      ║');
  console.log('╚══════════════════════════════════════════╝');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const portPath = await listAndSelectPort(rl);
  if (!portPath) {
    rl.close();
    process.exit(1);
  }

  let connection;
  try {
    console.log(`\n  Opening ${portPath} at ${BAUD_RATE} baud …`);
    connection = await openPort(portPath);
    console.log('  Port opened.');
  } catch (err) {
    console.error(`  Failed to open port: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  console.log('  Initializing PN532 reader …');
  const ok = await initializeReader(connection);
  if (!ok) {
    console.error('  PN532 did not respond. Check wiring and port selection.');
    connection.close();
    rl.close();
    process.exit(1);
  }
  console.log('  PN532 ready!\n');

  // Main menu loop
  let running = true;
  while (running) {
    console.log('  ┌────────────────────────────────┐');
    console.log('  │  1. Detect tag (show UID)       │');
    console.log('  │  2. Read tag (all pages)        │');
    console.log('  │  3. Write single page (4B)      │');
    console.log('  │  4. Write string (auto-split)   │');
    console.log('  │  5. Erase all user data         │');
    console.log('  │  6. Exit                        │');
    console.log('  └────────────────────────────────┘');

    const choice = await ask(rl, '\n  Choice [1–6]: ');

    switch (choice.trim()) {
      case '1': {
        console.log('\n  Scanning for tag …');
        const tagId = await detectTag(connection);
        if (tagId) {
          console.log(`  ✓ Tag detected — UID: ${tagId}\n`);
        } else {
          console.log('  ✗ No tag found. Place a tag on the reader and try again.\n');
        }
        break;
      }

      case '2': {
        console.log('\n  Detecting tag first …');
        const tagId = await detectTag(connection);
        if (!tagId) {
          console.log('  ✗ No tag found.\n');
          break;
        }
        console.log(`  Tag UID: ${tagId}`);
        await readAllPages(connection);
        console.log();
        break;
      }

      case '3': {
        await writeSinglePage(connection, rl);
        console.log();
        break;
      }

      case '4': {
        const text = await ask(rl, '  Enter text to write: ');
        if (!text) {
          console.log('  Empty input, skipping.\n');
          break;
        }
        await writeString(connection, text);
        console.log();
        break;
      }

      case '5': {
        await eraseUserPages(connection);
        console.log();
        break;
      }

      case '6':
        running = false;
        break;

      default:
        console.log('  Invalid choice.\n');
    }
  }

  console.log('  Closing port …');
  connection.close();
  rl.close();
  console.log('  Bye!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
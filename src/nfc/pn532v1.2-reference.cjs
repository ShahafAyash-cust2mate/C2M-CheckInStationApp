#!/usr/bin/env node
'use strict';

// PN532 NFC JSON Tool — reads/writes JSON payloads to NTAG tags over serial.
// Supports any NTAG variant (210–216) by reading the Capability Container (CC)
// on page 3 to determine available memory at runtime.

const { SerialPort } = require('serialport');
const readline = require('readline');

const BAUD_RATE = 115200;
const COMMAND_TIMEOUT_MS = 5000; // max ms to wait for a PN532 response
const START_PAGE = 4;           // NTAG user memory always starts at page 4 (pages 0–3 are UID/lock/CC)
const NDEF_OVERHEAD = 6;        // bytes consumed by the NDEF TLV wrapper: [03][len][D5][00][payLen]...[FE]
const RETRY_DELAY_MS = 50;      // ms to wait before retrying a failed InDataExchange
const PAGE_RETRY = 5;             // number of times to retry a failed page read/write before giving up

const PN532 = {
  INIT_COMMAND: Buffer.from([
    0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x03, 0xfd, 0xd4,
    0x14, 0x01, 0x17, 0x00,
  ]),
  IN_RELEASE: Buffer.from([0x00, 0x00, 0xff, 0x03, 0xfd, 0xd4, 0x52, 0x00, 0xda, 0x00]), // release any held tag
  QUERY: Buffer.from([0x00, 0x00, 0xff, 0x04, 0xfc, 0xd4, 0x4a, 0x02, 0x00, 0xe0, 0x00]), // detect tags
  ACK: Buffer.from([0x00, 0x00, 0xff, 0x00, 0xff, 0x00]),  // PN532 ACK
  FRAME_START: Buffer.from([0x00, 0x00, 0xff]),             // every PN532 frame starts with these 3 bytes
  TFI: 0xd5,  // From PN532-to-host direction
  RESP: { INIT: 0x15, RELEASE: 0x53, QUERY: 0x4b, DATA: 0x41 }, // expected response command codes
};

// Wraps a raw payload into a PN532 frame:
// [preamble 0x00][start code 0x00 0xff][LEN][LCS=~LEN][payload...][DCS=~sum(payload)][postamble 0x00]
function buildFrame(payload) {
  const len = payload.length;
  const lcs = (0x100 - len) & 0xff;
  const dcs = (0x100 - payload.reduce((s, b) => s + b, 0)) & 0xff;
  return Buffer.concat([Buffer.from([0x00, 0x00, 0xff, len, lcs]), payload, Buffer.from([dcs, 0x00])]);
}

// Skips over ACK frames and awaits a full response frame.
function parseResponse(buffer, startOffset = 0) {
  let pos = startOffset;
  while (pos < buffer.length) {
    pos = buffer.indexOf(PN532.FRAME_START, pos); // find next potential frame
    if (pos < 0) return null;
    const avail = buffer.length - pos;
    if (avail < 6) return null;                   // not enough bytes to determine frame type yet
    if (buffer.subarray(pos, pos + 6).equals(PN532.ACK)) { pos += 6; continue; } // skip ACK and keep looking
    if (avail < 7) return null;
    const len = buffer[pos + 3];                  // payload length is in byte 3
    const total = 7 + len;                        // full frame size: 5 header + len payload + 2 trailer
    if (avail < total) return null;               // frame not fully received yet
    return { frame: buffer.subarray(pos, pos + total), endOffset: pos + total };
  }
  return null;
}

// Sends a raw command buffer to the PN532 and waits for a response frame whose
// command code matches expectedCode. Data arrives in chunks, so we accumulate
// bytes in `buf` and re-scan on each chunk. Resolves with the frame on success,
// or null on timeout / port error.
function sendCommand(conn, command, expectedCode, timeout = COMMAND_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!conn?.isOpen) return resolve(null);
    let settled = false, buf = Buffer.alloc(0);

    // Ensures we only resolve/reject once even if multiple events fire
    const finish = (r) => { if (settled) return; settled = true; clearTimeout(tid); conn.removeListener('data', onData); resolve(r); };

    // Scans all complete frames in the buffer; resolves if we find the expected response
    const tryResolve = () => {
      let off = 0;
      while (true) {
        const r = parseResponse(buf, off);
        if (!r) return false;
        // frame[5] = TFI (direction), frame[6] = command code
        if (r.frame.length > 6 && r.frame[5] === PN532.TFI && r.frame[6] === expectedCode) { finish(r.frame); return true; }
        off = r.endOffset; // skip this frame and look for the next one
      }
    };
    const onData = (d) => { buf = Buffer.concat([buf, d]); tryResolve(); };
    const tid = setTimeout(() => { if (!tryResolve()) finish(null); }, timeout); // give up after timeout

    conn.on('data', onData);
    conn.write(command, (err) => { if (err) finish(null); });
  });
}

async function initReader(conn) {
  return Boolean(await sendCommand(conn, PN532.INIT_COMMAND, PN532.RESP.INIT));
}

// Selects a tag and reads its Capability Container (CC) to determine memory size.
async function detectTag(conn) {
  // Release any previously held tag so QUERY returns fresh data
  await sendCommand(conn, PN532.IN_RELEASE, PN532.RESP.RELEASE);
  const r = await sendCommand(conn, PN532.QUERY, PN532.RESP.QUERY);
  if (!r || r.length <= 7 || r[7] === 0) return null; // r[7] = number of tags found

  const idLen = r[12];
  const uid = r.subarray(13, 13 + idLen).toString('hex');

  // Brief pause
  await new Promise(ok => setTimeout(ok, 10));

  // Page 0 read returns 16 bytes (pages 0–3); page 3 holds the Capability Container
  const header = await readPage(conn, 0);
  if (!header) return null;

  // CC layout: [magic 0xE1] [version] [size/8] [access]
  const ccMagic = header[12];
  const cc2 = header[14];
  if (ccMagic !== 0xe1 || cc2 === 0) {
    console.log('  ✗ Tag is not NDEF-formatted or has no user memory.');
    return null;
  }

  const userBytes = cc2 * 8;                         // total user-writable area
  const endPage = START_PAGE + (userBytes / 4) - 1;  // last user page index
  const maxJsonBytes = userBytes - NDEF_OVERHEAD;     // space left for the JSON payload

  return { uid, endPage, userBytes, maxJsonBytes };
}

// Reads 4 consecutive pages (16 bytes) starting at `page` via NTAG READ (0x30).
async function readPage(conn, page) {
  for (let attempt = 0; attempt < PAGE_RETRY; attempt++) {
    const r = await sendCommand(conn, buildFrame(Buffer.from([0xd4, 0x40, 0x01, 0x30, page])), PN532.RESP.DATA);
    if (r && r[7] === 0x00) return r.subarray(8, 24); // 16 bytes: 4 pages × 4 bytes
    await new Promise(ok => setTimeout(ok, RETRY_DELAY_MS));
  }
  return null;
}

// Writes 4 bytes to a single page via NTAG WRITE (0xA2).
async function writePage(conn, page, data) {
  for (let attempt = 0; attempt < PAGE_RETRY; attempt++) {
    const r = await sendCommand(conn, buildFrame(Buffer.from([0xd4, 0x40, 0x01, 0xa2, page, ...data])), PN532.RESP.DATA);
    if (r && r[7] === 0x00) return true;
    await new Promise(ok => setTimeout(ok, RETRY_DELAY_MS));
  }
  return false;
}

async function readTag(conn) {
  const tag = await detectTag(conn);
  if (!tag) { console.log('  No tag.\n'); return null; }
  console.log(`  UID: ${tag.uid}  (${tag.userBytes} user bytes, pages ${START_PAGE}–${tag.endPage})`);

  // Read pages 0 through endPage (header + user data; config pages are skipped).
  const pages = [];
  for (let p = 0; p <= tag.endPage; p += 4) {
    const data = await readPage(conn, p);
    if (!data) {
      console.log(`  ✗ Read failed at page ${p} after ${PAGE_RETRY} retries — aborting.`);
      break;
    }
    const count = Math.min(4, tag.endPage - p + 1);
    for (let i = 0; i < count; i++)
      pages.push({ page: p + i, data: data.subarray(i * 4, (i + 1) * 4) });
  }

  // Hex + ASCII dump of every page
  for (const { page, data } of pages) {
    const hex = [...data].map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...data].map(b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    console.log(`  ${String(page).padStart(2)} | ${hex} | ${ascii}`);
  }

  // Parse NDEF JSON from user pages only (skip header pages 0–3)
  const userPages = pages.filter(p => p.page >= START_PAGE);
  if (userPages.length > 0) {
    const combined = Buffer.concat(userPages.map(p => p.data));
    const json = parseNdefJson(combined);
    if (json !== null) console.log(`\n  JSON: ${JSON.stringify(json, null, 2)}`);
    else console.log('\n  No valid JSON found on tag.');
  }
  return pages;
}

// Encodes a JSON string into a minimal NDEF message wrapped in NTAG TLV format:
//   [0x03][totalLen]         <- NDEF TLV tag + length
//     [0xd5][0x00][payLen]   <- NDEF record header: TNF=0x5 (unknown), type length=0, SR+IL flags
//     [json bytes...]        <- the actual payload
//   [0xfe]                   <- terminator TLV
function buildNdefMessage(jsonStr, maxBytes) {
  const payload = Buffer.from(jsonStr, 'utf8');
  if (payload.length > maxBytes) return null;
  const record = Buffer.concat([Buffer.from([0xd5, 0x00, payload.length]), payload]);
  return Buffer.concat([Buffer.from([0x03, record.length]), record, Buffer.from([0xfe])]);
}

// Walks the NTAG TLV structure to find a type-0x03 (NDEF Message) TLV,
// then parses the NDEF record header to extract the payload and decode it as JSON.
function parseNdefJson(buffer) {
  let i = 0;
  while (i < buffer.length) {
    const type = buffer[i];
    if (type === 0x00) { i++; continue; }  // null TLV — skip
    if (type === 0xfe) break;              // terminator TLV — stop
    if (i + 1 >= buffer.length) return null;
    const len = buffer[i + 1];
    if (type === 0x03) {                   // NDEF Message TLV
      const msg = buffer.subarray(i + 2, i + 2 + len); // raw NDEF record bytes
      if (msg.length < 3) return null;
      // SR (Short Record) flag at bit 4: if set, payload length is 1 byte; otherwise 4 bytes
      const sr = (msg[0] >> 4) & 1;
      const typeLen = msg[1];
      const payloadLen = sr ? msg[2] : msg.readUInt32BE(2);
      const hdr = sr ? 3 : 6; // header size depends on SR flag
      const payload = msg.subarray(hdr + typeLen, hdr + typeLen + payloadLen);
      try { return JSON.parse(payload.toString('utf8')); } catch { return null; }
    }
    i += 2 + len; // skip unknown TLV
  }
  return null;
}

// Writes a JSON string as an NDEF message and blanks all remaining user pages
// so no leftover data from previous writes remains on the tag.
async function writeJson(conn, jsonStr) {
  const tag = await detectTag(conn);
  if (!tag) { console.log('  ✗ No tag found.'); return false; }
  console.log(`  Tag: ${tag.uid}  (${tag.userBytes} user bytes)`);

  const data = buildNdefMessage(jsonStr, tag.maxJsonBytes);
  if (!data) {
    console.log(`  ✗ JSON too long (max ${tag.maxJsonBytes} bytes, got ${Buffer.byteLength(jsonStr, 'utf8')})`);
    return false;
  }

  // Write the NDEF data page by page
  const totalPages = Math.ceil(data.length / 4);
  for (let i = 0; i < totalPages; i++) {
    const page = START_PAGE + i;
    const chunk = Buffer.alloc(4, 0x00);
    data.copy(chunk, 0, i * 4, Math.min((i + 1) * 4, data.length));
    if (!(await writePage(conn, page, chunk))) { console.log(`  ✗ Failed at page ${page}`); return false; }
  }

  // Blank every remaining user page to wipe old data
  const blank = Buffer.alloc(4, 0x00);
  for (let p = START_PAGE + totalPages; p <= tag.endPage; p++) {
    if (!(await writePage(conn, p, blank))) { console.log(`  ✗ Failed erasing page ${p}`); return false; }
  }

  console.log(`  ✓ Written (${data.length} bytes across ${totalPages}/${tag.endPage - START_PAGE + 1} pages)`);
  return true;
}

async function eraseTag(conn) {
  const tag = await detectTag(conn);
  if (!tag) { console.log('  ✗ No tag found.'); return false; }
  console.log(`  Tag: ${tag.uid}`);

  const blank = Buffer.alloc(4, 0x00);
  for (let p = START_PAGE; p <= tag.endPage; p++) {
    if (!(await writePage(conn, p, blank))) { console.log(`  ✗ Failed at page ${p}`); return false; }
  }
  console.log('  ✓ Erased');
  return true;
}


// Prompts the user and resolves with their input.
function ask(rl, q) { return new Promise(r => rl.question(q, r)); }

function openPort(path) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate: BAUD_RATE, autoOpen: false });
    port.open(err => err ? reject(err) : resolve(port));
  });
}

async function main() {
  console.log('\n  PN532 NFC JSON Tool\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ports = await SerialPort.list();
  if (ports.length === 0) { console.log('  No serial ports found.'); process.exit(1); }
  ports.forEach((p, i) => console.log(`  ${i + 1}. ${p.path}${p.manufacturer ? ` (${p.manufacturer})` : ''}`));
  const idx = parseInt(await ask(rl, `\n  Port [1–${ports.length}]: `), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= ports.length) { console.log('  Invalid.'); process.exit(1); }

  let conn;
  try { conn = await openPort(ports[idx].path); } catch (e) { console.error(`  ${e.message}`); process.exit(1); }
  if (!(await initReader(conn))) { console.error('  PN532 not responding.'); process.exit(1); }
  conn.on('error', err => console.error(`  Port error: ${err.message}`));
  console.log('  Ready.\n');

  let running = true;
  while (running) {
    console.log('  1.Detect  2.Read  3.Write  4.Erase  5.Exit');
    switch ((await ask(rl, '  > ')).trim()) {
      case '1': {
        const tag = await detectTag(conn);
        console.log(tag ? `  UID: ${tag.uid}  (${tag.userBytes} bytes)\n` : '  No tag.\n');
        break;
      }
      case '2': {
        await readTag(conn);
        console.log();
        break;
      }
      case '3': {
        const input = await ask(rl, '  JSON: ');
        if (!input) { break; }
        try { JSON.parse(input); } catch { console.log('  Invalid JSON.\n'); break; }
        await writeJson(conn, input);
        console.log();
        break;
      }
      case '4': { await eraseTag(conn); console.log(); break; }
      case '5': running = false; break;
      default: console.log('  Invalid.\n');
    }
  }

  conn.close();
  rl.close();
}

main().catch(e => { console.error(e); process.exit(1); });
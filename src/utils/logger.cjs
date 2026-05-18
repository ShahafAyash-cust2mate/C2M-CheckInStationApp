"use strict";

const fs = require("fs");
const path = require("path");
let electronApp = null;
try { electronApp = require("electron").app; } catch {}

function logDir() {
  const override = process.env.C2M_CHECKIN_LOG_DIR;
  if (override) return override;
  try {
    if (electronApp && typeof electronApp.getPath === "function") {
      return path.join(electronApp.getPath("userData"), "logs");
    }
  } catch {}
  return path.join(process.cwd(), "logs");
}

function logPath() { return path.join(logDir(), "cloud-api.log"); }

function ensureDir() { fs.mkdirSync(logDir(), { recursive: true }); }

function redact(value) {
  if (value === undefined || value === null) return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/g, "Bearer [REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9._\-+/=]+/g, "Basic [REDACTED]")
    .replace(/("?cloudClientSecret"?\s*[:=]\s*")([^"]+)(")/gi, "$1[REDACTED]$3")
    .replace(/("?clientSecret"?\s*[:=]\s*")([^"]+)(")/gi, "$1[REDACTED]$3")
    .replace(/("?access_token"?\s*[:=]\s*")([^"]+)(")/gi, "$1[REDACTED]$3");
}

function safeJson(value, max = 6000) {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const r = redact(s);
    return r.length > max ? `${r.slice(0, max)}... [truncated ${r.length - max} chars]` : r;
  } catch (e) {
    return String(value);
  }
}

function write(level, message, data) {
  try {
    ensureDir();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...(data !== undefined ? { data: typeof data === "string" ? redact(data) : JSON.parse(safeJson(data, 12000)) } : {})
    });
    fs.appendFileSync(logPath(), `${line}\n`, "utf8");
  } catch (e) {
    try { fs.appendFileSync(logPath(), `[${new Date().toISOString()}] ${level} ${message} ${String(e)}\n`, "utf8"); } catch {}
  }
}

function info(message, data) { write("info", message, data); }
function error(message, data) { write("error", message, data); }
function warn(message, data) { write("warn", message, data); }

module.exports = { logDir, logPath, info, warn, error, redact, safeJson };

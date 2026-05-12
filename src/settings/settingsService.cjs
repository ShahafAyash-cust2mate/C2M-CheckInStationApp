
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  nfcActionTimeoutMs: 10000,
  chargeDetectTimeoutMs: 10000,
  nfcActionDelayMs: 3000,
  nfcImmediateAction: true,
  scannerMacFragment: '',
  scannerReadTimeoutMs: 20000,
  openWallDurationSec: 10,
  scannerAutoConnect: true,
  scannerKeyboardMode: true,
  scannerKeyboardSuffix: 'enter',
  arduinoCommandTimeoutMs: 2500
};

function getSettingsPath() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'app-settings.json');
}

function readSettings() {
  const file = getSettingsPath();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
    return { ...DEFAULT_SETTINGS };
  }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    fs.writeFileSync(file, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function resetSettings() {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
  return { ...DEFAULT_SETTINGS };
}

module.exports = { DEFAULT_SETTINGS, readSettings, saveSettings, resetSettings };

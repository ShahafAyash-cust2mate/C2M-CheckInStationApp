const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_SETTINGS = {
  nfcActionTimeoutMs: 10000,
  chargeDetectTimeoutMs: 15000,
  nfcActionDelayMs: 0,
  nfcImmediateAction: true,
  scannerReadTimeoutMs: 20000,
  scannerKeyboardSuffix: 'Enter',
  scannerMacAddress: '',
  ledHoldMs: 5000,
  openWallSeconds: 10,

  cloudUseRemote: true,
  cloudBaseUrl: 'https://customer1.cart.dev.do-c2m.com/device-management/v1',
  cloudTokenUrl: 'https://auth.dev.do-c2m.com/oauth2/token',
  cloudClientId: 'aa2d6a17-9905-467c-b03b-8d1c0d3ce1b5',
  cloudClientSecret: 'DACKGQwrLVBBdqeXDRwBuwfjHL2IHu66uIu9RgAzogg',
  cloudRequestTimeoutMs: 30000,

  retailerBaseUrl: 'https://customer1.cart.dev.do-c2m.com/retailer/v1'
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'app-settings.json');
}

function normalizeRetailerBaseUrl(value) {
  let base = String(value || '').trim();
  if (!base) base = 'https://customer1.cart.dev.do-c2m.com/retailer/v1';
  base = base.replace(/\/docs\/?#?\/?$/i, '');
  base = base.replace(/\/docs#\/?$/i, '');
  base = base.replace(/\/docs.*$/i, '');
  base = base.replace(/\/+$/,'');
  if (/\/retailer$/i.test(base)) base = `${base}/v1`;
  return base;
}

function normalizeSettings(raw) {
  const source = raw || {};
  const next = {
    ...DEFAULT_SETTINGS,
    ...source,
    cloudBaseUrl: source.cloudBaseUrl || DEFAULT_SETTINGS.cloudBaseUrl,
    cloudTokenUrl: source.cloudTokenUrl || source.oauthTokenUrl || DEFAULT_SETTINGS.cloudTokenUrl,
    cloudClientId: source.cloudClientId || source.oauthClientId || DEFAULT_SETTINGS.cloudClientId,
    cloudClientSecret: source.cloudClientSecret || source.oauthClientSecret || DEFAULT_SETTINGS.cloudClientSecret,
    chargeDetectTimeoutMs: Number(source.chargeDetectTimeoutMs || source.chargingTestTimeoutMs || DEFAULT_SETTINGS.chargeDetectTimeoutMs),
    nfcActionDelayMs: Number(source.nfcActionDelayMs ?? DEFAULT_SETTINGS.nfcActionDelayMs),
    retailerBaseUrl: normalizeRetailerBaseUrl(source.retailerBaseUrl || DEFAULT_SETTINGS.retailerBaseUrl),
    cloudUseRemote: true
  };

  if (!String(next.cloudBaseUrl || '').trim()) next.cloudBaseUrl = DEFAULT_SETTINGS.cloudBaseUrl;
  if (!String(next.cloudTokenUrl || '').trim()) next.cloudTokenUrl = DEFAULT_SETTINGS.cloudTokenUrl;
  if (!String(next.cloudClientId || '').trim()) next.cloudClientId = DEFAULT_SETTINGS.cloudClientId;
  if (!String(next.cloudClientSecret || '').trim()) next.cloudClientSecret = DEFAULT_SETTINGS.cloudClientSecret;
  next.retailerBaseUrl = normalizeRetailerBaseUrl(next.retailerBaseUrl);
  if (!Number(next.chargeDetectTimeoutMs)) next.chargeDetectTimeoutMs = DEFAULT_SETTINGS.chargeDetectTimeoutMs;
  if (!Number(next.cloudRequestTimeoutMs)) next.cloudRequestTimeoutMs = DEFAULT_SETTINGS.cloudRequestTimeoutMs;

  delete next.oauthTokenUrl;
  delete next.oauthClientId;
  delete next.oauthClientSecret;
  delete next.chargingTestTimeoutMs;

  return next;
}

function readSettings() {
  const file = getSettingsPath();
  if (!fs.existsSync(file)) {
    const defaults = normalizeSettings(DEFAULT_SETTINGS);
    fs.writeFileSync(file, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }

  try {
    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    const next = normalizeSettings(current);
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
    return next;
  } catch {
    const defaults = normalizeSettings(DEFAULT_SETTINGS);
    fs.writeFileSync(file, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }
}

function saveSettings(settings) {
  const next = normalizeSettings(settings);
  fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function resetSettings() {
  const defaults = normalizeSettings(DEFAULT_SETTINGS);
  fs.writeFileSync(getSettingsPath(), JSON.stringify(defaults, null, 2), 'utf8');
  return defaults;
}

module.exports = {
  DEFAULT_SETTINGS,
  getSettingsPath,
  readSettings,
  saveSettings,
  resetSettings
};

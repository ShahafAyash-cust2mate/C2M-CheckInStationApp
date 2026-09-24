const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const {
  CLOUD_ENVIRONMENTS,
  CLOUD_CUSTOMERS,
  loadCloudProfiles,
  publicProfile
} = require('../config/cloudProfiles.cjs');

const DEFAULT_PROFILE_SELECTION = {
  environment: 'DEV',
  customer: 'Customer1'
};

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
  cloudEnvironment: DEFAULT_PROFILE_SELECTION.environment,
  cloudCustomer: DEFAULT_PROFILE_SELECTION.customer,
  cloudRequestTimeoutMs: 30000
};

const LEGACY_CLOUD_KEYS = [
  'cloudBaseUrl',
  'cloudApiBaseUrl',
  'retailerBaseUrl',
  'cloudTokenUrl',
  'oauthTokenUrl',
  'cloudClientId',
  'oauthClientId',
  'cloudClientSecret',
  'oauthClientSecret'
];

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'app-settings.json');
}

function normalizeRetailerBaseUrl(value) {
  let base = String(value || '').trim();
  base = base.replace(/\/docs\/?#?\/?$/i, '');
  base = base.replace(/\/docs#\/?$/i, '');
  base = base.replace(/\/docs.*$/i, '');
  base = base.replace(/\/+$/, '');
  if (/\/retailer$/i.test(base)) base = `${base}/v1`;
  return base;
}

function normalizeEnvironment(value) {
  return String(value || DEFAULT_PROFILE_SELECTION.environment).trim().toUpperCase();
}

function normalizeCustomer(value) {
  const raw = String(value || DEFAULT_PROFILE_SELECTION.customer).trim();
  const match = CLOUD_CUSTOMERS.find(customer => customer.toLowerCase() === raw.toLowerCase());
  return match || raw;
}

function selectedProfileFrom(source = {}) {
  return {
    environment: normalizeEnvironment(source.cloudEnvironment || source.environment || source.cloudProfile?.environment),
    customer: normalizeCustomer(source.cloudCustomer || source.customer || source.cloudProfile?.customer)
  };
}

function stripLegacyCloudKeys(settings) {
  const next = { ...settings };
  for (const key of LEGACY_CLOUD_KEYS) delete next[key];
  delete next.chargingTestTimeoutMs;
  delete next.cloudProfilePublic;
  delete next.cloudProfileOptions;
  delete next.cloudProfileError;
  delete next.cloudProfile;
  delete next.cloudProfileOverrides;
  return next;
}

function resolveProfile(selection) {
  let profiles;
  try {
    profiles = loadCloudProfiles();
  } catch (error) {
    return {
      profile: null,
      error: error.message || String(error)
    };
  }

  const profile = profiles?.[selection.environment]?.[selection.customer];
  if (!profile) {
    return {
      profile: null,
      error: `Cloud profile is not defined: ${selection.environment} / ${selection.customer}`
    };
  }
  profile.retailerBaseUrl = normalizeRetailerBaseUrl(profile.retailerBaseUrl);
  return { profile, error: '' };
}

function missingProfileFields(profile) {
  const missing = [];
  if (!String(profile?.cloudBaseUrl || '').trim()) missing.push('Cloud Base URL');
  if (!String(profile?.retailerBaseUrl || '').trim()) missing.push('Retailer Base URL');
  if (!String(profile?.oauthTokenUrl || '').trim()) missing.push('OAuth Token URL');
  if (!String(profile?.oauthClientId || '').trim()) missing.push('OAuth Client ID');
  if (!String(profile?.oauthClientSecret || '').trim()) missing.push('OAuth Client Secret');
  return missing;
}

function normalizeForDisk(raw = {}) {
  const selection = selectedProfileFrom(raw);
  const next = stripLegacyCloudKeys({
    ...DEFAULT_SETTINGS,
    ...raw,
    cloudEnvironment: selection.environment,
    cloudCustomer: selection.customer,
    chargeDetectTimeoutMs: Number(raw.chargeDetectTimeoutMs || raw.chargingTestTimeoutMs || DEFAULT_SETTINGS.chargeDetectTimeoutMs),
    nfcActionDelayMs: Number(raw.nfcActionDelayMs ?? DEFAULT_SETTINGS.nfcActionDelayMs),
    cloudRequestTimeoutMs: Number(raw.cloudRequestTimeoutMs || DEFAULT_SETTINGS.cloudRequestTimeoutMs),
    cloudUseRemote: true
  });

  if (!Number(next.chargeDetectTimeoutMs)) next.chargeDetectTimeoutMs = DEFAULT_SETTINGS.chargeDetectTimeoutMs;
  if (!Number(next.cloudRequestTimeoutMs)) next.cloudRequestTimeoutMs = DEFAULT_SETTINGS.cloudRequestTimeoutMs;
  return next;
}

function publicOptions() {
  const profiles = {};
  for (const environment of CLOUD_ENVIRONMENTS) {
    profiles[environment] = {};
    for (const customer of CLOUD_CUSTOMERS) {
      const resolved = resolveProfile({ environment, customer });
      profiles[environment][customer] = publicProfile(resolved.profile);
    }
  }

  return {
    environments: CLOUD_ENVIRONMENTS,
    customersByEnvironment: Object.fromEntries(CLOUD_ENVIRONMENTS.map(environment => [environment, CLOUD_CUSTOMERS])),
    profiles
  };
}

function toPublicSettings(diskSettings) {
  const selection = selectedProfileFrom(diskSettings);
  const resolved = resolveProfile(selection);
  const missing = resolved.profile ? missingProfileFields(resolved.profile) : [];
  const missingError = missing.length ? `Cloud profile ${selection.environment} / ${selection.customer} is missing: ${missing.join(', ')}` : '';
  const publicSettings = {
    ...stripLegacyCloudKeys(diskSettings),
    cloudEnvironment: selection.environment,
    cloudCustomer: selection.customer,
    cloudProfile: selection,
    cloudProfilePublic: publicProfile(resolved.profile),
    cloudProfileOptions: publicOptions(),
    cloudProfileError: resolved.error || missingError,
    cloudUseRemote: true
  };

  delete publicSettings.cloudProfileOverrides;
  return publicSettings;
}

function readRawSettingsFile() {
  const file = getSettingsPath();
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeDiskSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function readDiskSettings() {
  try {
    const current = readRawSettingsFile();
    const next = normalizeForDisk(current || DEFAULT_SETTINGS);
    writeDiskSettings(next);
    return next;
  } catch {
    const defaults = normalizeForDisk(DEFAULT_SETTINGS);
    writeDiskSettings(defaults);
    return defaults;
  }
}

function readSettings() {
  return toPublicSettings(readDiskSettings());
}

function readSettingsPrivate() {
  return readDiskSettings();
}

function readCloudConfig() {
  const diskSettings = readSettingsPrivate();
  const selection = selectedProfileFrom(diskSettings);
  const resolved = resolveProfile(selection);
  if (resolved.error) throw new Error(resolved.error);

  const missing = missingProfileFields(resolved.profile);
  if (missing.length) {
    throw new Error(`Cloud profile ${selection.environment} / ${selection.customer} is missing: ${missing.join(', ')}`);
  }

  return {
    environment: selection.environment,
    customer: selection.customer,
    cloudBaseUrl: String(resolved.profile.cloudBaseUrl || '').trim().replace(/\/+$/, ''),
    retailerBaseUrl: normalizeRetailerBaseUrl(resolved.profile.retailerBaseUrl),
    tokenUrl: String(resolved.profile.oauthTokenUrl || '').trim(),
    clientId: String(resolved.profile.oauthClientId || '').trim(),
    clientSecret: String(resolved.profile.oauthClientSecret || ''),
    timeoutMs: Number(diskSettings.cloudRequestTimeoutMs || DEFAULT_SETTINGS.cloudRequestTimeoutMs)
  };
}

function saveSettings(settings) {
  const existing = readDiskSettings();
  const next = normalizeForDisk({
    ...existing,
    ...settings
  });
  writeDiskSettings(next);
  return toPublicSettings(next);
}

function resetSettings() {
  const defaults = normalizeForDisk(DEFAULT_SETTINGS);
  writeDiskSettings(defaults);
  return toPublicSettings(defaults);
}

function getCloudProfilesPublic() {
  return publicOptions();
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_PROFILE_SELECTION,
  getSettingsPath,
  getCloudProfilesPublic,
  readSettings,
  readSettingsPrivate,
  readCloudConfig,
  saveSettings,
  resetSettings
};

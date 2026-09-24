const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CLOUD_ENVIRONMENTS = ['DEV', 'TEST', 'PROD'];
const CLOUD_CUSTOMERS = ['Customer1', 'Customer2', 'Customer3'];
const PROFILE_FIELDS = [
  'cloudBaseUrl',
  'retailerBaseUrl',
  'oauthTokenUrl',
  'oauthClientId',
  'oauthClientSecret'
];

function getProjectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getCloudProfilesPath() {
  if (app?.isPackaged) {
    return path.join(process.resourcesPath, 'config', 'cloud-profiles.json');
  }
  return path.join(getProjectRoot(), 'config', 'cloud-profiles.json');
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cloud profiles config file was not found: ${filePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cloud profiles config file is invalid JSON: ${filePath}. ${error.message || String(error)}`);
  }
}

function validateCloudProfiles(raw, filePath = getCloudProfilesPath()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Cloud profiles config must be a JSON object: ${filePath}`);
  }

  const normalized = {};
  for (const environment of CLOUD_ENVIRONMENTS) {
    const envProfiles = raw[environment];
    if (!envProfiles || typeof envProfiles !== 'object' || Array.isArray(envProfiles)) {
      throw new Error(`Cloud profiles config is missing environment ${environment}: ${filePath}`);
    }

    normalized[environment] = {};
    for (const customer of CLOUD_CUSTOMERS) {
      const profile = envProfiles[customer];
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        throw new Error(`Cloud profiles config is missing profile ${environment} / ${customer}: ${filePath}`);
      }

      normalized[environment][customer] = {};
      for (const field of PROFILE_FIELDS) {
        if (!(field in profile)) {
          throw new Error(`Cloud profiles config is missing ${field} for ${environment} / ${customer}: ${filePath}`);
        }
        normalized[environment][customer][field] = String(profile[field] ?? '');
      }
    }
  }

  return normalized;
}

function loadCloudProfiles() {
  const filePath = getCloudProfilesPath();
  return validateCloudProfiles(readJsonFile(filePath), filePath);
}

function publicProfile(profile) {
  return {
    cloudBaseUrl: profile?.cloudBaseUrl || '',
    retailerBaseUrl: profile?.retailerBaseUrl || '',
    oauthTokenUrl: profile?.oauthTokenUrl || '',
    oauthClientId: profile?.oauthClientId || '',
    oauthClientSecretConfigured: Boolean(profile?.oauthClientSecret)
  };
}

module.exports = {
  CLOUD_ENVIRONMENTS,
  CLOUD_CUSTOMERS,
  PROFILE_FIELDS,
  getCloudProfilesPath,
  loadCloudProfiles,
  publicProfile,
  validateCloudProfiles
};

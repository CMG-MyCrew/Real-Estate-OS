/**
 * REOS Enterprise v3.0 - API Key & Rate Limit Security Framework
 */

var REOS = REOS || {};

REOS.APIKeys = (function () {
  const KEYS_SHEET = 'API_KEYS';
  const USAGE_SHEET = 'API_USAGE';

  const KEY_HEADERS = [
    'API Key ID', 'Tenant ID', 'Name', 'Key Hash', 'Scopes', 'Status',
    'Rate Limit Per Hour', 'Expires At', 'Last Used At', 'Created At', 'Updated At'
  ];

  const USAGE_HEADERS = [
    'Usage ID', 'API Key ID', 'Tenant ID', 'Endpoint', 'Method', 'Status',
    'Timestamp', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(KEYS_SHEET, KEY_HEADERS);
    ensureTable_(USAGE_SHEET, USAGE_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    return sheet;
  }

  function createKey(tenantId, name, scopes, rateLimitPerHour, expiresAt) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const rawKey = 'reos_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    const created = REOS.Database.insert(KEYS_SHEET, {
      'Tenant ID': tenantId || '',
      Name: name || 'API Key',
      'Key Hash': hash_(rawKey),
      Scopes: (scopes || ['read']).join(','),
      Status: 'Active',
      'Rate Limit Per Hour': Number(rateLimitPerHour || 1000),
      'Expires At': expiresAt || ''
    }, { idField: 'API Key ID', idPrefix: 'AK' });
    REOS.SecurityHardening.logEvent('High', 'API Security', 'createKey', 'APIKey', created['API Key ID'], 'Success', 'API key created.', { tenantId: tenantId });
    return { apiKeyId: created['API Key ID'], apiKey: rawKey, record: created };
  }

  function validate(rawKey, endpoint, method, requiredScope) {
    ensureSheets();
    const hash = hash_(rawKey || '');
    const record = REOS.Database.query(KEYS_SHEET, function (key) {
      return key['Key Hash'] === hash && String(key.Status || '').toLowerCase() === 'active';
    })[0];

    if (!record) throwDenied_('', endpoint, method, 'Invalid API key.');
    if (isExpired_(record['Expires At'])) throwDenied_(record['API Key ID'], endpoint, method, 'API key expired.');
    if (!hasScope_(record.Scopes, requiredScope || 'read')) throwDenied_(record['API Key ID'], endpoint, method, 'API key missing scope.');
    if (isRateLimited_(record)) throwDenied_(record['API Key ID'], endpoint, method, 'API key rate limited.');

    REOS.Database.update(KEYS_SHEET, 'API Key ID', record['API Key ID'], { 'Last Used At': new Date() });
    logUsage_(record, endpoint, method, 'Allowed');
    return record;
  }

  function revoke(apiKeyId) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    return REOS.Database.update(KEYS_SHEET, 'API Key ID', apiKeyId, { Status: 'Revoked' });
  }

  function listKeys() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.getAll(KEYS_SHEET).map(function (key) {
      key['Key Hash'] = '********';
      return key;
    });
  }

  function isRateLimited_(record) {
    const limit = Number(record['Rate Limit Per Hour'] || 0);
    if (!limit) return false;
    const cutoff = new Date(Date.now() - 3600000);
    const count = REOS.Database.query(USAGE_SHEET, function (usage) {
      return String(usage['API Key ID'] || '') === String(record['API Key ID'] || '') && new Date(usage.Timestamp).getTime() >= cutoff.getTime();
    }).length;
    return count >= limit;
  }

  function hasScope_(scopes, requiredScope) {
    const list = String(scopes || '').split(',').map(function (s) { return s.trim(); });
    return list.indexOf('*') !== -1 || list.indexOf(requiredScope) !== -1;
  }

  function throwDenied_(apiKeyId, endpoint, method, message) {
    logUsage_({ 'API Key ID': apiKeyId, 'Tenant ID': '' }, endpoint, method, 'Denied');
    REOS.SecurityHardening.logEvent('High', 'API Security', 'validateApiKey', endpoint || 'API', apiKeyId, 'Denied', message, {});
    throw new Error(message);
  }

  function logUsage_(record, endpoint, method, status) {
    REOS.Database.insert(USAGE_SHEET, {
      'API Key ID': record['API Key ID'] || '',
      'Tenant ID': record['Tenant ID'] || '',
      Endpoint: endpoint || '',
      Method: method || '',
      Status: status || '',
      Timestamp: new Date()
    }, { idField: 'Usage ID', idPrefix: 'USE' });
  }

  function hash_(value) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value || '');
    return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  }

  function isExpired_(value) {
    if (!value) return false;
    const date = new Date(value);
    return !isNaN(date.getTime()) && date.getTime() < Date.now();
  }

  return { ensureSheets: ensureSheets, createKey: createKey, validate: validate, revoke: revoke, listKeys: listKeys };
})();

function apiKeysCreate(tenantId, name, scopes, rateLimitPerHour, expiresAt) { return REOS.APIKeys.createKey(tenantId, name, scopes || ['read'], rateLimitPerHour, expiresAt); }
function apiKeysList() { return REOS.APIKeys.listKeys(); }
function apiKeysRevoke(apiKeyId) { return REOS.APIKeys.revoke(apiKeyId); }

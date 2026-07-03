/**
 * REOS Enterprise v3.0 - Secret Management Framework
 *
 * Script-property backed secret registry with masking, rotation metadata,
 * and audit events. Secrets are never stored in Sheets.
 */

var REOS = REOS || {};

REOS.Secrets = (function () {
  const REGISTRY_SHEET = 'SECRET_REGISTRY';

  const HEADERS = [
    'Secret ID', 'Secret Key', 'Category', 'Status', 'Owner', 'Rotates Every Days',
    'Last Rotated At', 'Next Rotation At', 'Notes', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(REGISTRY_SHEET);
    if (!sheet) sheet = ss.insertSheet(REGISTRY_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function setSecret(key, value, category, owner, rotationDays) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    if (!key) throw new Error('Secret key is required.');
    if (!value) throw new Error('Secret value is required.');

    PropertiesService.getScriptProperties().setProperty('REOS_SECRET_' + key, value);
    const existing = findRegistry_(key);
    const next = nextRotation_(rotationDays || 90);
    const record = {
      'Secret Key': key,
      Category: category || 'General',
      Status: 'Active',
      Owner: owner || REOS.Security.getCurrentUserEmail(),
      'Rotates Every Days': Number(rotationDays || 90),
      'Last Rotated At': new Date(),
      'Next Rotation At': next,
      Notes: 'Secret stored in Script Properties.'
    };

    const saved = existing ? REOS.Database.update(REGISTRY_SHEET, 'Secret ID', existing['Secret ID'], record) :
      REOS.Database.insert(REGISTRY_SHEET, record, { idField: 'Secret ID', idPrefix: 'SEC' });

    REOS.SecurityHardening.logEvent('High', 'Secrets', 'setSecret', 'Secret', saved['Secret ID'], 'Success', 'Secret stored/rotated.', { key: key });
    return maskRecord_(saved);
  }

  function getSecret(key) {
    return PropertiesService.getScriptProperties().getProperty('REOS_SECRET_' + key);
  }

  function listSecrets() {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    return REOS.Database.getAll(REGISTRY_SHEET).map(maskRecord_);
  }

  function revokeSecret(key) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    PropertiesService.getScriptProperties().deleteProperty('REOS_SECRET_' + key);
    const existing = findRegistry_(key);
    if (!existing) return null;
    const updated = REOS.Database.update(REGISTRY_SHEET, 'Secret ID', existing['Secret ID'], { Status: 'Revoked' });
    REOS.SecurityHardening.logEvent('High', 'Secrets', 'revokeSecret', 'Secret', updated['Secret ID'], 'Success', 'Secret revoked.', { key: key });
    return maskRecord_(updated);
  }

  function rotationWatch() {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    const today = Date.now();
    return REOS.Database.getAll(REGISTRY_SHEET).filter(function (secret) {
      const next = new Date(secret['Next Rotation At']);
      return secret.Status === 'Active' && !isNaN(next.getTime()) && next.getTime() <= today + 14 * 86400000;
    }).map(maskRecord_);
  }

  function findRegistry_(key) {
    return REOS.Database.query(REGISTRY_SHEET, function (row) {
      return String(row['Secret Key'] || '') === String(key || '');
    })[0] || null;
  }

  function nextRotation_(days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 90));
    return d;
  }

  function maskRecord_(record) {
    record = Object.assign({}, record || {});
    record['Secret Key'] = record['Secret Key'] ? record['Secret Key'].replace(/.(?=.{4})/g, '*') : '';
    return record;
  }

  return { ensureSheet: ensureSheet, setSecret: setSecret, getSecret: getSecret, listSecrets: listSecrets, revokeSecret: revokeSecret, rotationWatch: rotationWatch };
})();

function secretsSet(key, value, category, owner, rotationDays) { return REOS.Secrets.setSecret(key, value, category, owner, rotationDays); }
function secretsList() { return REOS.Secrets.listSecrets(); }
function secretsRevoke(key) { return REOS.Secrets.revokeSecret(key); }
function secretsRotationWatch() { return REOS.Secrets.rotationWatch(); }

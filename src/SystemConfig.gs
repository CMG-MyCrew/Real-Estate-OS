/** REOS Enterprise v3.0 - System Configuration Administration */
var REOS = REOS || {};

REOS.SystemConfig = (function () {
  const SHEET = 'SYSTEM_CONFIGURATION';
  const HEADERS = ['Config ID','Category','Key','Value','Environment','Encrypted','Description','Modified By','Modified Date','Created At','Updated At'];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function setConfig(category, key, value, environment, encrypted, description) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    const existing = getRaw_(category, key, environment || 'Production');
    const row = {
      Category: category || 'General',
      Key: key,
      Value: encrypted ? REOS.Secrets.setSecret('CONFIG_' + category + '_' + key, value, category, '', 90)['Secret ID'] : value,
      Environment: environment || 'Production',
      Encrypted: encrypted === true,
      Description: description || '',
      'Modified By': REOS.Security.getCurrentUserEmail(),
      'Modified Date': new Date()
    };
    if (existing) return REOS.Database.update(SHEET, 'Config ID', existing['Config ID'], row);
    return REOS.Database.insert(SHEET, row, { idField: 'Config ID', idPrefix: 'CFG' });
  }

  function getConfig(category, key, environment) {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    const row = getRaw_(category, key, environment || 'Production');
    if (!row) return null;
    if (row.Encrypted === true) return Object.assign({}, row, { Value: '********' });
    return row;
  }

  function listConfig(environment) {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (row) {
      return !environment || String(row.Environment || '') === String(environment || '');
    }).map(function (row) {
      if (row.Encrypted === true) row.Value = '********';
      return row;
    });
  }

  function seedDefaults() {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    if (REOS.Database.getAll(SHEET).length) return 0;
    const defaults = [
      ['Branding','APP_NAME','REOS Enterprise'],
      ['Email','DEFAULT_FROM_NAME','REOS'],
      ['AI','AI_ENABLED','false'],
      ['API','API_ENABLED','true'],
      ['Security','TENANT_ISOLATION','true'],
      ['Storage','BACKUP_RETENTION_DAYS','90']
    ];
    defaults.forEach(function (d) { setConfig(d[0], d[1], d[2], 'Production', false, 'Default config'); });
    return defaults.length;
  }

  function getRaw_(category, key, environment) {
    return REOS.Database.query(SHEET, function (row) {
      return String(row.Category || '') === String(category || '') && String(row.Key || '') === String(key || '') && String(row.Environment || '') === String(environment || 'Production');
    })[0] || null;
  }

  return { ensureSheet: ensureSheet, setConfig: setConfig, getConfig: getConfig, listConfig: listConfig, seedDefaults: seedDefaults };
})();

function systemConfigSet(category, key, value, environment, encrypted, description) { return REOS.SystemConfig.setConfig(category, key, value, environment, encrypted, description); }
function systemConfigList(environment) { return REOS.SystemConfig.listConfig(environment); }
function systemConfigSeedDefaults() { return REOS.SystemConfig.seedDefaults(); }

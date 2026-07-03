/** REOS Enterprise v3.0 - Environment Management Administration */
var REOS = REOS || {};

REOS.EnvironmentManager = (function () {
  const SHEET = 'ENVIRONMENTS';
  const SNAPSHOT_SHEET = 'ENVIRONMENT_SNAPSHOTS';
  const ENV_HEADERS = ['Environment ID','Name','Status','Spreadsheet ID','Web App URL','Config JSON','Owner','Notes','Created At','Updated At'];
  const SNAP_HEADERS = ['Environment Snapshot ID','Environment','Snapshot At','Config JSON','Status','Notes','Created At','Updated At'];

  function ensureSheets() {
    ensureTable_(SHEET, ENV_HEADERS);
    ensureTable_(SNAPSHOT_SHEET, SNAP_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1,1,1,headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1,1,1,headers.length).setFontWeight('bold');
    }
  }

  function createEnvironment(record) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    record = record || {};
    record.Status = record.Status || 'Active';
    record.Owner = record.Owner || REOS.Security.getCurrentUserEmail();
    record['Config JSON'] = record['Config JSON'] || '{}';
    const validation = REOS.Validation.validateRecord(record, { required: ['Name'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    return REOS.Database.insert(SHEET, record, { idField: 'Environment ID', idPrefix: 'ENV' });
  }

  function listEnvironments() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.getAll(SHEET);
  }

  function createSnapshot(environment) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const config = REOS.SystemConfig.listConfig(environment || 'Production');
    return REOS.Database.insert(SNAPSHOT_SHEET, {
      Environment: environment || 'Production',
      'Snapshot At': new Date(),
      'Config JSON': JSON.stringify(config),
      Status: 'Captured',
      Notes: 'Configuration snapshot'
    }, { idField: 'Environment Snapshot ID', idPrefix: 'ENVS' });
  }

  function readiness(environment) {
    return {
      environment: environment || 'Production',
      diagnostics: REOS.SystemDiagnostics.runDiagnostics(),
      production: REOS.Deployment.readinessReport(),
      security: REOS.SecurityHardening.dashboard()
    };
  }

  return { ensureSheets: ensureSheets, createEnvironment: createEnvironment, listEnvironments: listEnvironments, createSnapshot: createSnapshot, readiness: readiness };
})();

function environmentsCreate(record) { return REOS.EnvironmentManager.createEnvironment(record || {}); }
function environmentsList() { return REOS.EnvironmentManager.listEnvironments(); }
function environmentsSnapshot(environment) { return REOS.EnvironmentManager.createSnapshot(environment); }
function environmentsReadiness(environment) { return REOS.EnvironmentManager.readiness(environment); }

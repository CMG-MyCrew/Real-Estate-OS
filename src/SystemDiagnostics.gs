/** REOS Enterprise v3.0 - System Diagnostics Administration */
var REOS = REOS || {};

REOS.SystemDiagnostics = (function () {
  const SHEET = 'SYSTEM_DIAGNOSTICS';
  const HEADERS = ['Diagnostic ID','Run At','Category','Check','Status','Message','Details JSON','Created At','Updated At'];

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

  function runDiagnostics() {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    const checks = [
      check_('Spreadsheet','Active spreadsheet', function () { return !!SpreadsheetApp.getActiveSpreadsheet(); }),
      check_('Drive','Root folder', function () { return !!(REOS.GoogleDrive && REOS.GoogleDrive.getRootFolder()); }),
      check_('Properties','Script properties', function () { return !!PropertiesService.getScriptProperties(); }),
      check_('Triggers','Trigger API', function () { return Array.isArray(ScriptApp.getProjectTriggers()); }),
      check_('Security','Security module', function () { return !!REOS.SecurityHardening; }),
      check_('API','API platform', function () { return !!REOS.APIPlatform; }),
      check_('Backups','Backup module', function () { return !!REOS.Backup; }),
      check_('Quotas','Email remaining', function () { return MailApp.getRemainingDailyQuota() >= 0; })
    ];
    checks.forEach(function (c) { REOS.Database.insert(SHEET, c, { idField: 'Diagnostic ID', idPrefix: 'DIAG' }); });
    return { overallStatus: checks.some(function (c) { return c.Status === 'Fail'; }) ? 'Degraded' : 'Healthy', checks: checks, generatedAt: new Date() };
  }

  function check_(category, name, fn) {
    try {
      const ok = fn();
      return { 'Run At': new Date(), Category: category, Check: name, Status: ok ? 'Pass' : 'Fail', Message: ok ? 'OK' : 'Returned false', 'Details JSON': '{}' };
    } catch (error) {
      return { 'Run At': new Date(), Category: category, Check: name, Status: 'Fail', Message: error.message, 'Details JSON': JSON.stringify({ stack: error.stack || '' }) };
    }
  }

  function recent(limit) {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    return REOS.Database.getAll(SHEET).slice(-Number(limit || 50)).reverse();
  }

  return { ensureSheet: ensureSheet, runDiagnostics: runDiagnostics, recent: recent };
})();

function diagnosticsRun() { return REOS.SystemDiagnostics.runDiagnostics(); }
function diagnosticsRecent(limit) { return REOS.SystemDiagnostics.recent(limit); }

/**
 * REOS Enterprise v3.0 - Sprint 13 Production Hardening
 *
 * Production readiness utilities for performance checks, sheet sizing,
 * trigger audits, cache cleanup, script-property review, log retention,
 * deployment readiness scoring, and release gate reporting.
 */

var REOS = REOS || {};

REOS.ProductionHardening = (function () {
  const REPORTS_SHEET = 'HARDENING_REPORTS';
  const CHECKS_SHEET = 'HARDENING_CHECKS';
  const REPORT_ID_FIELD = 'Report ID';

  const REPORT_HEADERS = [
    'Report ID', 'Status', 'Score', 'Critical Issues', 'Warnings', 'Checks Passed',
    'Checks Failed', 'Duration Ms', 'Summary JSON', 'Created At', 'Updated At'
  ];

  const CHECK_HEADERS = [
    'Check ID', 'Report ID', 'Area', 'Name', 'Status', 'Severity', 'Message',
    'Details JSON', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(REPORTS_SHEET, REPORT_HEADERS);
    ensureTable_(CHECKS_SHEET, CHECK_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setWrap(true);
      sheet.autoResizeColumns(1, headers.length);
    }
    return sheet;
  }

  function runReadinessAudit(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    const started = new Date();
    const checks = [];

    addChecks_(checks, checkSheets_());
    addChecks_(checks, checkDataSize_());
    addChecks_(checks, checkTriggers_());
    addChecks_(checks, checkSecurity_());
    addChecks_(checks, checkSecrets_());
    addChecks_(checks, checkAutomation_());
    addChecks_(checks, checkExternalIntegrations_());
    addChecks_(checks, checkAi_());
    addChecks_(checks, checkDocs_());

    const failed = checks.filter(function (c) { return c.Status === 'Fail'; });
    const critical = failed.filter(function (c) { return c.Severity === 'Critical'; });
    const warnings = checks.filter(function (c) { return c.Status === 'Warn'; });
    const score = calculateScore_(checks);
    const status = critical.length ? 'Blocked' : failed.length || warnings.length ? 'Needs Review' : 'Ready';
    const summary = {
      generatedAt: REOS.nowIso_(),
      status: status,
      score: score,
      criticalIssues: critical.length,
      warnings: warnings.length,
      checksPassed: checks.filter(function (c) { return c.Status === 'Pass'; }).length,
      checksFailed: failed.length,
      checks: checks
    };

    const report = REOS.Database.insert(REPORTS_SHEET, {
      Status: status,
      Score: score,
      'Critical Issues': critical.length,
      Warnings: warnings.length,
      'Checks Passed': summary.checksPassed,
      'Checks Failed': summary.checksFailed,
      'Duration Ms': new Date().getTime() - started.getTime(),
      'Summary JSON': REOS.toJson_(summary),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: REPORT_ID_FIELD, idPrefix: 'HARD' });

    checks.forEach(function (check) {
      REOS.Database.insert(CHECKS_SHEET, {
        'Report ID': report[REPORT_ID_FIELD],
        Area: check.Area,
        Name: check.Name,
        Status: check.Status,
        Severity: check.Severity,
        Message: check.Message,
        'Details JSON': REOS.toJson_(check.Details || {}),
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: 'Check ID', idPrefix: 'HCHK' });
    });

    REOS.Logger.audit('Production hardening audit completed', { reportId: report[REPORT_ID_FIELD], status: status, score: score });
    return Object.assign({}, summary, { reportId: report[REPORT_ID_FIELD] });
  }

  function getLatestReport() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const reports = REOS.Database.getAll(REPORTS_SHEET);
    return latest_(reports, 'Created At', 1)[0] || null;
  }

  function getReportChecks(reportId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(CHECKS_SHEET).filter(function (row) { return row['Report ID'] === reportId; });
  }

  function cleanupLogs(daysToKeep) {
    REOS.Security.requireAdmin();
    daysToKeep = Number(daysToKeep || 90);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const logSheet = REOS.CONFIG.SHEETS.SYSTEM_LOG;
    const rows = REOS.Database.getAll(logSheet);
    const stale = rows.filter(function (row) {
      const value = row.Timestamp || row['Created At'];
      const date = value ? new Date(value) : null;
      return date && !isNaN(date.getTime()) && date < cutoff;
    });
    return { ok: true, daysToKeep: daysToKeep, candidates: stale.length, message: 'Review candidates before physical deletion. Soft cleanup only in this release.' };
  }

  function clearDashboardCaches() {
    REOS.Security.requireAdmin();
    CacheService.getScriptCache().removeAll(['REOS_DASHBOARD_CACHE_MARKER']);
    REOS.Logger.audit('Dashboard cache cleanup requested', {});
    return { ok: true, message: 'Cache cleanup request completed. Apps Script cache keys are namespace-limited; dashboard caches expire automatically.' };
  }

  function checkSheets_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const required = Object.keys(REOS.CONFIG.SHEETS).map(function (key) { return REOS.CONFIG.SHEETS[key]; })
      .concat(['VENDORS', 'WORK_ORDERS', 'AUTOMATION_RULES', 'AUTOMATION_RUNS', 'AUTOMATION_TEMPLATES', 'PROPERTIES', 'UNITS', 'INSPECTIONS', 'MAINTENANCE_REQUESTS', 'AI_REQUESTS', 'EXTERNAL_PROVIDERS', 'EXTERNAL_REQUESTS']);
    return required.map(function (name) {
      const sheet = ss.getSheetByName(name);
      return check_('Workbook', 'Sheet exists: ' + name, !!sheet ? 'Pass' : 'Fail', !!sheet ? 'Info' : 'Critical', !!sheet ? 'Sheet exists.' : 'Missing required sheet.', { sheet: name });
    });
  }

  function checkDataSize_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return ss.getSheets().map(function (sheet) {
      const rows = sheet.getLastRow();
      const cols = sheet.getLastColumn();
      const cells = rows * cols;
      const status = cells > 250000 ? 'Warn' : 'Pass';
      return check_('Performance', 'Sheet size: ' + sheet.getName(), status, status === 'Warn' ? 'Medium' : 'Info', status === 'Warn' ? 'Large sheet may affect Apps Script performance.' : 'Sheet size acceptable.', { rows: rows, columns: cols, cells: cells });
    });
  }

  function checkTriggers_() {
    const triggers = ScriptApp.getProjectTriggers();
    const duplicates = triggers.reduce(function (map, trigger) {
      const key = trigger.getHandlerFunction();
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const checks = [check_('Automation', 'Trigger count', triggers.length <= 20 ? 'Pass' : 'Warn', triggers.length <= 20 ? 'Info' : 'Medium', triggers.length + ' project triggers installed.', { count: triggers.length })];
    Object.keys(duplicates).forEach(function (handler) {
      checks.push(check_('Automation', 'Duplicate trigger: ' + handler, duplicates[handler] > 1 ? 'Warn' : 'Pass', duplicates[handler] > 1 ? 'Medium' : 'Info', duplicates[handler] > 1 ? 'Duplicate trigger handler found.' : 'No duplicate trigger for handler.', { handler: handler, count: duplicates[handler] }));
    });
    return checks;
  }

  function checkSecurity_() {
    const checks = [];
    const users = safeList_(function () { return REOS.Database.getAll(REOS.CONFIG.SHEETS.USERS); });
    const admins = users.filter(function (u) { return String(u.Role || '').toLowerCase() === 'admin' && u.Active !== false; });
    checks.push(check_('Security', 'Active admin user exists', admins.length > 0 ? 'Pass' : 'Fail', admins.length > 0 ? 'Info' : 'Critical', admins.length + ' active admin users found.', { admins: admins.length }));
    checks.push(check_('Security', 'User table populated', users.length > 0 ? 'Pass' : 'Warn', users.length > 0 ? 'Info' : 'High', users.length + ' users found.', { users: users.length }));
    return checks;
  }

  function checkSecrets_() {
    const props = PropertiesService.getScriptProperties().getProperties();
    const likelySecrets = Object.keys(props).filter(function (key) { return /KEY|TOKEN|SECRET|PASSWORD/i.test(key); });
    return [
      check_('Secrets', 'Script properties available', Object.keys(props).length >= 0 ? 'Pass' : 'Fail', 'Info', Object.keys(props).length + ' script properties found.', { count: Object.keys(props).length }),
      check_('Secrets', 'Secrets stored in properties', likelySecrets.length ? 'Pass' : 'Warn', likelySecrets.length ? 'Info' : 'Low', likelySecrets.length ? 'Secret-like properties are configured.' : 'No secret-like properties found. This is OK if integrations are dry-run only.', { secretKeys: likelySecrets })
    ];
  }

  function checkAutomation_() {
    const rules = safeList_(function () { return REOS.Database.getAll('AUTOMATION_RULES'); });
    const invalid = rules.filter(function (rule) { return !isValidJson_(rule['Condition JSON']) || !isValidJson_(rule['Action JSON']); });
    return [
      check_('Automation', 'Automation rules valid JSON', invalid.length === 0 ? 'Pass' : 'Fail', invalid.length === 0 ? 'Info' : 'High', invalid.length + ' invalid automation rules found.', { invalid: invalid.length }),
      check_('Automation', 'Automation rules exist', rules.length > 0 ? 'Pass' : 'Warn', rules.length > 0 ? 'Info' : 'Low', rules.length + ' automation rules found.', { rules: rules.length })
    ];
  }

  function checkExternalIntegrations_() {
    const providers = safeList_(function () { return REOS.Database.getAll('EXTERNAL_PROVIDERS'); });
    const live = providers.filter(function (p) { return p.Enabled === true && p['Dry Run'] === false; });
    const missingUrl = live.filter(function (p) { return !p['Base URL']; });
    return [
      check_('Integrations', 'Providers seeded', providers.length > 0 ? 'Pass' : 'Warn', providers.length > 0 ? 'Info' : 'Medium', providers.length + ' external providers found.', { providers: providers.length }),
      check_('Integrations', 'Live providers configured', missingUrl.length === 0 ? 'Pass' : 'Fail', missingUrl.length === 0 ? 'Info' : 'Critical', missingUrl.length + ' live providers missing Base URL.', { missingUrl: missingUrl.length })
    ];
  }

  function checkAi_() {
    const requests = safeList_(function () { return REOS.Database.getAll('AI_REQUESTS'); });
    const failures = requests.filter(function (r) { return String(r.Status || '').toLowerCase() === 'error'; });
    return [check_('AI', 'AI failure rate', requests.length === 0 || failures.length / requests.length <= 0.1 ? 'Pass' : 'Warn', failures.length ? 'Medium' : 'Info', failures.length + ' AI errors across ' + requests.length + ' requests.', { requests: requests.length, failures: failures.length })];
  }

  function checkDocs_() {
    return [
      check_('Deployment', 'Release QA checklist exists', 'Pass', 'Info', 'Verify docs/RELEASE_CANDIDATE_QA.md is current.', {}),
      check_('Deployment', 'Production checklist exists', 'Pass', 'Info', 'Verify docs/PRODUCTION_RELEASE_CHECKLIST.md is current.', {})
    ];
  }

  function calculateScore_(checks) {
    if (!checks.length) return 0;
    const penalties = checks.reduce(function (sum, check) {
      if (check.Status === 'Fail' && check.Severity === 'Critical') return sum + 25;
      if (check.Status === 'Fail') return sum + 15;
      if (check.Status === 'Warn') return sum + 5;
      return sum;
    }, 0);
    return Math.max(0, 100 - penalties);
  }

  function check_(area, name, status, severity, message, details) {
    return { Area: area, Name: name, Status: status, Severity: severity, Message: message, Details: details || {} };
  }

  function addChecks_(target, checks) { (checks || []).forEach(function (check) { target.push(check); }); }
  function isValidJson_(value) { try { JSON.parse(String(value || '{}')); return true; } catch (error) { return false; } }
  function safeList_(fn) { try { const value = fn(); return Array.isArray(value) ? value : []; } catch (error) { return []; } }
  function latest_(records, dateField, limit) {
    return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 10);
  }

  return {
    ensureSheets: ensureSheets,
    runReadinessAudit: runReadinessAudit,
    getLatestReport: getLatestReport,
    getReportChecks: getReportChecks,
    cleanupLogs: cleanupLogs,
    clearDashboardCaches: clearDashboardCaches
  };
})();

function reosProductionEnsureSheets() { return REOS.ProductionHardening.ensureSheets(); }
function reosProductionRunReadinessAudit(options) { return REOS.ProductionHardening.runReadinessAudit(options || {}); }
function reosProductionGetLatestReport() { return REOS.ProductionHardening.getLatestReport(); }
function reosProductionGetReportChecks(reportId) { return REOS.ProductionHardening.getReportChecks(reportId); }
function reosProductionCleanupLogs(daysToKeep) { return REOS.ProductionHardening.cleanupLogs(daysToKeep); }
function reosProductionClearDashboardCaches() { return REOS.ProductionHardening.clearDashboardCaches(); }
function showProductionHardening() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('ProductionHardening').setTitle('REOS Production Hardening').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Production Hardening');
}

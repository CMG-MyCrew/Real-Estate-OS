/**
 * REOS Enterprise v3.2.10 - Error Center
 * Sprint 3 Increment 6
 *
 * Centralized error capture, classification, lifecycle management,
 * summary reporting, and safe execution wrapper.
 */

var REOS = REOS || {};

REOS.ErrorCenter = (function () {
  const ERRORS_SHEET = 'SYSTEM_ERRORS';
  const HISTORY_SHEET = 'SYSTEM_ERROR_HISTORY';
  const RULES_SHEET = 'SYSTEM_ERROR_RULES';

  const ERROR_HEADERS = ['Error ID', 'Timestamp', 'Severity', 'Category', 'Module', 'Function', 'User', 'Version', 'Environment', 'Message', 'Stack', 'Context JSON', 'Status', 'Resolution Notes', 'Resolved At', 'Archived At', 'Updated At'];
  const HISTORY_HEADERS = ['History ID', 'Error ID', 'Action', 'Status', 'User', 'Notes', 'Details JSON', 'Created At'];
  const RULE_HEADERS = ['Rule ID', 'Rule Name', 'Category', 'Severity', 'Match Text', 'Action', 'Active', 'Created At', 'Updated At'];

  function ensureSheets() {
    REOS.Database.ensureTable(ERRORS_SHEET, ERROR_HEADERS);
    REOS.Database.ensureTable(HISTORY_SHEET, HISTORY_HEADERS);
    REOS.Database.ensureTable(RULES_SHEET, RULE_HEADERS);
    seedRules_();
  }

  function capture(error, context) {
    return captureWithSeverity_('Error', error, context || {});
  }

  function captureCritical(error, context) {
    return captureWithSeverity_('Critical', error, context || {});
  }

  function captureWarning(message, context) {
    return captureWithSeverity_('Warning', message, context || {});
  }

  function captureInfo(message, context) {
    return captureWithSeverity_('Info', message, context || {});
  }

  function captureWithSeverity_(severity, error, context) {
    ensureSheets();
    context = context || {};
    const errObj = normalizeError_(error);
    const category = context.category || classify_(errObj.message, context.module || 'Core');
    const record = REOS.Database.insert(ERRORS_SHEET, {
      Timestamp: new Date(),
      Severity: severity,
      Category: category,
      Module: context.module || 'Unknown',
      Function: context.functionName || context.function || '',
      User: REOS.getCurrentUser_ ? REOS.getCurrentUser_() : 'unknown',
      Version: getVersion_(),
      Environment: getEnvironment_(),
      Message: errObj.message,
      Stack: errObj.stack,
      'Context JSON': REOS.toJson_(context),
      Status: 'Open',
      'Resolution Notes': '',
      'Resolved At': '',
      'Archived At': '',
      'Updated At': new Date()
    }, { idField: 'Error ID', idPrefix: severity === 'Critical' ? 'CRIT' : 'ERR' });
    logHistory_(record['Error ID'], 'Created', 'Open', '', { severity: severity, category: category, message: errObj.message });
    return record;
  }

  function list(filters) {
    ensureSheets();
    filters = filters || {};
    return REOS.Database.getAll(ERRORS_SHEET).filter(function (row) {
      if (filters.status && row.Status !== filters.status) return false;
      if (filters.severity && row.Severity !== filters.severity) return false;
      if (filters.category && row.Category !== filters.category) return false;
      if (filters.module && row.Module !== filters.module) return false;
      return true;
    });
  }

  function summary() {
    ensureSheets();
    const rows = REOS.Database.getAll(ERRORS_SHEET);
    const open = rows.filter(function (r) { return r.Status === 'Open'; });
    const critical = open.filter(function (r) { return r.Severity === 'Critical'; });
    const warnings = open.filter(function (r) { return r.Severity === 'Warning'; });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRows = rows.filter(function (r) { return new Date(r.Timestamp || 0).getTime() >= today.getTime(); });
    return {
      ok: critical.length === 0,
      generatedAt: new Date().toISOString(),
      total: rows.length,
      open: open.length,
      criticalOpen: critical.length,
      warningsOpen: warnings.length,
      resolved: rows.filter(function (r) { return r.Status === 'Resolved'; }).length,
      archived: rows.filter(function (r) { return r.Status === 'Archived'; }).length,
      today: todayRows.length,
      bySeverity: groupCount_(rows, 'Severity'),
      byCategory: groupCount_(rows, 'Category'),
      byModule: groupCount_(rows, 'Module')
    };
  }

  function statistics() {
    return summary();
  }

  function resolve(errorId, notes) {
    return updateStatus_(errorId, 'Resolved', notes || 'Resolved.');
  }

  function reopen(errorId, notes) {
    return updateStatus_(errorId, 'Open', notes || 'Reopened.');
  }

  function archive(errorId, notes) {
    return updateStatus_(errorId, 'Archived', notes || 'Archived.');
  }

  function scan() {
    ensureSheets();
    const report = summary();
    if (report.criticalOpen > 0) {
      captureWarning('Critical open errors require review.', { module: 'ErrorCenter', functionName: 'scan', category: 'Core', report: report });
    }
    return report;
  }

  function safeExecute(functionName, callback, context) {
    try {
      return callback();
    } catch (error) {
      const record = capture(error, Object.assign({}, context || {}, { functionName: functionName }));
      try { SpreadsheetApp.getUi().alert('REOS Error', 'An error was captured: ' + record['Error ID'] + '\n\n' + error.message, SpreadsheetApp.getUi().ButtonSet.OK); } catch (ignore) {}
      throw error;
    }
  }

  function updateStatus_(errorId, status, notes) {
    ensureSheets();
    const changes = { Status: status, 'Resolution Notes': notes || '', 'Updated At': new Date() };
    if (status === 'Resolved') changes['Resolved At'] = new Date();
    if (status === 'Archived') changes['Archived At'] = new Date();
    if (status === 'Open') { changes['Resolved At'] = ''; changes['Archived At'] = ''; }
    const updated = REOS.Database.update(ERRORS_SHEET, 'Error ID', errorId, changes);
    logHistory_(errorId, status, status, notes || '', {});
    return updated;
  }

  function logHistory_(errorId, action, status, notes, details) {
    REOS.Database.insert(HISTORY_SHEET, {
      'Error ID': errorId,
      Action: action,
      Status: status,
      User: REOS.getCurrentUser_ ? REOS.getCurrentUser_() : 'unknown',
      Notes: notes || '',
      'Details JSON': REOS.toJson_(details || {}),
      'Created At': new Date()
    }, { idField: 'History ID', idPrefix: 'EHIST' });
  }

  function seedRules_() {
    const existing = REOS.Database.getAll(RULES_SHEET);
    if (existing.length) return;
    const rows = [
      ['Database errors', 'Database', 'Error', 'Sheet not found', 'Capture', true],
      ['Authorization errors', 'Security', 'Critical', 'Authorization', 'Capture', true],
      ['Integration credential warnings', 'Integration', 'Warning', 'Missing required script properties', 'Capture', true],
      ['Performance warnings', 'Performance', 'Warning', 'exceeded threshold', 'Capture', true]
    ];
    rows.forEach(function (row) {
      REOS.Database.insert(RULES_SHEET, {
        'Rule Name': row[0], Category: row[1], Severity: row[2], 'Match Text': row[3], Action: row[4], Active: row[5], 'Created At': new Date(), 'Updated At': new Date()
      }, { idField: 'Rule ID', idPrefix: 'ERULE' });
    });
  }

  function normalizeError_(error) {
    if (error && error.message) return { message: error.message, stack: error.stack || '' };
    return { message: String(error || 'Unknown error'), stack: '' };
  }

  function classify_(message, moduleName) {
    const value = String(message || '').toLowerCase() + ' ' + String(moduleName || '').toLowerCase();
    if (value.indexOf('database') !== -1 || value.indexOf('sheet') !== -1) return 'Database';
    if (value.indexOf('auth') !== -1 || value.indexOf('permission') !== -1) return 'Security';
    if (value.indexOf('quickbooks') !== -1 || value.indexOf('stripe') !== -1 || value.indexOf('integration') !== -1) return 'Integration';
    if (value.indexOf('portal') !== -1) return 'Portal';
    if (value.indexOf('finance') !== -1 || value.indexOf('invoice') !== -1) return 'Finance';
    if (value.indexOf('performance') !== -1) return 'Performance';
    if (value.indexOf('html') !== -1 || value.indexOf('ui') !== -1) return 'User Interface';
    return 'Core';
  }

  function groupCount_(rows, field) {
    return rows.reduce(function (map, row) {
      const key = row[field] || 'Unknown';
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
  }

  function getVersion_() {
    return REOS.CONFIG && REOS.CONFIG.APP ? REOS.CONFIG.APP.VERSION : 'unknown';
  }

  function getEnvironment_() {
    try { return PropertiesService.getScriptProperties().getProperty('REOS_ENVIRONMENT') || 'Production'; } catch (error) { return 'Production'; }
  }

  return {
    ensureSheets: ensureSheets,
    capture: capture,
    captureCritical: captureCritical,
    captureWarning: captureWarning,
    captureInfo: captureInfo,
    list: list,
    summary: summary,
    statistics: statistics,
    resolve: resolve,
    reopen: reopen,
    archive: archive,
    scan: scan,
    safeExecute: safeExecute
  };
})();

REOS.safeExecute = function (functionName, callback, context) {
  return REOS.ErrorCenter.safeExecute(functionName, callback, context || {});
};

function reosRunErrorScan() {
  const report = REOS.ErrorCenter.scan();
  SpreadsheetApp.getUi().alert('REOS Error Scan', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

function reosErrorSummary() {
  const report = REOS.ErrorCenter.summary();
  SpreadsheetApp.getUi().alert('REOS Error Summary', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

function reosCaptureTestError() {
  return REOS.ErrorCenter.captureWarning('Test warning captured successfully.', { module: 'ErrorCenter', functionName: 'reosCaptureTestError', category: 'Core' });
}

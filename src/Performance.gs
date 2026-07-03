/**
 * REOS Enterprise v3.0 - Performance Profiler & Quota Monitor
 *
 * Performance timing logs, quota snapshots, slow operation reporting,
 * and scalability dashboard.
 */

var REOS = REOS || {};

REOS.Performance = (function () {
  const PERF_SHEET = 'PERFORMANCE_LOG';
  const QUOTA_SHEET = 'QUOTA_MONITOR';

  const PERF_HEADERS = [
    'Performance ID', 'Timestamp', 'Module', 'Operation', 'Duration MS',
    'Status', 'Details JSON', 'Created At', 'Updated At'
  ];

  const QUOTA_HEADERS = [
    'Quota ID', 'Timestamp', 'Email Remaining', 'Triggers Count',
    'Script Timezone', 'Spreadsheet ID', 'Status', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(PERF_SHEET, PERF_HEADERS);
    ensureTable_(QUOTA_SHEET, QUOTA_HEADERS);
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

  function log(module, operation, durationMs, details, status) {
    try {
      ensureSheets();
      return REOS.Database.insert(PERF_SHEET, {
        Timestamp: new Date(),
        Module: module || '',
        Operation: operation || '',
        'Duration MS': Number(durationMs || 0),
        Status: status || (Number(durationMs || 0) > 5000 ? 'Slow' : 'OK'),
        'Details JSON': JSON.stringify(details || {})
      }, { idField: 'Performance ID', idPrefix: 'PERF' });
    } catch (ignore) {}
  }

  function measure(module, operation, fn) {
    const started = Date.now();
    try {
      const result = fn();
      log(module, operation, Date.now() - started, {}, 'OK');
      return result;
    } catch (error) {
      log(module, operation, Date.now() - started, { error: error.message }, 'Error');
      throw error;
    }
  }

  function captureQuotaSnapshot() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    const row = REOS.Database.insert(QUOTA_SHEET, {
      Timestamp: new Date(),
      'Email Remaining': MailApp.getRemainingDailyQuota(),
      'Triggers Count': ScriptApp.getProjectTriggers().length,
      'Script Timezone': Session.getScriptTimeZone(),
      'Spreadsheet ID': SpreadsheetApp.getActiveSpreadsheet().getId(),
      Status: 'Captured'
    }, { idField: 'Quota ID', idPrefix: 'QUOTA' });
    return row;
  }

  function slowOperations(limit) {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.getAll(PERF_SHEET)
      .filter(function (row) { return Number(row['Duration MS'] || 0) >= 1000 || row.Status === 'Slow'; })
      .sort(function (a, b) { return Number(b['Duration MS'] || 0) - Number(a['Duration MS'] || 0); })
      .slice(0, Number(limit || 25));
  }

  function dashboard() {
    ensureSheets();
    const logs = REOS.Database.getAll(PERF_SHEET).slice(-500);
    const quotas = REOS.Database.getAll(QUOTA_SHEET).slice(-25).reverse();
    const durations = logs.map(function (r) { return Number(r['Duration MS'] || 0); });
    const avg = durations.length ? Math.round(durations.reduce(function (a, b) { return a + b; }, 0) / durations.length) : 0;
    return {
      logCount: logs.length,
      averageDurationMs: avg,
      slowCount: logs.filter(function (r) { return Number(r['Duration MS'] || 0) >= 1000 || r.Status === 'Slow'; }).length,
      errorCount: logs.filter(function (r) { return r.Status === 'Error'; }).length,
      slowOperations: slowOperations(25),
      quotaSnapshots: quotas,
      cache: REOS.Cache.dashboard(),
      jobs: REOS.JobQueue.dashboard()
    };
  }

  return { ensureSheets: ensureSheets, log: log, measure: measure, captureQuotaSnapshot: captureQuotaSnapshot, slowOperations: slowOperations, dashboard: dashboard };
})();

function performanceDashboard() { return REOS.Performance.dashboard(); }
function performanceCaptureQuota() { return REOS.Performance.captureQuotaSnapshot(); }
function performanceSlowOperations(limit) { return REOS.Performance.slowOperations(limit); }

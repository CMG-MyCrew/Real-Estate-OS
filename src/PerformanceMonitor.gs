/**
 * REOS Enterprise v3.2.10 - Performance Monitor
 * Sprint 3 Increment 5
 *
 * Measures Apps Script and spreadsheet operation timing for startup,
 * menu build, database reads/writes, sheet listing, module health, diagnostics,
 * environment checks, and integration monitor readiness.
 */

var REOS = REOS || {};

REOS.PerformanceMonitor = (function () {
  const SNAPSHOT_SHEET = 'SYSTEM_PERFORMANCE';
  const HISTORY_SHEET = 'SYSTEM_PERFORMANCE_HISTORY';

  const SNAPSHOT_HEADERS = ['Metric Key', 'Category', 'Metric Name', 'Status', 'Duration Ms', 'Threshold Ms', 'Message', 'Details JSON', 'Updated At'];
  const HISTORY_HEADERS = ['Performance Run ID', 'Metric Key', 'Category', 'Metric Name', 'Status', 'Duration Ms', 'Threshold Ms', 'Message', 'Details JSON', 'Created At'];

  const METRICS = [
    { key: 'spreadsheet.listSheets', category: 'Spreadsheet', name: 'List Sheets', thresholdMs: 1500, fn: measureListSheets_ },
    { key: 'spreadsheet.getActive', category: 'Spreadsheet', name: 'Get Active Spreadsheet', thresholdMs: 500, fn: measureGetActive_ },
    { key: 'database.readSettings', category: 'Database', name: 'Read Settings Table', thresholdMs: 1500, fn: measureDbRead_ },
    { key: 'database.writeTemp', category: 'Database', name: 'Write Temporary Row', thresholdMs: 2500, fn: measureDbWrite_ },
    { key: 'modules.health', category: 'Modules', name: 'Module Health Report', thresholdMs: 5000, fn: measureModuleHealth_ },
    { key: 'environment.summary', category: 'Environment', name: 'Environment Summary', thresholdMs: 1500, fn: measureEnvironmentSummary_ },
    { key: 'integration.summary', category: 'Integrations', name: 'Integration Summary', thresholdMs: 1500, fn: measureIntegrationSummary_ },
    { key: 'menu.build', category: 'UI', name: 'Menu Build Dry Run', thresholdMs: 500, fn: measureMenuDryRun_ }
  ];

  function ensureSheets() {
    REOS.Database.ensureTable(SNAPSHOT_SHEET, SNAPSHOT_HEADERS);
    REOS.Database.ensureTable(HISTORY_SHEET, HISTORY_HEADERS);
  }

  function run() {
    ensureSheets();
    const runId = REOS.generateId_('PERF');
    const started = Date.now();
    const results = METRICS.map(function (metric) { return measureMetric_(metric); });
    persistSnapshot_(results);
    persistHistory_(runId, results);
    const warn = results.filter(function (r) { return r.status === 'Warn'; }).length;
    const fail = results.filter(function (r) { return r.status === 'Fail'; }).length;
    return {
      ok: fail === 0,
      runId: runId,
      version: getVersion_(),
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      total: results.length,
      pass: results.filter(function (r) { return r.status === 'Pass'; }).length,
      warn: warn,
      fail: fail,
      score: calculateScore_(results),
      metrics: results
    };
  }

  function quickCheck() {
    ensureSheets();
    const metrics = ['spreadsheet.getActive', 'spreadsheet.listSheets', 'database.readSettings'];
    const selected = METRICS.filter(function (metric) { return metrics.indexOf(metric.key) !== -1; });
    const results = selected.map(function (metric) { return measureMetric_(metric); });
    return { ok: results.filter(function (r) { return r.status === 'Fail'; }).length === 0, score: calculateScore_(results), metrics: results };
  }

  function summary() {
    ensureSheets();
    const rows = REOS.Database.getAll(SNAPSHOT_SHEET);
    return {
      ok: rows.filter(function (r) { return r.Status === 'Fail'; }).length === 0,
      generatedAt: new Date().toISOString(),
      total: rows.length,
      pass: rows.filter(function (r) { return r.Status === 'Pass'; }).length,
      warn: rows.filter(function (r) { return r.Status === 'Warn'; }).length,
      fail: rows.filter(function (r) { return r.Status === 'Fail'; }).length,
      metrics: rows
    };
  }

  function measureMetric_(metric) {
    const started = Date.now();
    try {
      const details = metric.fn() || {};
      const durationMs = Date.now() - started;
      const status = durationMs <= metric.thresholdMs ? 'Pass' : 'Warn';
      return {
        key: metric.key,
        category: metric.category,
        name: metric.name,
        status: status,
        durationMs: durationMs,
        thresholdMs: metric.thresholdMs,
        message: status === 'Pass' ? 'Metric completed within threshold.' : 'Metric exceeded threshold.',
        details: details
      };
    } catch (error) {
      return {
        key: metric.key,
        category: metric.category,
        name: metric.name,
        status: 'Fail',
        durationMs: Date.now() - started,
        thresholdMs: metric.thresholdMs,
        message: error.message,
        details: { stack: error.stack || '' }
      };
    }
  }

  function measureListSheets_() {
    const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    return { count: sheets.length };
  }

  function measureGetActive_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return { id: ss.getId(), name: ss.getName() };
  }

  function measureDbRead_() {
    const sheetName = REOS.CONFIG.SHEETS.SETTINGS || 'SETTINGS';
    const rows = REOS.Database.getAll(sheetName);
    return { sheetName: sheetName, rows: rows.length };
  }

  function measureDbWrite_() {
    const sheetName = 'SYSTEM_PERFORMANCE_TEST';
    REOS.Database.ensureTable(sheetName, ['Test ID', 'Created At']);
    const inserted = REOS.Database.insert(sheetName, { 'Created At': new Date() }, { idField: 'Test ID', idPrefix: 'PTST' });
    return { sheetName: sheetName, testId: inserted['Test ID'] };
  }

  function measureModuleHealth_() {
    if (!(REOS.Modules && typeof REOS.Modules.healthReport === 'function')) return { skipped: true, reason: 'Module registry unavailable' };
    const report = REOS.Modules.healthReport();
    return { ok: report.ok, modules: report.modules ? report.modules.length : 0 };
  }

  function measureEnvironmentSummary_() {
    if (!(REOS.EnvironmentValidator && typeof REOS.EnvironmentValidator.summary === 'function')) return { skipped: true, reason: 'Environment validator unavailable' };
    return REOS.EnvironmentValidator.summary();
  }

  function measureIntegrationSummary_() {
    if (!(REOS.IntegrationMonitor && typeof REOS.IntegrationMonitor.summary === 'function')) return { skipped: true, reason: 'Integration monitor unavailable' };
    return REOS.IntegrationMonitor.summary();
  }

  function measureMenuDryRun_() {
    return { menuBuilderAvailable: !!(REOS.buildMenu_ && typeof REOS.buildMenu_ === 'function') };
  }

  function persistSnapshot_(results) {
    clearBody_(SNAPSHOT_SHEET);
    results.forEach(function (result) {
      REOS.Database.insert(SNAPSHOT_SHEET, {
        'Metric Key': result.key,
        Category: result.category,
        'Metric Name': result.name,
        Status: result.status,
        'Duration Ms': result.durationMs,
        'Threshold Ms': result.thresholdMs,
        Message: result.message,
        'Details JSON': REOS.toJson_(result.details || {}),
        'Updated At': new Date()
      }, {});
    });
  }

  function persistHistory_(runId, results) {
    results.forEach(function (result) {
      REOS.Database.insert(HISTORY_SHEET, {
        'Performance Run ID': runId,
        'Metric Key': result.key,
        Category: result.category,
        'Metric Name': result.name,
        Status: result.status,
        'Duration Ms': result.durationMs,
        'Threshold Ms': result.thresholdMs,
        Message: result.message,
        'Details JSON': REOS.toJson_(result.details || {}),
        'Created At': new Date()
      }, {});
    });
  }

  function calculateScore_(results) {
    if (!results.length) return 100;
    let score = 0;
    results.forEach(function (result) {
      score += result.status === 'Pass' ? 1 : result.status === 'Warn' ? 0.5 : 0;
    });
    return Math.round((score / results.length) * 100);
  }

  function clearBody_(sheetName) {
    const sheet = REOS.Database.getSheet(sheetName);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  function getVersion_() {
    return REOS.CONFIG && REOS.CONFIG.APP ? REOS.CONFIG.APP.VERSION : 'unknown';
  }

  return { ensureSheets: ensureSheets, run: run, quickCheck: quickCheck, summary: summary };
})();

function reosRunPerformanceMonitor() {
  const report = REOS.PerformanceMonitor.run();
  SpreadsheetApp.getUi().alert('REOS Performance Monitor', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

function reosPerformanceSummary() {
  const report = REOS.PerformanceMonitor.summary();
  SpreadsheetApp.getUi().alert('REOS Performance Summary', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

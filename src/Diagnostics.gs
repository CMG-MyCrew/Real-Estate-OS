/**
 * REOS Enterprise v3.2.9 - Diagnostics Framework
 * Sprint 3 Increment 1
 *
 * Provides production diagnostics for startup, dependencies, sheets,
 * modules, script properties, triggers, HTML availability, and performance timing.
 */

var REOS = REOS || {};

REOS.Diagnostics = (function () {
  const DIAGNOSTIC_RUNS_SHEET = 'DIAGNOSTIC_RUNS';
  const DIAGNOSTIC_CHECKS_SHEET = 'DIAGNOSTIC_CHECKS';

  const RUN_HEADERS = ['Diagnostic Run ID', 'Version', 'Status', 'Score', 'Started At', 'Completed At', 'Duration Ms', 'Summary JSON', 'Created At'];
  const CHECK_HEADERS = ['Diagnostic Check ID', 'Diagnostic Run ID', 'Category', 'Check Name', 'Status', 'Severity', 'Message', 'Details JSON', 'Duration Ms', 'Created At'];

  function ensureSheets() {
    REOS.Database.ensureTable(DIAGNOSTIC_RUNS_SHEET, RUN_HEADERS);
    REOS.Database.ensureTable(DIAGNOSTIC_CHECKS_SHEET, CHECK_HEADERS);
  }

  function run() {
    ensureSheets();
    const startedAt = new Date();
    const timer = startTimer_();
    const runId = REOS.generateId_('DIAG');
    const checks = [];

    collect_(checks, 'Startup', startupCheck);
    collect_(checks, 'Dependencies', dependencyCheck);
    collect_(checks, 'Sheets', sheetCheck);
    collect_(checks, 'Modules', moduleCheck);
    collect_(checks, 'Properties', propertyCheck);
    collect_(checks, 'Triggers', triggerCheck);
    collect_(checks, 'HTML', htmlCheck);
    collect_(checks, 'Performance', performanceCheck);
    collect_(checks, 'Integrations', integrationCheck);

    const completedAt = new Date();
    const score = calculateScore_(checks);
    const status = checks.some(function (c) { return c.status === 'Fail' && c.severity === 'Critical'; }) ? 'Fail' : checks.some(function (c) { return c.status === 'Warn'; }) ? 'Warn' : 'Pass';
    const summary = summarize_(checks);

    REOS.Database.insert(DIAGNOSTIC_RUNS_SHEET, {
      'Diagnostic Run ID': runId,
      Version: getVersion_(),
      Status: status,
      Score: score,
      'Started At': startedAt,
      'Completed At': completedAt,
      'Duration Ms': timer.elapsed(),
      'Summary JSON': REOS.toJson_(summary),
      'Created At': new Date()
    }, {});

    checks.forEach(function (check) {
      REOS.Database.insert(DIAGNOSTIC_CHECKS_SHEET, {
        'Diagnostic Run ID': runId,
        Category: check.category,
        'Check Name': check.name,
        Status: check.status,
        Severity: check.severity,
        Message: check.message,
        'Details JSON': REOS.toJson_(check.details || {}),
        'Duration Ms': check.durationMs || 0,
        'Created At': new Date()
      }, { idField: 'Diagnostic Check ID', idPrefix: 'DCHK' });
    });

    return { ok: status !== 'Fail', runId: runId, version: getVersion_(), status: status, score: score, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), durationMs: timer.elapsed(), summary: summary, checks: checks };
  }

  function startupCheck() {
    const checks = [];
    checks.push(assert_('REOS namespace', !!REOS, 'Critical', 'REOS namespace is available.'));
    checks.push(assert_('Config loaded', !!(REOS.CONFIG && REOS.CONFIG.APP), 'Critical', 'REOS configuration is loaded.', REOS.CONFIG && REOS.CONFIG.APP));
    checks.push(assert_('Database loaded', !!(REOS.Database && typeof REOS.Database.ensureTable === 'function'), 'Critical', 'Database framework is loaded.'));
    checks.push(assert_('Core foundation loaded', !!(REOS.CoreFoundation && typeof REOS.CoreFoundation.diagnose === 'function'), 'High', 'Core foundation is loaded.'));
    checks.push(assert_('Module registry loaded', !!(REOS.Modules && typeof REOS.Modules.healthReport === 'function'), 'High', 'Module registry is loaded.'));
    return checks;
  }

  function dependencyCheck() {
    const checks = [];
    if (REOS.CoreFoundation && typeof REOS.CoreFoundation.diagnose === 'function') {
      const report = REOS.CoreFoundation.diagnose();
      checks.push(assert_('Core dependencies', report.ok, 'Critical', report.ok ? 'Core dependencies passed.' : 'Core dependency warnings exist.', report));
    } else {
      checks.push(fail_('Core dependencies', 'Critical', 'CoreFoundation.diagnose is unavailable.'));
    }
    if (REOS.Modules && typeof REOS.Modules.healthReport === 'function') {
      const health = REOS.Modules.healthReport();
      checks.push(assert_('Module dependencies', health.ok, 'High', health.ok ? 'Module dependencies passed.' : 'Module dependency warnings exist.', health));
    } else {
      checks.push(warn_('Module dependencies', 'Module registry is not available.', {}));
    }
    return checks;
  }

  function sheetCheck() {
    const checks = [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(REOS.CONFIG.SHEETS || {}).forEach(function (key) {
      const name = REOS.CONFIG.SHEETS[key];
      checks.push(assert_('Sheet: ' + name, !!ss.getSheetByName(name), 'High', 'Sheet exists: ' + name));
    });
    checks.push(assert_('Diagnostics runs sheet', !!ss.getSheetByName(DIAGNOSTIC_RUNS_SHEET), 'High', 'Diagnostics run sheet exists.'));
    checks.push(assert_('Diagnostics checks sheet', !!ss.getSheetByName(DIAGNOSTIC_CHECKS_SHEET), 'High', 'Diagnostics check sheet exists.'));
    return checks;
  }

  function moduleCheck() {
    const checks = [];
    if (!(REOS.Modules && typeof REOS.Modules.listModules === 'function')) {
      checks.push(warn_('Module registry', 'Module registry is not available.', {}));
      return checks;
    }
    REOS.Modules.listModules().forEach(function (module) {
      const required = module.Required === true || String(module.Required).toLowerCase() === 'true';
      const registered = !!REOS[module.Namespace] || module.Namespace === 'Database' && !!REOS.Database;
      checks.push(assert_('Module: ' + module['Module Key'], registered || !required, required ? 'High' : 'Low', registered ? 'Module is registered.' : 'Optional module is not loaded.', module));
    });
    return checks;
  }

  function propertyCheck() {
    const checks = [];
    const props = PropertiesService.getScriptProperties();
    const version = props.getProperty('REOS_VERSION');
    checks.push(assert_('Script property REOS_VERSION', !!version, 'Medium', version ? 'REOS_VERSION exists.' : 'REOS_VERSION is missing.', { value: version }));
    checks.push(assert_('Script property access', true, 'Low', 'Script properties are accessible.'));
    return checks;
  }

  function triggerCheck() {
    const checks = [];
    try {
      const triggers = ScriptApp.getProjectTriggers();
      checks.push(assert_('Trigger access', true, 'Low', 'Project triggers are accessible.', { count: triggers.length }));
      checks.push({ name: 'Trigger count', status: triggers.length ? 'Pass' : 'Warn', severity: 'Low', message: triggers.length ? 'Triggers are installed.' : 'No project triggers are installed yet.', details: { count: triggers.length } });
    } catch (error) {
      checks.push(fail_('Trigger access', 'Medium', error.message));
    }
    return checks;
  }

  function htmlCheck() {
    const checks = [];
    const files = ['Index', 'DashboardHub', 'FinanceManager', 'PortalFoundation', 'PortalAuth', 'InvestorPortal', 'VendorPortal', 'ClientLenderPortal', 'Admin'];
    files.forEach(function (file) {
      const timer = startTimer_();
      try {
        HtmlService.createHtmlOutputFromFile(file).getContent();
        checks.push({ name: 'HTML: ' + file, status: 'Pass', severity: 'Low', message: 'HTML file is available.', details: { file: file }, durationMs: timer.elapsed() });
      } catch (error) {
        checks.push({ name: 'HTML: ' + file, status: 'Warn', severity: 'Low', message: 'HTML file not available yet: ' + error.message, details: { file: file }, durationMs: timer.elapsed() });
      }
    });
    return checks;
  }

  function performanceCheck() {
    const checks = [];
    const sheetTimer = startTimer_();
    SpreadsheetApp.getActiveSpreadsheet().getSheets();
    const sheetMs = sheetTimer.elapsed();
    checks.push({ name: 'Spreadsheet sheet list latency', status: sheetMs < 1000 ? 'Pass' : 'Warn', severity: 'Low', message: 'Sheet list completed in ' + sheetMs + ' ms.', details: { durationMs: sheetMs }, durationMs: sheetMs });
    const dbTimer = startTimer_();
    try { REOS.Database.getAll(REOS.CONFIG.SHEETS.SETTINGS); } catch (ignore) {}
    const dbMs = dbTimer.elapsed();
    checks.push({ name: 'Database read latency', status: dbMs < 1500 ? 'Pass' : 'Warn', severity: 'Low', message: 'Database read completed in ' + dbMs + ' ms.', details: { durationMs: dbMs }, durationMs: dbMs });
    return checks;
  }

  function integrationCheck() {
    const checks = [];
    checks.push(assert_('UrlFetch service', typeof UrlFetchApp !== 'undefined', 'Medium', 'UrlFetch service is available.'));
    checks.push(assert_('Drive service', typeof DriveApp !== 'undefined', 'Medium', 'Drive service is available.'));
    checks.push(assert_('Spreadsheet service', typeof SpreadsheetApp !== 'undefined', 'Critical', 'Spreadsheet service is available.'));
    return checks;
  }

  function healthSummary() {
    ensureSheets();
    const runs = REOS.Database.getAll(DIAGNOSTIC_RUNS_SHEET);
    const latest = runs.sort(function (a, b) { return new Date(b['Created At'] || 0).getTime() - new Date(a['Created At'] || 0).getTime(); })[0] || null;
    return { ok: !latest || latest.Status !== 'Fail', latestRun: latest, runCount: runs.length };
  }

  function collect_(target, category, fn) {
    const timer = startTimer_();
    try {
      const checks = fn();
      (checks || []).forEach(function (check) {
        check.category = category;
        if (!check.durationMs) check.durationMs = timer.elapsed();
        target.push(check);
      });
    } catch (error) {
      target.push({ category: category, name: category + ' diagnostic', status: 'Fail', severity: 'Critical', message: error.message, details: { stack: error.stack || '' }, durationMs: timer.elapsed() });
    }
  }

  function assert_(name, condition, severity, message, details) {
    return { name: name, status: condition ? 'Pass' : 'Fail', severity: severity || 'Medium', message: condition ? message : message, details: details || {} };
  }

  function warn_(name, message, details) {
    return { name: name, status: 'Warn', severity: 'Medium', message: message, details: details || {} };
  }

  function fail_(name, severity, message, details) {
    return { name: name, status: 'Fail', severity: severity || 'Medium', message: message, details: details || {} };
  }

  function summarize_(checks) {
    const summary = { total: checks.length, pass: 0, warn: 0, fail: 0, criticalFailures: 0 };
    checks.forEach(function (check) {
      if (check.status === 'Pass') summary.pass++;
      if (check.status === 'Warn') summary.warn++;
      if (check.status === 'Fail') summary.fail++;
      if (check.status === 'Fail' && check.severity === 'Critical') summary.criticalFailures++;
    });
    return summary;
  }

  function calculateScore_(checks) {
    if (!checks.length) return 100;
    const summary = summarize_(checks);
    return Math.max(0, Math.round(((summary.pass + summary.warn * 0.5) / summary.total) * 100));
  }

  function startTimer_() {
    const start = Date.now();
    return { elapsed: function () { return Date.now() - start; } };
  }

  function getVersion_() {
    return REOS.CONFIG && REOS.CONFIG.APP ? REOS.CONFIG.APP.VERSION : 'unknown';
  }

  return { ensureSheets: ensureSheets, run: run, startupCheck: startupCheck, dependencyCheck: dependencyCheck, sheetCheck: sheetCheck, moduleCheck: moduleCheck, propertyCheck: propertyCheck, triggerCheck: triggerCheck, htmlCheck: htmlCheck, performanceCheck: performanceCheck, integrationCheck: integrationCheck, healthSummary: healthSummary };
})();

function reosRunDiagnostics() {
  const report = REOS.Diagnostics.run();
  SpreadsheetApp.getUi().alert('REOS Diagnostics', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

function reosDiagnosticsSummary() {
  const report = REOS.Diagnostics.healthSummary();
  SpreadsheetApp.getUi().alert('REOS Diagnostics Summary', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

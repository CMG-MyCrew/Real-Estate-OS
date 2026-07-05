/**
 * REOS Enterprise v3.0 - Test Runner
 *
 * Provides lightweight Apps Script test routines for setup verification,
 * health checks, schema validation, services, permissions, and router routes.
 */

var REOS = REOS || {};

REOS.Tests = (function () {
  function runAll() {
    const startedAt = new Date();
    const results = [];

    add_(results, 'Environment', testEnvironment_);
    add_(results, 'Workbook Setup', testWorkbookSetup_);
    add_(results, 'Required Sheets', testRequiredSheets_);
    add_(results, 'Required Headers', testRequiredHeaders_);
    add_(results, 'Core Services', testCoreServices_);
    add_(results, 'Security', testSecurity_);
    add_(results, 'Router', testRouter_);
    add_(results, 'Validation', testValidation_);
    add_(results, 'Health Check', testHealthCheck_);

    const failed = results.filter(function (item) { return !item.ok; });
    const report = {
      ok: failed.length === 0,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results: results
    };

    writeReport_(report);
    REOS.Logger.info('Test runner completed', { ok: report.ok, passed: report.passed, failed: report.failed });
    return report;
  }

  function add_(results, name, fn) {
    const startedAt = new Date();
    try {
      const detail = fn();
      results.push({
        name: name,
        ok: true,
        durationMs: new Date().getTime() - startedAt.getTime(),
        detail: detail || {}
      });
    } catch (error) {
      results.push({
        name: name,
        ok: false,
        durationMs: new Date().getTime() - startedAt.getTime(),
        error: error.message,
        stack: error.stack || ''
      });
    }
  }

  function assert_(condition, message) {
    if (!condition) throw new Error(message);
  }

  function testEnvironment_() {
    assert_(typeof REOS !== 'undefined', 'REOS namespace is missing.');
    assert_(REOS.CONFIG && REOS.CONFIG.APP, 'REOS.CONFIG.APP is missing.');
    assert_(REOS.CONFIG.APP.VERSION, 'App version is missing.');
    assert_(SpreadsheetApp.getActiveSpreadsheet(), 'Active spreadsheet is unavailable.');
    return { app: REOS.CONFIG.APP.NAME, version: REOS.CONFIG.APP.VERSION };
  }

  function testWorkbookSetup_() {
    assert_(REOS.Setup && typeof REOS.Setup.initializeWorkbook === 'function', 'REOS.Setup.initializeWorkbook is missing.');
    const result = REOS.Setup.initializeWorkbook();
    assert_(result && result.ok, 'Workbook setup did not return ok.');
    return result;
  }

  function testRequiredSheets_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const missing = [];
    Object.keys(REOS.CONFIG.SHEETS).forEach(function (key) {
      const sheetName = REOS.CONFIG.SHEETS[key];
      if (!ss.getSheetByName(sheetName)) missing.push(sheetName);
    });
    assert_(missing.length === 0, 'Missing sheets: ' + missing.join(', '));
    return { sheets: Object.keys(REOS.CONFIG.SHEETS).length };
  }

  function testRequiredHeaders_() {
    const missing = [];
    Object.keys(REOS.Schema || {}).forEach(function (key) {
      const sheetName = REOS.CONFIG.SHEETS[key];
      const expected = REOS.Schema[key];
      if (!sheetName || !expected) return;
      const actual = REOS.Database.getHeaders(sheetName);
      expected.forEach(function (header) {
        if (actual.indexOf(header) === -1) missing.push(sheetName + '.' + header);
      });
    });
    assert_(missing.length === 0, 'Missing headers: ' + missing.join(', '));
    return { checked: Object.keys(REOS.Schema || {}).length };
  }

  function testCoreServices_() {
    assert_(REOS.Database && typeof REOS.Database.getAll === 'function', 'REOS.Database is not ready.');
    assert_(REOS.Logger && typeof REOS.Logger.info === 'function', 'REOS.Logger is not ready.');
    assert_(REOS.Validation && typeof REOS.Validation.validateRecord === 'function', 'REOS.Validation is not ready.');
    assert_(REOS.Security && typeof REOS.Security.getCurrentUser === 'function', 'REOS.Security is not ready.');
    assert_(REOS.Router && typeof REOS.Router.dispatch === 'function', 'REOS.Router is not ready.');
    return { services: ['Database', 'Logger', 'Validation', 'Security', 'Router'] };
  }

  function testSecurity_() {
    const user = REOS.Security.getCurrentUser();
    assert_(user && user.Email !== undefined, 'Current user result is invalid.');
    assert_(typeof REOS.Security.hasPermission === 'function', 'hasPermission is missing.');
    return { currentUser: user.Email || 'unknown', status: user.Status || 'unknown', role: user.Role || 'unknown' };
  }

  function testRouter_() {
    REOS.Router.initializeDefaultModules();
    const nav = REOS.Router.buildNavigation();
    const routes = REOS.Router.getRoutes();
    assert_(Array.isArray(nav), 'Navigation did not return an array.');
    assert_(routes.length > 0, 'No routes registered.');
    return { modules: nav.length, routes: routes.length };
  }

  function testValidation_() {
    const invalid = REOS.Validation.validateRecord({}, { required: ['Name'] });
    assert_(invalid.ok === false, 'Required field validation should fail.');

    const email = REOS.Validation.validateEmail('test@example.com', true);
    assert_(email.ok === true, 'Valid email failed validation.');

    const allowed = REOS.Validation.validateAllowedValue('High', 'Priority', ['Low', 'Medium', 'High'], true);
    assert_(allowed.ok === true, 'Allowed value failed validation.');

    return { validation: 'ok' };
  }

  function testHealthCheck_() {
    const report = REOS.healthCheck_();
    assert_(report && report.ok === true, 'Health check failed.');
    return report;
  }

  function writeReport_(report) {
    const sheetName = 'TEST_RESULTS';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);

    sheet.clear();
    const rows = [
      ['Test', 'Status', 'Duration Ms', 'Detail / Error'],
      ['SUMMARY', report.ok ? 'PASS' : 'FAIL', '', REOS.toJson_({ total: report.total, passed: report.passed, failed: report.failed, finishedAt: report.finishedAt })]
    ];

    report.results.forEach(function (item) {
      rows.push([
        item.name,
        item.ok ? 'PASS' : 'FAIL',
        item.durationMs,
        item.ok ? REOS.toJson_(item.detail) : item.error
      ]);
    });

    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
    sheet.autoResizeColumns(1, rows[0].length);
  }

  return {
    runAll: runAll
  };
})();

function reosRunTests() {
  const report = REOS.Tests.runAll();
  SpreadsheetApp.getUi().alert('REOS Test Runner', 'Passed: ' + report.passed + '\nFailed: ' + report.failed, SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

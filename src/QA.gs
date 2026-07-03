/**
 * REOS Enterprise v3.0 - QA & Test Harness Framework
 *
 * Smoke tests, module assertions, release gates, and test result tracking.
 */

var REOS = REOS || {};

REOS.QA = (function () {
  const TEST_SHEET = 'QA_TEST_RESULTS';
  const ID_FIELD = 'Test Run ID';

  const HEADERS = [
    'Test Run ID', 'Run At', 'Suite', 'Test Name', 'Status', 'Message',
    'Duration MS', 'Details JSON', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(TEST_SHEET);
    if (!sheet) sheet = ss.insertSheet(TEST_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function runSmokeTests() {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    const tests = [
      test_('Core', 'REOS namespace exists', function () { return !!REOS; }),
      test_('Core', 'Properties helpers exist', function () { return typeof REOS.getProperty_ === 'function' && typeof REOS.setProperty_ === 'function'; }),
      test_('Database', 'Database API exists', function () { return !!REOS.Database && typeof REOS.Database.insert === 'function'; }),
      test_('Security', 'Security API exists', function () { return !!REOS.Security && typeof REOS.Security.requirePermission === 'function'; }),
      test_('Dashboard', 'Dashboard loads', function () { return !!REOS.Dashboard.getExecutiveDashboard(); }),
      test_('Monitoring', 'Health suite loads', function () { return !!REOS.Monitoring.runHealthSuite(); }),
      test_('Backup', 'Backup registry loads', function () { return Array.isArray(REOS.Backup.listBackups(1)); }),
      test_('Deployment', 'Readiness report loads', function () { return !!REOS.Deployment.readinessReport(); })
    ];
    tests.forEach(logTest_);
    return {
      total: tests.length,
      passed: tests.filter(function (t) { return t.Status === 'Pass'; }).length,
      failed: tests.filter(function (t) { return t.Status === 'Fail'; }).length,
      tests: tests
    };
  }

  function test_(suite, name, fn) {
    const started = new Date().getTime();
    try {
      const ok = fn();
      return {
        'Run At': new Date(),
        Suite: suite,
        'Test Name': name,
        Status: ok ? 'Pass' : 'Fail',
        Message: ok ? 'OK' : 'Assertion returned false.',
        'Duration MS': new Date().getTime() - started,
        'Details JSON': '{}'
      };
    } catch (error) {
      return {
        'Run At': new Date(),
        Suite: suite,
        'Test Name': name,
        Status: 'Fail',
        Message: error.message,
        'Duration MS': new Date().getTime() - started,
        'Details JSON': JSON.stringify({ stack: error.stack || '' })
      };
    }
  }

  function logTest_(row) {
    return REOS.Database.insert(TEST_SHEET, row, { idField: ID_FIELD, idPrefix: 'TEST' });
  }

  function releaseGate() {
    const smoke = runSmokeTests();
    const health = REOS.Monitoring.runHealthSuite();
    const backup = REOS.Backup.listBackups(1)[0] || null;
    const ok = smoke.failed === 0 && health.overallStatus === 'Healthy' && !!backup;
    return {
      ok: ok,
      smoke: smoke,
      health: health,
      latestBackup: backup,
      message: ok ? 'Release gate passed.' : 'Release gate failed. Resolve tests, health, or backup before release.'
    };
  }

  return {
    ensureSheet: ensureSheet,
    runSmokeTests: runSmokeTests,
    releaseGate: releaseGate
  };
})();

function qaRunSmokeTests() { return REOS.QA.runSmokeTests(); }
function qaReleaseGate() { return REOS.QA.releaseGate(); }

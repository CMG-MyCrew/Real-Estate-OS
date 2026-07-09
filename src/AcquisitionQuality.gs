/**
 * REOS Enterprise v3.4.9
 * Sprint 5.4 Increment 5 — Acquisition Integration & Quality
 */

var REOS = REOS || {};

REOS.AcquisitionQuality = (function () {
  var RUNS = 'ACQUISITION_QUALITY_RUNS';

  function ensureSheets() {
    REOS.Database.ensureTable(RUNS, [
      'Quality Run ID','Status','Score','Checks Passed','Checks Failed',
      'Warnings','Details JSON','Created At'
    ]);
  }

  function runSmokeTest() {
    ensureSheets();

    var checks = [];
    check_(checks, 'Deal Analyzer loaded', !!(REOS.DealAnalyzer && REOS.DealAnalyzer.summary));
    check_(checks, 'Comparable Sales loaded', !!(REOS.ComparableSales && REOS.ComparableSales.summary));
    check_(checks, 'Offer Generator loaded', !!(REOS.OfferGenerator && REOS.OfferGenerator.summary));
    check_(checks, 'Distress Importer loaded', !!(REOS.DistressReportImporter && REOS.DistressReportImporter.summary));
    check_(checks, 'Acquisition Pipeline loaded', !!(REOS.AcquisitionPipeline && REOS.AcquisitionPipeline.summary));
    check_(checks, 'Acquisition Workflow loaded', !!(REOS.AcquisitionWorkflow && REOS.AcquisitionWorkflow.summary));
    check_(checks, 'Task Engine loaded', !!(REOS.AcquisitionTaskEngine && REOS.AcquisitionTaskEngine.summary));
    check_(checks, 'Command Center loaded', !!(REOS.AcquisitionCommandCenter && REOS.AcquisitionCommandCenter.summary));

    checkSheet_(checks, 'DEALS');
    checkSheet_(checks, 'DEAL_ANALYSIS');
    checkSheet_(checks, 'DEAL_COMPARABLES');
    checkSheet_(checks, 'OFFERS');
    checkSheet_(checks, 'DISTRESS_LEADS');
    checkSheet_(checks, 'ACQUISITION_PIPELINE');
    checkSheet_(checks, 'ACQUISITION_TASK_QUEUE');
    checkSheet_(checks, 'ACQUISITION_COMMAND_CENTER');

    var failed = checks.filter(function (c) { return c.status === 'Fail'; });
    var warnings = checks.filter(function (c) { return c.status === 'Warn'; });
    var passed = checks.filter(function (c) { return c.status === 'Pass'; });
    var score = Math.round((passed.length / checks.length) * 100);

    var result = {
      ok: failed.length === 0,
      status: failed.length ? 'Fail' : warnings.length ? 'Warn' : 'Pass',
      score: score,
      passed: passed.length,
      failed: failed.length,
      warnings: warnings.length,
      checks: checks,
      generatedAt: new Date().toISOString()
    };

    REOS.Database.insert(RUNS, {
      Status: result.status,
      Score: result.score,
      'Checks Passed': result.passed,
      'Checks Failed': result.failed,
      Warnings: result.warnings,
      'Details JSON': REOS.toJson_(result),
      'Created At': new Date()
    }, { idField: 'Quality Run ID', idPrefix: 'AQ' });

    return result;
  }

  function dailyReadiness() {
    var quality = runSmokeTest();

    var command = REOS.AcquisitionCommandCenter && REOS.AcquisitionCommandCenter.buildSnapshot
      ? REOS.AcquisitionCommandCenter.buildSnapshot()
      : null;

    var tasks = REOS.AcquisitionTaskEngine && REOS.AcquisitionTaskEngine.summary
      ? REOS.AcquisitionTaskEngine.summary()
      : null;

    return {
      ok: quality.ok,
      generatedAt: new Date().toISOString(),
      quality: quality,
      commandCenter: command,
      tasks: tasks
    };
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(RUNS);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      runs: rows.length,
      latest: rows.length ? rows[rows.length - 1] : null
    };
  }

  function check_(checks, name, condition) {
    checks.push({
      name: name,
      status: condition ? 'Pass' : 'Fail',
      message: condition ? 'Available.' : 'Missing or unavailable.'
    });
  }

  function checkSheet_(checks, sheetName) {
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      checks.push({
        name: 'Sheet: ' + sheetName,
        status: sheet ? 'Pass' : 'Fail',
        message: sheet ? 'Sheet exists.' : 'Sheet missing.'
      });
    } catch (e) {
      checks.push({
        name: 'Sheet: ' + sheetName,
        status: 'Fail',
        message: e.message
      });
    }
  }

  return {
    ensureSheets: ensureSheets,
    runSmokeTest: runSmokeTest,
    dailyReadiness: dailyReadiness,
    summary: summary
  };
})();

function reosAcquisitionQualityEnsureSheets() {
  REOS.AcquisitionQuality.ensureSheets();
  SpreadsheetApp.getUi().alert('Acquisition Quality sheets ready.');
}

function reosAcquisitionQualitySmokeTest() {
  var result = REOS.AcquisitionQuality.runSmokeTest();
  SpreadsheetApp.getUi().alert('Acquisition Quality Smoke Test', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionQualityDailyReadiness() {
  var result = REOS.AcquisitionQuality.dailyReadiness();
  SpreadsheetApp.getUi().alert('Acquisition Daily Readiness', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionQualitySummary() {
  var result = REOS.AcquisitionQuality.summary();
  SpreadsheetApp.getUi().alert('Acquisition Quality Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

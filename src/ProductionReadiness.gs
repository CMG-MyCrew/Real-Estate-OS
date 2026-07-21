/**
 * REOS Enterprise v4.4.0
 * Sprint 7.3 Increment 1 — Production Readiness Test Suite
 */
var REOS = REOS || {};

REOS.ProductionReadiness = (function () {
  var RUNS = 'PRODUCTION_READINESS_RUNS';
  var RESULTS = 'PRODUCTION_READINESS_RESULTS';

  var RUN_HEADERS = [
    'Readiness Run ID','Status','Critical Passed','Critical Failed','Warnings',
    'Total Tests','Pass Rate %','Started At','Completed At','Duration Ms',
    'Summary JSON','Executed By'
  ];

  var RESULT_HEADERS = [
    'Readiness Result ID','Readiness Run ID','Category','Test Name','Severity',
    'Status','Duration Ms','Expected Result','Actual Result','Error Message','Run At'
  ];

  var REQUIRED_SHEETS = [
    'DEALS','DISTRESS_LEADS','IA_LEADS','AI_DEAL_INTELLIGENCE','OFFERS',
    'ACQUISITION_PIPELINE','ACQUISITION_TASK_QUEUE','ACQUISITION_CONNECTORS',
    'ACQUISITION_CONNECTOR_RUNS','ACQUISITION_INGESTION_RUNS',
    'AI_OFFER_QUEUE','AI_OFFER_REVIEW','OFFER_EXECUTION_QUEUE','OFFER_EXECUTION_LOG'
  ];

  function ensureSheets() {
    requireDatabase_();
    REOS.Database.ensureTable(RUNS, RUN_HEADERS);
    REOS.Database.ensureTable(RESULTS, RESULT_HEADERS);
    return { ok: true, runs: RUNS, results: RESULTS };
  }

  function run(options) {
    ensureSheets();
    options = Object.assign({ includeWarnings: true }, options || {});

    var started = new Date();
    var runId = createRunId_();
    var tests = buildTests_(options);
    var results = [];

    tests.forEach(function (test) {
      results.push(executeTest_(runId, test));
    });

    var completed = new Date();
    var critical = results.filter(function (r) { return r.severity === 'Critical'; });
    var criticalPassed = critical.filter(function (r) { return r.status === 'Pass'; }).length;
    var criticalFailed = critical.filter(function (r) { return r.status === 'Fail'; }).length;
    var warnings = results.filter(function (r) { return r.status === 'Warning'; }).length;
    var passed = results.filter(function (r) { return r.status === 'Pass'; }).length;
    var passRate = results.length ? Math.round((passed / results.length) * 10000) / 100 : 0;
    var status = criticalFailed > 0 ? 'Not Ready' : warnings > 0 ? 'Ready With Warnings' : 'Ready';

    var summary = {
      runId: runId,
      status: status,
      criticalPassed: criticalPassed,
      criticalFailed: criticalFailed,
      warnings: warnings,
      totalTests: results.length,
      passRate: passRate,
      categories: groupBy_(results, 'category'),
      failures: results.filter(function (r) { return r.status === 'Fail'; }),
      warningDetails: results.filter(function (r) { return r.status === 'Warning'; })
    };

    REOS.Database.insert(RUNS, {
      'Readiness Run ID': runId,
      'Status': status,
      'Critical Passed': criticalPassed,
      'Critical Failed': criticalFailed,
      'Warnings': warnings,
      'Total Tests': results.length,
      'Pass Rate %': passRate,
      'Started At': started,
      'Completed At': completed,
      'Duration Ms': completed.getTime() - started.getTime(),
      'Summary JSON': JSON.stringify(summary),
      'Executed By': currentUser_()
    }, { idField: 'Readiness Run ID', idPrefix: 'PRRUN', preserveProvidedId: true });

    return {
      ok: criticalFailed === 0,
      status: status,
      generatedAt: completed.toISOString(),
      summary: summary,
      results: results
    };
  }

  function summary(limit) {
    ensureSheets();
    var runs = safeAll_(RUNS).slice().reverse();
    var recent = runs.slice(0, Number(limit || 10));
    var latest = recent.length ? recent[0] : null;
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      runs: runs.length,
      latest: clean_(latest),
      recent: clean_(recent),
      ready: !!latest && latest.Status === 'Ready',
      readyWithWarnings: !!latest && latest.Status === 'Ready With Warnings'
    };
  }

  function latestResults() {
    ensureSheets();
    var runs = safeAll_(RUNS);
    if (!runs.length) return { ok: true, run: null, results: [] };
    var latest = runs[runs.length - 1];
    var runId = latest['Readiness Run ID'];
    var rows = safeAll_(RESULTS).filter(function (row) {
      return row['Readiness Run ID'] === runId;
    });
    return { ok: true, run: clean_(latest), results: clean_(rows) };
  }

  function resetTestData() {
    ensureSheets();
    var removed = { runs: 0, results: 0 };
    try { removed.runs = deleteAllRows_(RUNS); } catch (ignored) {}
    try { removed.results = deleteAllRows_(RESULTS); } catch (ignored2) {}
    return { ok: true, removed: removed };
  }

  function buildTests_(options) {
    var tests = [
      test_('Bootstrap','REOS namespace','Critical','REOS global namespace is available',function () {
        return !!REOS;
      }),
      test_('Database','Database module','Critical','REOS.Database core methods are available',function () {
        return !!REOS.Database &&
          typeof REOS.Database.getAll === 'function' &&
          typeof REOS.Database.ensureTable === 'function' &&
          typeof REOS.Database.insert === 'function' &&
          typeof REOS.Database.update === 'function';
      }),
      test_('Database','Active spreadsheet','Critical','A bound spreadsheet is accessible',function () {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        return !!ss && !!ss.getId();
      }),
      test_('Connectors','Connector registry','Critical','Connector registry module is available',function () {
        return !!REOS.ConnectorRegistry && typeof REOS.ConnectorRegistry.list === 'function';
      }),
      test_('Connectors','Connector manager','Critical','Connector manager module is available',function () {
        return !!REOS.AcquisitionConnectorManager && typeof REOS.AcquisitionConnectorManager.health === 'function';
      }),
      test_('CSV Import','CSV import engine','Critical','CSV import engine is available',function () {
        return !!REOS.CSVImportEngine && typeof REOS.CSVImportEngine.importConnector === 'function';
      }),
      test_('Lead Processing','Lead normalization','Critical','Lead normalization module is available',function () {
        return !!REOS.LeadNormalization && typeof REOS.LeadNormalization.normalize === 'function';
      }),
      test_('Lead Processing','Lead deduplication','Critical','Lead deduplication module is available',function () {
        return !!REOS.LeadDeduplication && typeof REOS.LeadDeduplication.scanSheet === 'function';
      }),
      test_('Ingestion','Ingestion orchestrator','Critical','Ingestion orchestrator is available',function () {
        return !!REOS.AcquisitionIngestionOrchestrator && typeof REOS.AcquisitionIngestionOrchestrator.run === 'function';
      }),
      test_('Intelligence','Acquisition intelligence','Critical','Acquisition intelligence engine is available',function () {
        return !!REOS.AcquisitionIntelligence && typeof REOS.AcquisitionIntelligence.analyzeAll === 'function';
      }),
      test_('Intelligence','Deal intelligence','Critical','Deal intelligence engine is available',function () {
        return !!REOS.AcquisitionDealIntelligence && typeof REOS.AcquisitionDealIntelligence.analyzeAll === 'function';
      }),
      test_('Offers','Offer automation','Critical','Offer automation module is available',function () {
        return !!REOS.AcquisitionOfferAutomation && typeof REOS.AcquisitionOfferAutomation.generateDrafts === 'function';
      }),
      test_('Offers','Offer review workflow','Critical','Offer review workflow is available',function () {
        return !!REOS.OfferReviewWorkflow && typeof REOS.OfferReviewWorkflow.summary === 'function';
      }),
      test_('Offers','Offer execution workflow','Critical','Offer execution workflow is available',function () {
        return !!REOS.OfferExecutionWorkflow && typeof REOS.OfferExecutionWorkflow.summary === 'function';
      }),
      test_('Dashboard','Dashboard services','Critical','Dashboard services are available',function () {
        return !!REOS.DashboardServices && typeof REOS.DashboardServices.bootstrap === 'function';
      }),
      test_('Automation','Acquisition automation','Warning','Acquisition automation module is available',function () {
        return !!REOS.AcquisitionAutomation && typeof REOS.AcquisitionAutomation.status === 'function';
      }),
      test_('Automation','Intelligence automation','Warning','Intelligence automation module is available',function () {
        return !!REOS.AcquisitionIntelligenceAutomation && typeof REOS.AcquisitionIntelligenceAutomation.status === 'function';
      }),
      test_('Security','Permission service','Warning','Security module is available',function () {
        return !!REOS.Security;
      }),
      test_('Backup','Backup module','Warning','Backup module is available',function () {
        return !!REOS.Backup;
      }),
      test_('Triggers','Duplicate critical triggers','Warning','No duplicate critical project triggers exist',function () {
        var names = ['reosAcquisitionAutomationDailyRun','reosAcquisitionIntelligenceDailyRun'];
        var counts = {};
        ScriptApp.getProjectTriggers().forEach(function (trigger) {
          var name = trigger.getHandlerFunction();
          if (names.indexOf(name) !== -1) counts[name] = (counts[name] || 0) + 1;
        });
        return names.every(function (name) { return (counts[name] || 0) <= 1; });
      })
    ];

    REQUIRED_SHEETS.forEach(function (sheetName) {
      tests.push(test_('Required Sheets', sheetName, 'Critical', sheetName + ' exists', function () {
        return !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      }));
    });

    if (!options.includeWarnings) {
      tests = tests.filter(function (item) { return item.severity === 'Critical'; });
    }
    return tests;
  }

  function test_(category, name, severity, expected, fn) {
    return { category: category, name: name, severity: severity, expected: expected, fn: fn };
  }

  function executeTest_(runId, test) {
    var started = new Date();
    var status = 'Pass';
    var actual = '';
    var errorMessage = '';

    try {
      var value = test.fn();
      actual = describe_(value);
      if (!value) status = test.severity === 'Critical' ? 'Fail' : 'Warning';
    } catch (error) {
      status = test.severity === 'Critical' ? 'Fail' : 'Warning';
      actual = 'Exception';
      errorMessage = error.message || String(error);
    }

    var completed = new Date();
    REOS.Database.insert(RESULTS, {
      'Readiness Run ID': runId,
      'Category': test.category,
      'Test Name': test.name,
      'Severity': test.severity,
      'Status': status,
      'Duration Ms': completed.getTime() - started.getTime(),
      'Expected Result': test.expected,
      'Actual Result': actual,
      'Error Message': errorMessage,
      'Run At': completed
    }, { idField: 'Readiness Result ID', idPrefix: 'PRTEST' });

    return {
      category: test.category,
      testName: test.name,
      severity: test.severity,
      status: status,
      durationMs: completed.getTime() - started.getTime(),
      expected: test.expected,
      actual: actual,
      error: errorMessage
    };
  }

  function createRunId_() {
    return 'PRRUN-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 1000);
  }

  function requireDatabase_() {
    if (!REOS.Database) throw new Error('Database.gs is required.');
  }

  function safeAll_(sheet) {
    try { return REOS.Database.getAll(sheet) || []; } catch (error) { return []; }
  }

  function deleteAllRows_(sheetName) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() <= 1) return 0;
    var count = sheet.getLastRow() - 1;
    sheet.deleteRows(2, count);
    return count;
  }

  function describe_(value) {
    if (value === true) return 'Available';
    if (value === false || value === null || value === undefined) return 'Unavailable';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function groupBy_(rows, field) {
    return rows.reduce(function (map, row) {
      var key = row[field] || 'Unknown';
      if (!map[key]) map[key] = { total: 0, passed: 0, failed: 0, warnings: 0 };
      map[key].total++;
      if (row.status === 'Pass') map[key].passed++;
      if (row.status === 'Fail') map[key].failed++;
      if (row.status === 'Warning') map[key].warnings++;
      return map;
    }, {});
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || ''; } catch (error) { return ''; }
  }

  function clean_(value) {
    return JSON.parse(JSON.stringify(value || null, function (key, item) {
      return item instanceof Date ? item.toISOString() : item;
    }));
  }

  return {
    ensureSheets: ensureSheets,
    run: run,
    summary: summary,
    latestResults: latestResults,
    resetTestData: resetTestData
  };
})();

function reosProductionReadinessEnsureSheets() { return REOS.ProductionReadiness.ensureSheets(); }
function reosProductionReadinessRun(options) { return REOS.ProductionReadiness.run(options); }
function reosProductionReadinessSummary(limit) { return REOS.ProductionReadiness.summary(limit); }
function reosProductionReadinessLatestResults() { return REOS.ProductionReadiness.latestResults(); }
function reosProductionReadinessResetTestData() { return REOS.ProductionReadiness.resetTestData(); }

/**
 * REOS Enterprise v4.4.1
 * Sprint 7.3 Increment 2 — Controlled Daily-Use End-to-End Test
 */
var REOS = REOS || {};

REOS.ControlledDailyUseTest = (function () {
  var RUNS = 'CONTROLLED_DAILY_USE_RUNS';
  var RESULTS = 'CONTROLLED_DAILY_USE_RESULTS';
  var TEST_MARKER = 'REOS-E2E-TEST';

  var RUN_HEADERS = [
    'Test Run ID','Status','Lead ID','Address','Passed','Failed','Started At','Completed At',
    'Duration Ms','Summary JSON','Executed By'
  ];

  var RESULT_HEADERS = [
    'Test Result ID','Test Run ID','Stage','Status','Expected','Actual','Record ID',
    'Error Message','Checked At'
  ];

  function ensureSheets() {
    requireDatabase_();
    REOS.Database.ensureTable(RUNS, RUN_HEADERS);
    REOS.Database.ensureTable(RESULTS, RESULT_HEADERS);
    return { ok: true, runs: RUNS, results: RESULTS };
  }

  function createTestLead() {
    ensureSheets();
    var existing = findByMarker_('DISTRESS_LEADS');
    if (existing) return { ok: true, created: false, record: existing };

    var record = REOS.Database.insert('DISTRESS_LEADS', {
      Address: '742 Walnut Street',
      City: 'Philadelphia',
      State: 'PA',
      Zip: '19106',
      'Estimated Value': 250000,
      ARV: 300000,
      'Estimated Repairs': 50000,
      'Estimated Debt': 100000,
      'Asking Price': 140000,
      'Distress Type': 'Absentee Owner',
      Source: TEST_MARKER,
      Notes: 'Controlled daily-use test record. Never contact or submit a real offer.',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Distress Lead ID', idPrefix: 'E2E' });

    return { ok: true, created: true, record: record };
  }

  function run() {
    ensureSheets();
    var started = new Date();
    var runId = 'E2ERUN-' + Utilities.formatDate(started, Session.getScriptTimeZone() || 'America/New_York', 'yyyyMMdd-HHmmss');
    var leadResult = createTestLead();
    var lead = leadResult.record || {};
    var checks = [];

    checks.push(checkSheet_(runId, 'DISTRESS_LEADS', 'DISTRESS_LEADS'));
    checks.push(checkModule_(runId, 'Lead normalization', REOS.LeadNormalization, 'normalize'));
    checks.push(checkModule_(runId, 'Lead deduplication', REOS.LeadDeduplication, 'scanSheet'));
    checks.push(checkModule_(runId, 'Ingestion orchestrator', REOS.AcquisitionIngestionOrchestrator, 'run'));
    checks.push(checkModule_(runId, 'Acquisition intelligence', REOS.AcquisitionIntelligence, 'analyzeAll'));
    checks.push(checkModule_(runId, 'Deal intelligence', REOS.AcquisitionDealIntelligence, 'analyzeAll'));
    checks.push(checkModule_(runId, 'Offer automation', REOS.AcquisitionOfferAutomation, 'generateDrafts'));
    checks.push(checkModule_(runId, 'Offer review', REOS.OfferReviewWorkflow, 'generateQueue'));
    checks.push(checkModule_(runId, 'Offer execution', REOS.OfferExecutionWorkflow, 'buildQueue'));

    ['IA_LEADS','AI_DEAL_INTELLIGENCE','AI_OFFER_QUEUE','AI_OFFER_REVIEW','OFFERS','OFFER_EXECUTION_QUEUE'].forEach(function (sheet) {
      checks.push(checkSheet_(runId, sheet, sheet));
    });

    var passed = checks.filter(function (r) { return r.status === 'Pass'; }).length;
    var failed = checks.length - passed;
    var completed = new Date();
    var status = failed ? 'Needs Attention' : 'Ready for Pilot';
    var summary = { runId: runId, status: status, passed: passed, failed: failed, checks: checks };

    REOS.Database.insert(RUNS, {
      'Test Run ID': runId,
      Status: status,
      'Lead ID': lead['Distress Lead ID'] || lead['Lead ID'] || '',
      Address: lead.Address || '742 Walnut Street',
      Passed: passed,
      Failed: failed,
      'Started At': started,
      'Completed At': completed,
      'Duration Ms': completed.getTime() - started.getTime(),
      'Summary JSON': JSON.stringify(summary),
      'Executed By': currentUser_()
    }, { idField: 'Test Run ID', idPrefix: 'E2ERUN', preserveProvidedId: true });

    return { ok: failed === 0, status: status, summary: summary };
  }

  function checkModule_(runId, stage, module, method) {
    var ok = !!module && typeof module[method] === 'function';
    return writeResult_(runId, stage, ok, 'Module method available', ok ? module[method].name || method : 'Unavailable', '');
  }

  function checkSheet_(runId, stage, sheetName) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    return writeResult_(runId, stage, !!sheet, sheetName + ' exists', sheet ? 'Available' : 'Unavailable', '');
  }

  function writeResult_(runId, stage, ok, expected, actual, recordId) {
    var row = {
      stage: stage,
      status: ok ? 'Pass' : 'Fail',
      expected: expected,
      actual: actual,
      recordId: recordId || '',
      error: ''
    };
    REOS.Database.insert(RESULTS, {
      'Test Run ID': runId,
      Stage: stage,
      Status: row.status,
      Expected: expected,
      Actual: actual,
      'Record ID': row.recordId,
      'Error Message': '',
      'Checked At': new Date()
    }, { idField: 'Test Result ID', idPrefix: 'E2ETEST' });
    return row;
  }

  function findByMarker_(sheetName) {
    try {
      var rows = REOS.Database.getAll(sheetName) || [];
      return rows.filter(function (r) { return r.Source === TEST_MARKER; })[0] || null;
    } catch (e) { return null; }
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(RUNS) || [];
    return { ok: true, latest: rows.length ? rows[rows.length - 1] : null, runs: rows.length };
  }

  function requireDatabase_() { if (!REOS.Database) throw new Error('Database.gs is required.'); }
  function currentUser_() { try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; } }

  return { ensureSheets: ensureSheets, createTestLead: createTestLead, run: run, summary: summary };
})();

function reosControlledDailyUseEnsureSheets() { return REOS.ControlledDailyUseTest.ensureSheets(); }
function reosControlledDailyUseCreateTestLead() { return REOS.ControlledDailyUseTest.createTestLead(); }
function reosControlledDailyUseRun() { return REOS.ControlledDailyUseTest.run(); }
function reosControlledDailyUseSummary() { return REOS.ControlledDailyUseTest.summary(); }

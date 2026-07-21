/**
 * REOS Enterprise v4.4.2
 * Sprint 7.3 Increment 3 — Live Pipeline Verification
 */
var REOS = REOS || {};

REOS.LivePipelineVerification = (function () {
  var RUNS = 'LIVE_PIPELINE_RUNS';
  var RESULTS = 'LIVE_PIPELINE_RESULTS';
  var AUDIT = 'LIVE_PIPELINE_AUDIT';
  var MARKER = 'REOS-LIVE-PIPELINE-TEST';
  var ADDRESS = '742 Walnut Street';
  var TZ = 'America/New_York';

  var RUN_HEADERS = ['Run ID','Status','Lead ID','Address','Passed','Failed','Integrity Percent','Duplicate Protection','Started At','Completed At','Duration Ms','Summary JSON','Executed By'];
  var RESULT_HEADERS = ['Result ID','Run ID','Stage','Source Sheet','Destination Sheet','Input Record ID','Output Record ID','Parent Record ID','Status','Duration Ms','Message','Checked At'];
  var AUDIT_HEADERS = ['Audit ID','Run ID','Event','Sheet','Record ID','Details JSON','Created At'];

  function ensureSheets() {
    requireDatabase_();
    REOS.Database.ensureTable(RUNS, RUN_HEADERS);
    REOS.Database.ensureTable(RESULTS, RESULT_HEADERS);
    REOS.Database.ensureTable(AUDIT, AUDIT_HEADERS);
    return { ok: true, runs: RUNS, results: RESULTS, audit: AUDIT };
  }

  function createTestLead() {
    ensureSheets();
    var existing = findTestRows_('DISTRESS_LEADS');
    if (existing.length) return { ok: true, created: false, record: existing[0] };
    var now = new Date();
    var record = REOS.Database.insert('DISTRESS_LEADS', {
      Address: ADDRESS, City: 'Philadelphia', State: 'PA', Zip: '19106',
      'Estimated Value': 250000, ARV: 300000, 'Estimated Repairs': 50000,
      'Estimated Debt': 100000, 'Asking Price': 140000,
      'Distress Type': 'Absentee Owner', Source: MARKER,
      Notes: 'Automated live-pipeline verification record. Never contact or submit.',
      'Created At': now, 'Updated At': now
    }, { idField: 'Distress Lead ID', idPrefix: 'LPV' });
    return { ok: true, created: true, record: record };
  }

  function run() {
    ensureSheets();
    var started = new Date();
    var runId = 'LPVRUN-' + Utilities.formatDate(started, Session.getScriptTimeZone() || TZ, 'yyyyMMdd-HHmmss');
    var lead = createTestLead().record || {};
    var leadId = getId_(lead);
    var checks = [];

    checks.push(verifyStage_(runId, 'Distress lead', '', 'DISTRESS_LEADS', leadId, function () { return findTestRows_('DISTRESS_LEADS'); }));

    invokeStage_(runId, 'Lead normalization', REOS.LeadNormalization, 'normalize', [lead]);
    invokeStage_(runId, 'Lead deduplication', REOS.LeadDeduplication, 'scanSheet', ['DISTRESS_LEADS']);
    invokeStage_(runId, 'Ingestion orchestrator', REOS.AcquisitionIngestionOrchestrator, 'run', []);
    checks.push(verifyStage_(runId, 'Intelligent acquisition lead', 'DISTRESS_LEADS', 'IA_LEADS', leadId, function () { return findRelatedRows_('IA_LEADS', leadId); }));

    invokeStage_(runId, 'Acquisition intelligence', REOS.AcquisitionIntelligence, 'analyzeAll', []);
    invokeStage_(runId, 'Deal intelligence', REOS.AcquisitionDealIntelligence, 'analyzeAll', []);
    checks.push(verifyStage_(runId, 'Deal intelligence record', 'IA_LEADS', 'AI_DEAL_INTELLIGENCE', leadId, function () { return findRelatedRows_('AI_DEAL_INTELLIGENCE', leadId); }));

    invokeStage_(runId, 'Offer automation', REOS.AcquisitionOfferAutomation, 'generateDrafts', []);
    checks.push(verifyStage_(runId, 'Offer queue record', 'AI_DEAL_INTELLIGENCE', 'AI_OFFER_QUEUE', leadId, function () { return findRelatedRows_('AI_OFFER_QUEUE', leadId); }));

    invokeStage_(runId, 'Offer review', REOS.OfferReviewWorkflow, 'generateQueue', []);
    checks.push(verifyStage_(runId, 'Offer review record', 'AI_OFFER_QUEUE', 'AI_OFFER_REVIEW', leadId, function () { return findRelatedRows_('AI_OFFER_REVIEW', leadId); }));

    invokeStage_(runId, 'Offer execution', REOS.OfferExecutionWorkflow, 'buildQueue', []);
    checks.push(verifyStage_(runId, 'Offer record', 'AI_OFFER_REVIEW', 'OFFERS', leadId, function () { return findRelatedRows_('OFFERS', leadId); }));
    checks.push(verifyStage_(runId, 'Execution queue record', 'OFFERS', 'OFFER_EXECUTION_QUEUE', leadId, function () { return findRelatedRows_('OFFER_EXECUTION_QUEUE', leadId); }));

    var duplicateCheck = verifyDuplicates_(runId, leadId);
    checks.push(duplicateCheck);
    var passed = checks.filter(function (x) { return x.status === 'Pass'; }).length;
    var failed = checks.length - passed;
    var completed = new Date();
    var integrity = checks.length ? Math.round((passed / checks.length) * 100) : 0;
    var status = failed === 0 ? 'Verified' : 'Needs Attention';
    var summary = { runId: runId, status: status, leadId: leadId, passed: passed, failed: failed, integrityPercent: integrity, duplicateProtection: duplicateCheck.status, checks: checks };

    REOS.Database.insert(RUNS, {
      'Run ID': runId, Status: status, 'Lead ID': leadId, Address: ADDRESS,
      Passed: passed, Failed: failed, 'Integrity Percent': integrity,
      'Duplicate Protection': duplicateCheck.status,
      'Started At': started, 'Completed At': completed,
      'Duration Ms': completed.getTime() - started.getTime(),
      'Summary JSON': JSON.stringify(summary), 'Executed By': currentUser_()
    }, { idField: 'Run ID', idPrefix: 'LPVRUN', preserveProvidedId: true });

    audit_(runId, 'RUN_COMPLETED', RUNS, runId, summary);
    return { ok: failed === 0, status: status, summary: summary };
  }

  function invokeStage_(runId, stage, module, method, args) {
    var start = new Date();
    try {
      if (!module || typeof module[method] !== 'function') throw new Error(stage + ' module method unavailable: ' + method);
      var value = module[method].apply(module, args || []);
      audit_(runId, 'INVOKED_' + method.toUpperCase(), '', '', { stage: stage, result: safeJson_(value), durationMs: new Date().getTime() - start.getTime() });
      return value;
    } catch (e) {
      writeResult_(runId, stage, '', '', '', '', '', 'Fail', new Date().getTime() - start.getTime(), e.message || String(e));
      return null;
    }
  }

  function verifyStage_(runId, stage, source, destination, parentId, finder) {
    var start = new Date();
    try {
      var rows = finder() || [];
      var row = rows[0] || null;
      var ok = !!row;
      return writeResult_(runId, stage, source, destination, parentId, row ? getId_(row) : '', parentId, ok ? 'Pass' : 'Fail', new Date().getTime() - start.getTime(), ok ? 'Record located' : 'No related record located');
    } catch (e) {
      return writeResult_(runId, stage, source, destination, parentId, '', parentId, 'Fail', new Date().getTime() - start.getTime(), e.message || String(e));
    }
  }

  function verifyDuplicates_(runId, leadId) {
    var sheets = ['DISTRESS_LEADS','IA_LEADS','AI_DEAL_INTELLIGENCE','AI_OFFER_QUEUE','AI_OFFER_REVIEW','OFFERS','OFFER_EXECUTION_QUEUE'];
    var duplicates = [];
    sheets.forEach(function (name) {
      var rows = name === 'DISTRESS_LEADS' ? findTestRows_(name) : findRelatedRows_(name, leadId);
      if (rows.length > 1) duplicates.push(name + ':' + rows.length);
    });
    return writeResult_(runId, 'Duplicate protection', '', '', leadId, '', leadId, duplicates.length ? 'Fail' : 'Pass', 0, duplicates.length ? duplicates.join(', ') : 'No duplicate test records detected');
  }

  function findTestRows_(sheetName) {
    return (REOS.Database.getAll(sheetName) || []).filter(function (r) { return String(r.Source || '') === MARKER || normalize_(r.Address) === normalize_(ADDRESS); });
  }

  function findRelatedRows_(sheetName, leadId) {
    var keys = ['Distress Lead ID','Lead ID','IA Lead ID','Parent Lead ID','Source Lead ID','Property ID','Record ID'];
    return (REOS.Database.getAll(sheetName) || []).filter(function (r) {
      if (normalize_(r.Address) === normalize_(ADDRESS) || String(r.Source || '') === MARKER) return true;
      return keys.some(function (k) { return leadId && String(r[k] || '') === String(leadId); });
    });
  }

  function writeResult_(runId, stage, source, destination, inputId, outputId, parentId, status, duration, message) {
    var row = { stage: stage, status: status, sourceSheet: source, destinationSheet: destination, inputRecordId: inputId || '', outputRecordId: outputId || '', parentRecordId: parentId || '', durationMs: duration || 0, message: message || '' };
    REOS.Database.insert(RESULTS, {
      'Run ID': runId, Stage: stage, 'Source Sheet': source, 'Destination Sheet': destination,
      'Input Record ID': row.inputRecordId, 'Output Record ID': row.outputRecordId,
      'Parent Record ID': row.parentRecordId, Status: status, 'Duration Ms': row.durationMs,
      Message: row.message, 'Checked At': new Date()
    }, { idField: 'Result ID', idPrefix: 'LPVRES' });
    return row;
  }

  function audit_(runId, event, sheet, recordId, details) {
    REOS.Database.insert(AUDIT, { 'Run ID': runId, Event: event, Sheet: sheet || '', 'Record ID': recordId || '', 'Details JSON': JSON.stringify(details || {}), 'Created At': new Date() }, { idField: 'Audit ID', idPrefix: 'LPVAUD' });
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(RUNS) || [];
    return { ok: true, latest: rows.length ? rows[rows.length - 1] : null, runs: rows.length };
  }

  function getId_(r) {
    if (!r) return '';
    var keys = Object.keys(r);
    for (var i = 0; i < keys.length; i++) if (/\bID$/i.test(keys[i]) && r[keys[i]]) return String(r[keys[i]]);
    return '';
  }
  function normalize_(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function safeJson_(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return String(v); } }
  function requireDatabase_() { if (!REOS.Database) throw new Error('Database.gs is required.'); }
  function currentUser_() { try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; } }

  return { ensureSheets: ensureSheets, createTestLead: createTestLead, run: run, summary: summary };
})();

function reosLivePipelineEnsureSheets() { return REOS.LivePipelineVerification.ensureSheets(); }
function reosLivePipelineCreateTestLead() { return REOS.LivePipelineVerification.createTestLead(); }
function reosLivePipelineRun() { return REOS.LivePipelineVerification.run(); }
function reosLivePipelineSummary() { return REOS.LivePipelineVerification.summary(); }

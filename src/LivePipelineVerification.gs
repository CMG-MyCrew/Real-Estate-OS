/**
 * REOS Enterprise v4.4.3
 * Sprint 7.3 Increment 3.1 — Staged Live Pipeline Verification
 *
 * Repeated calls to reosLivePipelineRun() advance one stage at a time.
 * State is persisted in Script Properties so no single Apps Script execution
 * performs the entire acquisition pipeline.
 */
var REOS = REOS || {};

REOS.LivePipelineVerification = (function () {
  var RUNS = 'LIVE_PIPELINE_RUNS';
  var RESULTS = 'LIVE_PIPELINE_RESULTS';
  var AUDIT = 'LIVE_PIPELINE_AUDIT';
  var MARKER = 'REOS-LIVE-PIPELINE-TEST';
  var ADDRESS = '742 Walnut Street';
  var TZ = 'America/New_York';
  var STATE_KEY = 'REOS_LIVE_PIPELINE_STATE_V1';

  var RUN_HEADERS = [
    'Run ID','Status','Lead ID','Address','Passed','Failed','Integrity Percent',
    'Duplicate Protection','Started At','Completed At','Duration Ms','Summary JSON','Executed By'
  ];
  var RESULT_HEADERS = [
    'Result ID','Run ID','Stage','Source Sheet','Destination Sheet','Input Record ID',
    'Output Record ID','Parent Record ID','Status','Duration Ms','Message','Checked At'
  ];
  var AUDIT_HEADERS = [
    'Audit ID','Run ID','Event','Sheet','Record ID','Details JSON','Created At'
  ];

  var STAGES = [
    { id: 1, name: 'Initialize and verify distress lead', fn: stageInitialize_ },
    { id: 2, name: 'Ingest intelligent acquisition lead', fn: stageIngest_ },
    { id: 3, name: 'Run acquisition intelligence', fn: stageAcquisitionIntelligence_ },
    { id: 4, name: 'Run deal intelligence', fn: stageDealIntelligence_ },
    { id: 5, name: 'Generate offer queue', fn: stageOfferAutomation_ },
    { id: 6, name: 'Generate offer review queue', fn: stageOfferReview_ },
    { id: 7, name: 'Build offer execution queue', fn: stageOfferExecution_ },
    { id: 8, name: 'Verify duplicates and finalize', fn: stageFinalize_ }
  ];

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
      Address: ADDRESS,
      City: 'Philadelphia',
      State: 'PA',
      Zip: '19106',
      'Estimated Value': 250000,
      ARV: 300000,
      'Estimated Repairs': 50000,
      'Estimated Debt': 100000,
      'Asking Price': 140000,
      'Distress Type': 'Absentee Owner',
      Source: MARKER,
      Notes: 'Automated live-pipeline verification record. Never contact or submit.',
      'Created At': now,
      'Updated At': now
    }, { idField: 'Distress Lead ID', idPrefix: 'LPV' });

    return { ok: true, created: true, record: record };
  }

  function start() {
    ensureSheets();
    var started = new Date();
    var leadResult = createTestLead();
    var lead = leadResult.record || {};
    var state = {
      version: '4.4.3',
      runId: 'LPVRUN-' + Utilities.formatDate(started, Session.getScriptTimeZone() || TZ, 'yyyyMMdd-HHmmss'),
      status: 'In Progress',
      stageIndex: 0,
      stageCount: STAGES.length,
      leadId: getId_(lead),
      address: ADDRESS,
      startedAt: started.toISOString(),
      completedAt: '',
      checks: [],
      errors: [],
      executedBy: currentUser_()
    };
    saveState_(state);
    audit_(state.runId, 'RUN_STARTED', RUNS, state.runId, {
      leadId: state.leadId,
      createdLead: !!leadResult.created,
      stageCount: state.stageCount
    });
    return status();
  }

  /**
   * Safe replacement for the old monolithic runner.
   * Each call advances exactly one persisted stage.
   */
  function run() {
    var state = loadState_();
    if (!state || state.status === 'Verified' || state.status === 'Needs Attention') {
      start();
    }
    return runNextStage();
  }

  function runNextStage() {
    ensureSheets();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('Another live pipeline stage is already running.');

    try {
      var state = loadState_();
      if (!state) return start();
      if (state.status !== 'In Progress') return status();

      var stage = STAGES[state.stageIndex];
      if (!stage) return finalize_(state);

      var started = new Date();
      audit_(state.runId, 'STAGE_STARTED', '', '', {
        stageId: stage.id,
        stageName: stage.name
      });

      try {
        var check = stage.fn(state) || null;
        if (check) state.checks.push(check);
      } catch (error) {
        var failure = writeResult_(
          state.runId,
          stage.name,
          '',
          '',
          state.leadId,
          '',
          state.leadId,
          'Fail',
          new Date().getTime() - started.getTime(),
          error.message || String(error)
        );
        state.checks.push(failure);
        state.errors.push({ stage: stage.name, message: error.message || String(error) });
      }

      state.stageIndex += 1;
      saveState_(state);
      audit_(state.runId, 'STAGE_COMPLETED', '', '', {
        stageId: stage.id,
        stageName: stage.name,
        nextStageIndex: state.stageIndex,
        durationMs: new Date().getTime() - started.getTime()
      });

      if (state.stageIndex >= STAGES.length) return finalize_(state);
      return status();
    } finally {
      lock.releaseLock();
    }
  }

  function stageInitialize_(state) {
    return verifyStage_(
      state.runId,
      'Distress lead',
      '',
      'DISTRESS_LEADS',
      state.leadId,
      function () { return findTestRows_('DISTRESS_LEADS'); }
    );
  }

  function stageIngest_(state) {
    invokeStage_(state.runId, 'Lead normalization', REOS.LeadNormalization, 'normalize', [findTestRows_('DISTRESS_LEADS')[0] || {}]);
    invokeStage_(state.runId, 'Lead deduplication', REOS.LeadDeduplication, 'scanSheet', ['DISTRESS_LEADS', 'Distress Lead ID']);
    invokeStage_(state.runId, 'Ingestion orchestrator', REOS.AcquisitionIngestionOrchestrator, 'run', [{
      runConnectors: false,
      scanDuplicates: false,
      scoreLeads: false,
      autoPromote: false
    }]);
    return verifyStage_(
      state.runId,
      'Intelligent acquisition lead',
      'DISTRESS_LEADS',
      'IA_LEADS',
      state.leadId,
      function () { return findRelatedRows_('IA_LEADS', state.leadId); }
    );
  }

  function stageAcquisitionIntelligence_(state) {
    invokeStage_(state.runId, 'Acquisition intelligence', REOS.AcquisitionIntelligence, 'analyzeAll', []);
    var rows = findRelatedRows_('IA_LEADS', state.leadId);
    return writeResult_(
      state.runId,
      'Acquisition intelligence completed',
      'IA_LEADS',
      'IA_LEADS',
      state.leadId,
      rows.length ? getId_(rows[0]) : '',
      state.leadId,
      rows.length ? 'Pass' : 'Fail',
      0,
      rows.length ? 'Related intelligent acquisition lead remains available' : 'Related IA lead not found after analysis'
    );
  }

  function stageDealIntelligence_(state) {
    invokeStage_(state.runId, 'Deal intelligence', REOS.AcquisitionDealIntelligence, 'analyzeAll', []);
    return verifyStage_(
      state.runId,
      'Deal intelligence record',
      'IA_LEADS',
      'AI_DEAL_INTELLIGENCE',
      state.leadId,
      function () { return findRelatedRows_('AI_DEAL_INTELLIGENCE', state.leadId); }
    );
  }

  function stageOfferAutomation_(state) {
    invokeStage_(state.runId, 'Offer automation', REOS.AcquisitionOfferAutomation, 'generateDrafts', []);
    return verifyStage_(
      state.runId,
      'Offer queue record',
      'AI_DEAL_INTELLIGENCE',
      'AI_OFFER_QUEUE',
      state.leadId,
      function () { return findRelatedRows_('AI_OFFER_QUEUE', state.leadId); }
    );
  }

  function stageOfferReview_(state) {
    invokeStage_(state.runId, 'Offer review', REOS.OfferReviewWorkflow, 'generateQueue', []);
    return verifyStage_(
      state.runId,
      'Offer review record',
      'AI_OFFER_QUEUE',
      'AI_OFFER_REVIEW',
      state.leadId,
      function () { return findRelatedRows_('AI_OFFER_REVIEW', state.leadId); }
    );
  }

  function stageOfferExecution_(state) {
    invokeStage_(state.runId, 'Offer execution', REOS.OfferExecutionWorkflow, 'buildQueue', []);
    var offerCheck = verifyStage_(
      state.runId,
      'Offer record',
      'AI_OFFER_REVIEW',
      'OFFERS',
      state.leadId,
      function () { return findRelatedRows_('OFFERS', state.leadId); }
    );
    state.checks.push(offerCheck);
    return verifyStage_(
      state.runId,
      'Execution queue record',
      'OFFERS',
      'OFFER_EXECUTION_QUEUE',
      state.leadId,
      function () { return findRelatedRows_('OFFER_EXECUTION_QUEUE', state.leadId); }
    );
  }

  function stageFinalize_(state) {
    return verifyDuplicates_(state.runId, state.leadId);
  }

  function finalize() {
    var state = loadState_();
    if (!state) throw new Error('No live pipeline run is active. Run reosLivePipelineStart() first.');
    return finalize_(state);
  }

  function finalize_(state) {
    if (state.status === 'Verified' || state.status === 'Needs Attention') return status();

    var passed = state.checks.filter(function (x) { return x.status === 'Pass'; }).length;
    var failed = state.checks.length - passed;
    var completed = new Date();
    var integrity = state.checks.length ? Math.round((passed / state.checks.length) * 100) : 0;
    var duplicate = state.checks.filter(function (x) { return x.stage === 'Duplicate protection'; })[0] || null;

    state.status = failed === 0 ? 'Verified' : 'Needs Attention';
    state.completedAt = completed.toISOString();
    state.passed = passed;
    state.failed = failed;
    state.integrityPercent = integrity;
    state.duplicateProtection = duplicate ? duplicate.status : 'Not Run';

    var summary = {
      runId: state.runId,
      status: state.status,
      leadId: state.leadId,
      passed: passed,
      failed: failed,
      integrityPercent: integrity,
      duplicateProtection: state.duplicateProtection,
      checks: state.checks,
      errors: state.errors
    };

    REOS.Database.insert(RUNS, {
      'Run ID': state.runId,
      Status: state.status,
      'Lead ID': state.leadId,
      Address: state.address,
      Passed: passed,
      Failed: failed,
      'Integrity Percent': integrity,
      'Duplicate Protection': state.duplicateProtection,
      'Started At': new Date(state.startedAt),
      'Completed At': completed,
      'Duration Ms': completed.getTime() - new Date(state.startedAt).getTime(),
      'Summary JSON': JSON.stringify(summary),
      'Executed By': state.executedBy || currentUser_()
    }, { idField: 'Run ID', idPrefix: 'LPVRUN', preserveProvidedId: true });

    saveState_(state);
    audit_(state.runId, 'RUN_COMPLETED', RUNS, state.runId, summary);
    return status();
  }

  function reset() {
    PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
    return { ok: true, status: 'Reset', message: 'Live pipeline staged state cleared.' };
  }

  function status() {
    var state = loadState_();
    if (!state) {
      return {
        ok: true,
        active: false,
        status: 'Not Started',
        nextAction: 'Run reosLivePipelineStart() or reosLivePipelineRun().'
      };
    }

    var next = STAGES[state.stageIndex] || null;
    return {
      ok: state.status !== 'Needs Attention',
      active: state.status === 'In Progress',
      runId: state.runId,
      status: state.status,
      leadId: state.leadId,
      completedStages: Math.min(state.stageIndex, STAGES.length),
      totalStages: STAGES.length,
      nextStage: next ? next.name : '',
      nextAction: state.status === 'In Progress'
        ? 'Run reosLivePipelineRun() again to advance one stage.'
        : 'Run reosLivePipelineStart() to begin a new verification run.',
      passed: Number(state.passed || state.checks.filter(function (x) { return x.status === 'Pass'; }).length),
      failed: Number(state.failed || state.checks.filter(function (x) { return x.status === 'Fail'; }).length),
      integrityPercent: Number(state.integrityPercent || 0),
      duplicateProtection: state.duplicateProtection || 'Pending',
      errors: state.errors || []
    };
  }

  function invokeStage_(runId, stage, module, method, args) {
    var start = new Date();
    if (!module || typeof module[method] !== 'function') {
      throw new Error(stage + ' module method unavailable: ' + method);
    }
    var value = module[method].apply(module, args || []);
    audit_(runId, 'INVOKED_' + method.toUpperCase(), '', '', {
      stage: stage,
      result: safeJson_(value),
      durationMs: new Date().getTime() - start.getTime()
    });
    return value;
  }

  function verifyStage_(runId, stage, source, destination, parentId, finder) {
    var start = new Date();
    try {
      var rows = finder() || [];
      var row = rows[0] || null;
      var ok = !!row;
      return writeResult_(
        runId,
        stage,
        source,
        destination,
        parentId,
        row ? getId_(row) : '',
        parentId,
        ok ? 'Pass' : 'Fail',
        new Date().getTime() - start.getTime(),
        ok ? 'Record located' : 'No related record located'
      );
    } catch (error) {
      return writeResult_(
        runId,
        stage,
        source,
        destination,
        parentId,
        '',
        parentId,
        'Fail',
        new Date().getTime() - start.getTime(),
        error.message || String(error)
      );
    }
  }

  function verifyDuplicates_(runId, leadId) {
    var sheets = [
      'DISTRESS_LEADS','IA_LEADS','AI_DEAL_INTELLIGENCE','AI_OFFER_QUEUE',
      'AI_OFFER_REVIEW','OFFERS','OFFER_EXECUTION_QUEUE'
    ];
    var duplicates = [];
    sheets.forEach(function (name) {
      var rows = name === 'DISTRESS_LEADS' ? findTestRows_(name) : findRelatedRows_(name, leadId);
      if (rows.length > 1) duplicates.push(name + ':' + rows.length);
    });
    return writeResult_(
      runId,
      'Duplicate protection',
      '',
      '',
      leadId,
      '',
      leadId,
      duplicates.length ? 'Fail' : 'Pass',
      0,
      duplicates.length ? duplicates.join(', ') : 'No duplicate test records detected'
    );
  }

  function findTestRows_(sheetName) {
    return (REOS.Database.getAll(sheetName) || []).filter(function (row) {
      return String(row.Source || '') === MARKER || normalize_(row.Address) === normalize_(ADDRESS);
    });
  }

  function findRelatedRows_(sheetName, leadId) {
    var keys = [
      'Distress Lead ID','Lead ID','IA Lead ID','Parent Lead ID','Source Lead ID',
      'Property ID','Record ID'
    ];
    return (REOS.Database.getAll(sheetName) || []).filter(function (row) {
      if (normalize_(row.Address) === normalize_(ADDRESS) || String(row.Source || '') === MARKER) return true;
      return keys.some(function (key) {
        return leadId && String(row[key] || '') === String(leadId);
      });
    });
  }

  function writeResult_(runId, stage, source, destination, inputId, outputId, parentId, statusValue, duration, message) {
    var row = {
      stage: stage,
      status: statusValue,
      sourceSheet: source,
      destinationSheet: destination,
      inputRecordId: inputId || '',
      outputRecordId: outputId || '',
      parentRecordId: parentId || '',
      durationMs: duration || 0,
      message: message || ''
    };
    REOS.Database.insert(RESULTS, {
      'Run ID': runId,
      Stage: stage,
      'Source Sheet': source,
      'Destination Sheet': destination,
      'Input Record ID': row.inputRecordId,
      'Output Record ID': row.outputRecordId,
      'Parent Record ID': row.parentRecordId,
      Status: statusValue,
      'Duration Ms': row.durationMs,
      Message: row.message,
      'Checked At': new Date()
    }, { idField: 'Result ID', idPrefix: 'LPVRES' });
    return row;
  }

  function audit_(runId, event, sheet, recordId, details) {
    REOS.Database.insert(AUDIT, {
      'Run ID': runId,
      Event: event,
      Sheet: sheet || '',
      'Record ID': recordId || '',
      'Details JSON': JSON.stringify(details || {}),
      'Created At': new Date()
    }, { idField: 'Audit ID', idPrefix: 'LPVAUD' });
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(RUNS) || [];
    return {
      ok: true,
      latest: rows.length ? rows[rows.length - 1] : null,
      runs: rows.length,
      stagedStatus: status()
    };
  }

  function loadState_() {
    var raw = PropertiesService.getScriptProperties().getProperty(STATE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (error) {
      PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
      throw new Error('Live pipeline state was invalid and has been cleared.');
    }
  }

  function saveState_(state) {
    PropertiesService.getScriptProperties().setProperty(STATE_KEY, JSON.stringify(state));
  }

  function getId_(record) {
    if (!record) return '';
    var keys = Object.keys(record);
    for (var i = 0; i < keys.length; i++) {
      if (/\bID$/i.test(keys[i]) && record[keys[i]]) return String(record[keys[i]]);
    }
    return '';
  }

  function normalize_(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function safeJson_(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (error) { return String(value); }
  }

  function requireDatabase_() {
    if (!REOS.Database) throw new Error('Database.gs is required.');
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || ''; }
    catch (error) { return ''; }
  }

  return {
    ensureSheets: ensureSheets,
    createTestLead: createTestLead,
    start: start,
    run: run,
    runNextStage: runNextStage,
    status: status,
    finalize: finalize,
    reset: reset,
    summary: summary
  };
})();

function reosLivePipelineEnsureSheets() { return REOS.LivePipelineVerification.ensureSheets(); }
function reosLivePipelineCreateTestLead() { return REOS.LivePipelineVerification.createTestLead(); }
function reosLivePipelineStart() { return REOS.LivePipelineVerification.start(); }
function reosLivePipelineRun() { return REOS.LivePipelineVerification.run(); }
function reosLivePipelineRunNextStage() { return REOS.LivePipelineVerification.runNextStage(); }
function reosLivePipelineStatus() { return REOS.LivePipelineVerification.status(); }
function reosLivePipelineFinalize() { return REOS.LivePipelineVerification.finalize(); }
function reosLivePipelineReset() { return REOS.LivePipelineVerification.reset(); }
function reosLivePipelineSummary() { return REOS.LivePipelineVerification.summary(); }

// REOS Enterprise v4.4.5
// Sprint 7.3 Increment 3.3 - Offer Pipeline Reconciliation
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
    'Result ID','Run ID','Stage ID','Stage','Source Sheet','Destination Sheet','Input Record ID',
    'Output Record ID','Parent Record ID','Status','Duration Ms','Message','Checked At'
  ];
  var AUDIT_HEADERS = [
    'Audit ID','Run ID','Stage ID','Event','Sheet','Record ID','Details JSON','Created At'
  ];

  var STAGES = [
    { id: 1, name: 'Initialize and verify distress lead', fn: stageInitialize_ },
    { id: 2, name: 'Ingest intelligent acquisition lead', fn: stageIngest_ },
    { id: 3, name: 'Run acquisition intelligence and verify decision', fn: stageAcquisitionIntelligence_ },
    { id: 4, name: 'Run deal intelligence', fn: stageDealIntelligence_ },
    { id: 5, name: 'Generate eligible offer queue record', fn: stageOfferAutomation_ },
    { id: 6, name: 'Generate offer review record', fn: stageOfferReview_ },
    { id: 7, name: 'Approve, publish, and build execution queue', fn: stageOfferExecution_ },
    { id: 8, name: 'Verify natural-key duplicates and finalize', fn: stageFinalize_ }
  ];

  function ensureSheets() {
    requireDatabase_();
    REOS.Database.ensureTable(RUNS, RUN_HEADERS);
    REOS.Database.ensureTable(RESULTS, RESULT_HEADERS);
    REOS.Database.ensureTable(AUDIT, AUDIT_HEADERS);
    migrateStageIdColumns_();
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
      version: '4.4.5',
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
      executedBy: currentUser_(),
      decisionId: '',
      offerQueueId: '',
      reviewId: '',
      offerId: '',
      executionId: ''
    };
    saveState_(state);
    insertRunStart_(state);
    audit_(state.runId, 0, 'RUN_STARTED', RUNS, state.runId, {
      leadId: state.leadId,
      createdLead: !!leadResult.created,
      stageCount: state.stageCount
    });
    return status();
  }

  function run() {
    var state = loadState_();
    if (!state || state.status === 'Verified' || state.status === 'Needs Attention') start();
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
      audit_(state.runId, stage.id, 'STAGE_STARTED', '', '', { stageId: stage.id, stageName: stage.name });
      try {
        var check = stage.fn(state) || null;
        if (check) state.checks.push(check);
      } catch (error) {
        var failure = writeResult_(state.runId, stage.id, stage.name, '', '', state.leadId, '', state.leadId,
          'Fail', new Date().getTime() - started.getTime(), error.message || String(error));
        state.checks.push(failure);
        state.errors.push({ stage: stage.name, message: error.message || String(error) });
      }
      state.stageIndex += 1;
      saveState_(state);
      updateRunProgress_(state);
      audit_(state.runId, stage.id, 'STAGE_COMPLETED', '', '', {
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
    return verifyStage_(state.runId, 1, 'Distress lead', '', 'DISTRESS_LEADS', state.leadId,
      function () { return findTestRows_('DISTRESS_LEADS'); });
  }

  function stageIngest_(state) {
    var distress = findTestRows_('DISTRESS_LEADS')[0] || {};
    invokeStage_(state.runId, 2, 'Lead normalization', REOS.LeadNormalization, 'normalize', [distress]);
    invokeStage_(state.runId, 2, 'Lead deduplication', REOS.LeadDeduplication, 'scanSheet', ['DISTRESS_LEADS', 'Distress Lead ID']);
    invokeStage_(state.runId, 2, 'Ingestion orchestrator', REOS.AcquisitionIngestionOrchestrator, 'run', [{
      runConnectors: false,
      scanDuplicates: false,
      scoreLeads: false,
      autoPromote: false
    }]);
    var rows = findRelatedRows_('IA_LEADS', state.leadId);
    if (rows.length) {
      REOS.Database.update('IA_LEADS', 'Lead ID', rows[0]['Lead ID'], {
        'Total Score': Math.max(85, Number(rows[0]['Total Score'] || 0)),
        Grade: rows[0].Grade || 'A',
        'Updated At': new Date()
      });
    }
    return verifyStage_(state.runId, 2, 'Intelligent acquisition lead', 'DISTRESS_LEADS', 'IA_LEADS', state.leadId,
      function () { return findRelatedRows_('IA_LEADS', state.leadId); });
  }

  function stageAcquisitionIntelligence_(state) {
    invokeStage_(state.runId, 3, 'Acquisition intelligence', REOS.AcquisitionIntelligence, 'analyzeAll', []);
    var decisions = findRelatedRows_('AI_ACQUISITION_DECISIONS', state.leadId);
    var decision = decisions[0] || null;
    if (decision) state.decisionId = String(decision['Decision ID'] || '');
    var eligible = !!decision && ['Acquire', 'Review'].indexOf(String(decision.Decision || '')) !== -1 && Number(decision['Lead Score'] || 0) >= 70;
    saveState_(state);
    return writeResult_(state.runId, 3, 'Acquisition decision eligibility', 'IA_LEADS', 'AI_ACQUISITION_DECISIONS',
      state.leadId, state.decisionId, state.leadId, eligible ? 'Pass' : 'Fail', 0,
      decision ? ('Decision=' + decision.Decision + '; Lead Score=' + Number(decision['Lead Score'] || 0)) : 'No acquisition decision located');
  }

  function stageDealIntelligence_(state) {
    invokeStage_(state.runId, 4, 'Deal intelligence', REOS.AcquisitionDealIntelligence, 'analyzeAll', []);
    return verifyStage_(state.runId, 4, 'Deal intelligence record', 'IA_LEADS', 'AI_DEAL_INTELLIGENCE', state.leadId,
      function () { return findRelatedRows_('AI_DEAL_INTELLIGENCE', state.leadId); });
  }

  function stageOfferAutomation_(state) {
    var decision = findOne_('AI_ACQUISITION_DECISIONS', 'Decision ID', state.decisionId) ||
      findRelatedRows_('AI_ACQUISITION_DECISIONS', state.leadId)[0] || null;
    if (!decision) throw new Error('No acquisition decision is available for offer generation.');
    if (['Acquire', 'Review'].indexOf(String(decision.Decision || '')) === -1 || Number(decision['Lead Score'] || 0) < 70) {
      throw new Error('Controlled lead is not eligible for offer generation: Decision=' + decision.Decision + ', Lead Score=' + Number(decision['Lead Score'] || 0));
    }
    invokeStage_(state.runId, 5, 'Offer automation', REOS.AcquisitionOfferAutomation, 'generateDrafts', [{
      minimumScore: 70,
      allowedDecisions: ['Acquire', 'Review'],
      maxDrafts: 100
    }]);
    var rows = findByField_('AI_OFFER_QUEUE', 'Decision ID', decision['Decision ID']);
    var queue = rows[0] || null;
    if (queue) state.offerQueueId = String(queue['Offer Queue ID'] || '');
    saveState_(state);
    return writeResult_(state.runId, 5, 'Offer queue record', 'AI_ACQUISITION_DECISIONS', 'AI_OFFER_QUEUE',
      String(decision['Decision ID'] || ''), state.offerQueueId, state.leadId, queue ? 'Pass' : 'Fail', 0,
      queue ? 'Eligible decision produced an offer queue record' : 'No offer queue record found for Decision ID');
  }

  function stageOfferReview_(state) {
    invokeStage_(state.runId, 6, 'Offer review', REOS.OfferReviewWorkflow, 'generateQueue', [{ includeDrafts: true, maxItems: 100 }]);
    var rows = findByField_('AI_OFFER_REVIEW', 'Offer Queue ID', state.offerQueueId);
    var review = rows[0] || null;
    if (review) state.reviewId = String(review['Review ID'] || '');
    saveState_(state);
    return writeResult_(state.runId, 6, 'Offer review record', 'AI_OFFER_QUEUE', 'AI_OFFER_REVIEW',
      state.offerQueueId, state.reviewId, state.leadId, review ? 'Pass' : 'Fail', 0,
      review ? 'Offer review record located by Offer Queue ID' : 'No offer review record found for Offer Queue ID');
  }

  function stageOfferExecution_(state) {
    var review = findOne_('AI_OFFER_REVIEW', 'Review ID', state.reviewId);
    if (!review) throw new Error('Controlled offer review record not found.');
    var queue = findOne_('AI_OFFER_QUEUE', 'Offer Queue ID', state.offerQueueId) || {};
    var controlled = String(queue['Lead ID'] || review['Lead ID'] || '') === String(state.leadId || '') ||
      normalize_(queue.Address || review.Address) === normalize_(ADDRESS);
    if (!controlled) throw new Error('Safety check failed: review does not belong to the controlled test lead.');

    if (String(review['Review Status'] || '') !== 'Approved') {
      invokeStage_(state.runId, 7, 'Controlled offer approval', REOS.OfferReviewWorkflow, 'approve', [
        state.reviewId,
        'Automated controlled verification approval. Never submit.'
      ]);
    }
    invokeStage_(state.runId, 7, 'Publish approved controlled offer', REOS.OfferReviewWorkflow, 'publishApproved', []);
    review = findOne_('AI_OFFER_REVIEW', 'Review ID', state.reviewId) || review;
    state.offerId = String(review['Published Offer ID'] || '');
    if (!state.offerId) {
      var offers = findByField_('OFFERS', 'Lead ID', state.leadId);
      state.offerId = offers.length ? String(offers[offers.length - 1]['Offer ID'] || '') : '';
    }
    var offerCheck = writeResult_(state.runId, 7, 'Offer record', 'AI_OFFER_REVIEW', 'OFFERS',
      state.reviewId, state.offerId, state.leadId, state.offerId ? 'Pass' : 'Fail', 0,
      state.offerId ? 'Approved review published to OFFERS' : 'No published offer located');
    state.checks.push(offerCheck);

    invokeStage_(state.runId, 7, 'Offer execution', REOS.OfferExecutionWorkflow, 'buildQueue', [{ maxItems: 200 }]);
    var executions = findByField_('OFFER_EXECUTION_QUEUE', 'Offer ID', state.offerId);
    var execution = executions[0] || null;
    if (execution) state.executionId = String(execution['Execution ID'] || '');
    saveState_(state);
    return writeResult_(state.runId, 7, 'Execution queue record', 'OFFERS', 'OFFER_EXECUTION_QUEUE',
      state.offerId, state.executionId, state.leadId, execution ? 'Pass' : 'Fail', 0,
      execution ? 'Offer execution queue record located by Offer ID' : 'No execution queue record found for Offer ID');
  }

  function stageFinalize_(state) {
    return verifyNaturalKeyDuplicates_(state.runId, 8, state);
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
      decisionId: state.decisionId,
      offerQueueId: state.offerQueueId,
      reviewId: state.reviewId,
      offerId: state.offerId,
      executionId: state.executionId,
      passed: passed,
      failed: failed,
      integrityPercent: integrity,
      duplicateProtection: state.duplicateProtection,
      checks: state.checks,
      errors: state.errors
    };
    REOS.Database.update(RUNS, 'Run ID', state.runId, {
      Status: state.status,
      Passed: passed,
      Failed: failed,
      'Integrity Percent': integrity,
      'Duplicate Protection': state.duplicateProtection,
      'Completed At': completed,
      'Duration Ms': completed.getTime() - new Date(state.startedAt).getTime(),
      'Summary JSON': JSON.stringify(summary),
      'Executed By': state.executedBy || currentUser_()
    });
    saveState_(state);
    audit_(state.runId, 0, 'RUN_COMPLETED', RUNS, state.runId, summary);
    return status();
  }

  function reset() {
    PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
    return { ok: true, status: 'Reset', message: 'Live pipeline staged state cleared.' };
  }

  function status() {
    var state = loadState_();
    if (!state) return { ok: true, active: false, status: 'Not Started', nextAction: 'Run reosLivePipelineStart() or reosLivePipelineRun().' };
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
      nextAction: state.status === 'In Progress' ? 'Run reosLivePipelineRun() again to advance one stage.' : 'Run reosLivePipelineStart() to begin a new verification run.',
      passed: Number(state.passed || state.checks.filter(function (x) { return x.status === 'Pass'; }).length),
      failed: Number(state.failed || state.checks.filter(function (x) { return x.status === 'Fail'; }).length),
      integrityPercent: Number(state.integrityPercent || 0),
      duplicateProtection: state.duplicateProtection || 'Pending',
      decisionId: state.decisionId || '',
      offerQueueId: state.offerQueueId || '',
      reviewId: state.reviewId || '',
      offerId: state.offerId || '',
      executionId: state.executionId || '',
      errors: state.errors || []
    };
  }

  function insertRunStart_(state) {
    REOS.Database.insert(RUNS, {
      'Run ID': state.runId,
      Status: 'In Progress',
      'Lead ID': state.leadId,
      Address: state.address,
      Passed: 0,
      Failed: 0,
      'Integrity Percent': 0,
      'Duplicate Protection': 'Pending',
      'Started At': new Date(state.startedAt),
      'Completed At': '',
      'Duration Ms': 0,
      'Summary JSON': JSON.stringify({ stageIndex: 0, stageCount: state.stageCount }),
      'Executed By': state.executedBy
    }, { idField: 'Run ID', idPrefix: 'LPVRUN', preserveProvidedId: true });
  }

  function updateRunProgress_(state) {
    var passed = state.checks.filter(function (x) { return x.status === 'Pass'; }).length;
    var failed = state.checks.filter(function (x) { return x.status === 'Fail'; }).length;
    REOS.Database.update(RUNS, 'Run ID', state.runId, {
      Status: 'In Progress',
      Passed: passed,
      Failed: failed,
      'Integrity Percent': state.checks.length ? Math.round((passed / state.checks.length) * 100) : 0,
      'Summary JSON': JSON.stringify({
        stageIndex: state.stageIndex,
        stageCount: state.stageCount,
        decisionId: state.decisionId,
        offerQueueId: state.offerQueueId,
        reviewId: state.reviewId,
        offerId: state.offerId,
        executionId: state.executionId,
        errors: state.errors
      })
    });
  }

  function invokeStage_(runId, stageId, stage, module, method, args) {
    var started = new Date();
    if (!module || typeof module[method] !== 'function') throw new Error(stage + ' module method unavailable: ' + method);
    var value = module[method].apply(module, args || []);
    audit_(runId, stageId, 'INVOKED_' + method.toUpperCase(), '', '', {
      stage: stage,
      result: safeJson_(value),
      durationMs: new Date().getTime() - started.getTime()
    });
    return value;
  }

  function verifyStage_(runId, stageId, stage, source, destination, parentId, finder) {
    var started = new Date();
    try {
      var rows = finder() || [];
      var row = rows[0] || null;
      return writeResult_(runId, stageId, stage, source, destination, parentId, row ? getId_(row) : '', parentId,
        row ? 'Pass' : 'Fail', new Date().getTime() - started.getTime(), row ? 'Record located' : 'No related record located');
    } catch (error) {
      return writeResult_(runId, stageId, stage, source, destination, parentId, '', parentId,
        'Fail', new Date().getTime() - started.getTime(), error.message || String(error));
    }
  }

  function verifyNaturalKeyDuplicates_(runId, stageId, state) {
    var checks = [
      { sheet: 'DISTRESS_LEADS', field: 'Distress Lead ID', value: state.leadId },
      { sheet: 'IA_LEADS', field: 'Lead ID', value: state.leadId },
      { sheet: 'AI_ACQUISITION_DECISIONS', field: 'Decision ID', value: state.decisionId },
      { sheet: 'AI_OFFER_QUEUE', field: 'Decision ID', value: state.decisionId },
      { sheet: 'AI_OFFER_REVIEW', field: 'Offer Queue ID', value: state.offerQueueId },
      { sheet: 'OFFERS', field: 'Offer ID', value: state.offerId },
      { sheet: 'OFFER_EXECUTION_QUEUE', field: 'Offer ID', value: state.offerId }
    ];
    var duplicates = [];
    checks.forEach(function (item) {
      if (!item.value) return;
      var count = findByField_(item.sheet, item.field, item.value).length;
      if (count > 1) duplicates.push(item.sheet + ':' + item.field + '=' + item.value + ' count=' + count);
    });
    return writeResult_(runId, stageId, 'Duplicate protection', '', '', state.leadId, '', state.leadId,
      duplicates.length ? 'Fail' : 'Pass', 0,
      duplicates.length ? duplicates.join('; ') : 'No natural-key duplicates detected for controlled records');
  }

  function findTestRows_(sheetName) {
    return safeAll_(sheetName).filter(function (row) {
      return String(row.Source || '') === MARKER || normalize_(row.Address) === normalize_(ADDRESS);
    });
  }

  function findRelatedRows_(sheetName, leadId) {
    var keys = ['Distress Lead ID','Lead ID','IA Lead ID','Parent Lead ID','Source Lead ID','Property ID','Record ID'];
    return safeAll_(sheetName).filter(function (row) {
      if (normalize_(row.Address) === normalize_(ADDRESS) || String(row.Source || '') === MARKER) return true;
      return keys.some(function (key) { return leadId && String(row[key] || '') === String(leadId); });
    });
  }

  function findByField_(sheetName, field, value) {
    return safeAll_(sheetName).filter(function (row) { return String(row[field] || '') === String(value || ''); });
  }

  function findOne_(sheetName, field, value) {
    return findByField_(sheetName, field, value)[0] || null;
  }

  function safeAll_(sheetName) {
    try { return REOS.Database.getAll(sheetName) || []; }
    catch (error) { return []; }
  }

  function writeResult_(runId, stageId, stage, source, destination, inputId, outputId, parentId, statusValue, duration, message) {
    var row = {
      stageId: Number(stageId || 0),
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
      'Stage ID': Number(stageId || 0),
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

  function audit_(runId, stageId, event, sheet, recordId, details) {
    REOS.Database.insert(AUDIT, {
      'Run ID': runId,
      'Stage ID': Number(stageId || 0),
      Event: event,
      Sheet: sheet || '',
      'Record ID': recordId || '',
      'Details JSON': JSON.stringify(details || {}),
      'Created At': new Date()
    }, { idField: 'Audit ID', idPrefix: 'LPVAUD' });
  }

  function migrateStageIdColumns_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    migrateSheetStageId_(ss, AUDIT, 'Event', function (record) {
      try { return Number((JSON.parse(record['Details JSON'] || '{}')).stageId || 0); }
      catch (error) { return 0; }
    });
    migrateSheetStageId_(ss, RESULTS, 'Stage', function (record) {
      var map = {
        'Distress lead': 1,
        'Intelligent acquisition lead': 2,
        'Acquisition intelligence completed': 3,
        'Acquisition decision eligibility': 3,
        'Deal intelligence record': 4,
        'Offer queue record': 5,
        'Offer review record': 6,
        'Offer record': 7,
        'Execution queue record': 7,
        'Duplicate protection': 8
      };
      return Number(map[record.Stage] || 0);
    });
  }

  function migrateSheetStageId_(ss, sheetName, insertBeforeHeader, resolver) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) return;
    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    if (headers.indexOf('Stage ID') !== -1) return;
    var insertIndex = headers.indexOf(insertBeforeHeader);
    if (insertIndex === -1) throw new Error(insertBeforeHeader + ' header not found in ' + sheetName);
    var columnNumber = insertIndex + 1;
    sheet.insertColumnBefore(columnNumber);
    sheet.getRange(1, columnNumber).setValue('Stage ID');
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var stageValues = rows.map(function (values) {
      var record = {};
      updatedHeaders.forEach(function (header, index) { record[header] = values[index]; });
      return [Number(resolver(record) || 0)];
    });
    sheet.getRange(2, columnNumber, stageValues.length, 1).setValues(stageValues);
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(RUNS) || [];
    return { ok: true, latest: rows.length ? rows[rows.length - 1] : null, runs: rows.length, stagedStatus: status() };
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

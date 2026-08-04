/*
 * REOS Enterprise v3.5.2
 * Batch-safe, resumable Distress Intelligence processing.
 *
 * Uses an allowlist, Script Properties cursor state, LockService, a hidden
 * staging sheet, bulk copy-back, and short continuation triggers.
 */

var REOS = REOS || {};

REOS.DistressIntelligenceBatchProcessor = (function () {
  var VERSION = '3.5.2';
  var STATE_KEY = 'REOS_DISTRESS_BATCH_STATE_V1';
  var STAGE_SHEET = '_REOS_DISTRESS_BATCH_STAGE';
  var CONTINUATION_HANDLER = 'reosDistressIntelligenceResumeBatch';
  var DEFAULT_BATCH_SIZE = 25;
  var MAX_BATCH_SIZE = 100;
  var DEFAULT_SOURCES = ['DEALS', 'ZILLOW_GMAIL_LEADS', 'PHILA_ASSESSMENTS'];
  var TARGET_COLUMNS = [
    'Distress Score','Distress Tier','Distress Signals','Estimated Repairs',
    'Repair $/Sq Ft','Repair Confidence','ARV','Holding Costs','Closing Costs',
    'Desired Profit','Suggested Offer','Opportunity Score','AI Decision','AI Reasoning',
    'Intelligence Updated At'
  ];

  function start(options) {
    options = options || {};
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('A distress intelligence batch operation is already running.');
    try {
      var existing = loadState_();
      if (existing && existing.status === 'Running' && options.force !== true) {
        return status();
      }

      cleanupContinuationTriggers_();
      cleanupStage_();
      REOS.AcquisitionDistressIntelligence.ensureSheets();

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var requested = Array.isArray(options.sourceSheets) && options.sourceSheets.length
        ? options.sourceSheets
        : DEFAULT_SOURCES;
      var sourceSheets = requested.filter(function (name) {
        return Boolean(ss.getSheetByName(name));
      });
      if (!sourceSheets.length) throw new Error('No approved distress source sheets were found.');

      var batchSize = clampBatchSize_(options.batchSize);
      var state = {
        version: VERSION,
        runId: makeId_('DBATCH'),
        status: 'Running',
        sourceSheets: sourceSheets,
        sheetIndex: 0,
        nextRow: 2,
        batchSize: batchSize,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: '',
        totalRows: countRows_(ss, sourceSheets),
        processedRows: 0,
        batchesCompleted: 0,
        stats: emptyStats_(),
        lastBatch: null,
        errors: []
      };
      saveState_(state);
      return processNext_(state, options.scheduleContinuation !== false);
    } finally {
      lock.releaseLock();
    }
  }

  function resume() {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return { ok: false, status: 'Locked', message: 'Another batch is already running.' };
    try {
      cleanupContinuationTriggers_();
      var state = loadState_();
      if (!state) return { ok: false, status: 'Not Started', message: 'No distress batch state exists.' };
      if (state.status !== 'Running') return publicState_(state);
      return processNext_(state, true);
    } finally {
      lock.releaseLock();
    }
  }

  function processNext_(state, scheduleContinuation) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var started = new Date();

    while (state.sheetIndex < state.sourceSheets.length) {
      var sheetName = state.sourceSheets[state.sheetIndex];
      var source = ss.getSheetByName(sheetName);
      if (!source) {
        state.errors.push(sheetName + ': sheet no longer exists.');
        advanceSheet_(state);
        continue;
      }

      ensureColumns_(source, TARGET_COLUMNS);
      var lastRow = source.getLastRow();
      if (lastRow < 2 || state.nextRow > lastRow) {
        advanceSheet_(state);
        continue;
      }

      var rowCount = Math.min(state.batchSize, lastRow - state.nextRow + 1);
      var batchResult = processRange_(source, state.nextRow, rowCount, state.runId);
      state.processedRows += batchResult.processedRows;
      state.batchesCompleted++;
      addStats_(state.stats, batchResult.engineStats);
      state.lastBatch = {
        sheet: sheetName,
        startRow: state.nextRow,
        endRow: state.nextRow + rowCount - 1,
        processedRows: batchResult.processedRows,
        durationMs: new Date().getTime() - started.getTime(),
        completedAt: new Date().toISOString()
      };
      state.nextRow += rowCount;
      state.updatedAt = new Date().toISOString();
      saveState_(state);

      if (state.nextRow > source.getLastRow()) advanceSheet_(state);
      if (state.sheetIndex >= state.sourceSheets.length) return complete_(state);

      if (scheduleContinuation) scheduleContinuation_();
      return publicState_(state);
    }

    return complete_(state);
  }

  function processRange_(source, startRow, rowCount, runId) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    cleanupStage_();

    var sourceHeaders = readHeaders_(source);
    var sourceValues = source.getRange(startRow, 1, rowCount, sourceHeaders.length).getValues();
    var stage = ss.insertSheet(STAGE_SHEET);
    stage.getRange(1, 1, 1, sourceHeaders.length).setValues([sourceHeaders]);
    stage.getRange(2, 1, sourceValues.length, sourceHeaders.length).setValues(sourceValues);
    stage.hideSheet();

    var engineResult;
    try {
      engineResult = REOS.AcquisitionDistressIntelligence.run({
        sourceSheets: [STAGE_SHEET],
        source: 'batch-processor',
        parentRunId: runId
      });
      copyTargetsBack_(stage, source, startRow, rowCount);
    } finally {
      cleanupStage_();
    }

    return {
      processedRows: rowCount,
      engineStats: engineResult && engineResult.stats ? engineResult.stats : emptyStats_()
    };
  }

  function copyTargetsBack_(stage, source, sourceStartRow, rowCount) {
    var stageHeaders = readHeaders_(stage);
    var sourceHeaders = readHeaders_(source);
    var stageMap = headerMap_(stageHeaders);
    var sourceMap = headerMap_(sourceHeaders);

    TARGET_COLUMNS.forEach(function (column) {
      var key = normalize_(column);
      if (stageMap[key] === undefined || sourceMap[key] === undefined) return;
      var values = stage.getRange(2, stageMap[key] + 1, rowCount, 1).getValues();
      source.getRange(sourceStartRow, sourceMap[key] + 1, rowCount, 1).setValues(values);
    });
  }

  function complete_(state) {
    cleanupContinuationTriggers_();
    cleanupStage_();
    state.status = state.errors.length ? 'Completed With Errors' : 'Completed';
    state.completedAt = new Date().toISOString();
    state.updatedAt = state.completedAt;
    saveState_(state);
    return publicState_(state);
  }

  function cancel() {
    var lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      var state = loadState_() || {
        version: VERSION,
        runId: '',
        sourceSheets: [],
        totalRows: 0,
        processedRows: 0,
        batchesCompleted: 0,
        stats: emptyStats_(),
        errors: []
      };
      state.status = 'Canceled';
      state.completedAt = new Date().toISOString();
      state.updatedAt = state.completedAt;
      saveState_(state);
      cleanupContinuationTriggers_();
      cleanupStage_();
      return publicState_(state);
    } finally {
      lock.releaseLock();
    }
  }

  function reset() {
    cleanupContinuationTriggers_();
    cleanupStage_();
    PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
    return { ok: true, status: 'Reset', version: VERSION };
  }

  function status() {
    var state = loadState_();
    return state ? publicState_(state) : {
      ok: true,
      status: 'Not Started',
      version: VERSION,
      sourceSheets: [],
      totalRows: 0,
      processedRows: 0,
      progressPercent: 0
    };
  }

  function installHourlyTrigger() {
    removeHourlyTriggers();
    var trigger = ScriptApp.newTrigger('reosDistressIntelligenceHourlyBatchStart')
      .timeBased()
      .everyHours(1)
      .create();
    return { ok: true, handler: 'reosDistressIntelligenceHourlyBatchStart', triggerId: trigger.getUniqueId() };
  }

  function removeHourlyTriggers() {
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === 'reosDistressIntelligenceHourlyBatchStart') {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });
    return { ok: true, removed: removed };
  }

  function hourlyStart() {
    var state = loadState_();
    if (state && state.status === 'Running') return resume();
    return start({ scheduleContinuation: true });
  }

  function scheduleContinuation_() {
    cleanupContinuationTriggers_();
    ScriptApp.newTrigger(CONTINUATION_HANDLER)
      .timeBased()
      .after(60 * 1000)
      .create();
  }

  function cleanupContinuationTriggers_() {
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === CONTINUATION_HANDLER) ScriptApp.deleteTrigger(trigger);
    });
  }

  function cleanupStage_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(STAGE_SHEET);
    if (sheet) ss.deleteSheet(sheet);
  }

  function advanceSheet_(state) {
    state.sheetIndex++;
    state.nextRow = 2;
    state.updatedAt = new Date().toISOString();
    saveState_(state);
  }

  function ensureColumns_(sheet, columns) {
    var headers = readHeaders_(sheet);
    var normalized = headers.map(normalize_);
    var additions = columns.filter(function (column) {
      return normalized.indexOf(normalize_(column)) === -1;
    });
    if (additions.length) {
      sheet.getRange(1, headers.length + 1, 1, additions.length).setValues([additions]);
    }
  }

  function readHeaders_(sheet) {
    if (!sheet || sheet.getLastColumn() < 1) return [];
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (value) {
      return String(value || '').trim();
    });
  }

  function countRows_(ss, names) {
    return names.reduce(function (total, name) {
      var sheet = ss.getSheetByName(name);
      return total + (sheet ? Math.max(0, sheet.getLastRow() - 1) : 0);
    }, 0);
  }

  function publicState_(state) {
    var total = Number(state.totalRows || 0);
    var processed = Number(state.processedRows || 0);
    return {
      ok: state.status !== 'Completed With Errors',
      version: state.version,
      runId: state.runId,
      status: state.status,
      sourceSheets: state.sourceSheets,
      currentSheet: state.sourceSheets[state.sheetIndex] || '',
      nextRow: state.nextRow,
      batchSize: state.batchSize,
      totalRows: total,
      processedRows: processed,
      progressPercent: total ? Math.min(100, Math.round(processed / total * 10000) / 100) : 100,
      batchesCompleted: state.batchesCompleted,
      stats: state.stats,
      lastBatch: state.lastBatch,
      errors: state.errors,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      completedAt: state.completedAt
    };
  }

  function loadState_() {
    var raw = PropertiesService.getScriptProperties().getProperty(STATE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (error) { return null; }
  }

  function saveState_(state) {
    PropertiesService.getScriptProperties().setProperty(STATE_KEY, JSON.stringify(state));
  }

  function clampBatchSize_(value) {
    var parsed = Number(value || DEFAULT_BATCH_SIZE);
    if (!isFinite(parsed)) parsed = DEFAULT_BATCH_SIZE;
    return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(parsed)));
  }

  function emptyStats_() {
    return {
      propertiesScanned: 0,
      propertiesUpdated: 0,
      signalsMatched: 0,
      decisionsCreated: 0,
      offersQueued: 0
    };
  }

  function addStats_(target, source) {
    Object.keys(target).forEach(function (key) {
      target[key] = Number(target[key] || 0) + Number(source[key] || 0);
    });
  }

  function headerMap_(headers) {
    var map = {};
    headers.forEach(function (header, index) { map[normalize_(header)] = index; });
    return map;
  }

  function normalize_(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function makeId_(prefix) {
    return prefix + '-' + Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || 'America/New_York',
      'yyyyMMddHHmmss'
    ) + '-' + Math.floor(Math.random() * 10000);
  }

  return {
    start: start,
    resume: resume,
    status: status,
    cancel: cancel,
    reset: reset,
    installHourlyTrigger: installHourlyTrigger,
    removeHourlyTriggers: removeHourlyTriggers,
    hourlyStart: hourlyStart
  };
})();

function reosDistressIntelligenceStartBatch() {
  return REOS.DistressIntelligenceBatchProcessor.start({});
}

function reosDistressIntelligenceStartDealsBatch() {
  return REOS.DistressIntelligenceBatchProcessor.start({ sourceSheets: ['DEALS'] });
}

function reosDistressIntelligenceResumeBatch() {
  return REOS.DistressIntelligenceBatchProcessor.resume();
}

function reosDistressIntelligenceBatchStatus() {
  return REOS.DistressIntelligenceBatchProcessor.status();
}

function reosDistressIntelligenceCancelBatch() {
  return REOS.DistressIntelligenceBatchProcessor.cancel();
}

function reosDistressIntelligenceResetBatch() {
  return REOS.DistressIntelligenceBatchProcessor.reset();
}

function reosDistressIntelligenceInstallBatchTrigger() {
  return REOS.DistressIntelligenceBatchProcessor.installHourlyTrigger();
}

function reosDistressIntelligenceRemoveBatchTrigger() {
  return REOS.DistressIntelligenceBatchProcessor.removeHourlyTriggers();
}

function reosDistressIntelligenceHourlyBatchStart() {
  return REOS.DistressIntelligenceBatchProcessor.hourlyStart();
}

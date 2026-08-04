/*
 * REOS Enterprise v3.6.0
 * Philadelphia Real Estate Tax Delinquency Connector
 *
 * Live source:
 * https://services2.arcgis.com/CyVvlIiUfRBmMQuu/arcgis/rest/services/Delinquent_Real_Estate_Taxes_view/FeatureServer/0
 *
 * The connector performs a resumable full snapshot sync, stages ArcGIS pages,
 * bulk-replaces PHILA_TAX_DELINQUENT, rebuilds only TAX_DELINQUENT signals,
 * and then starts the batch-safe distress intelligence processor.
 */

var REOS = REOS || {};

REOS.PhiladelphiaTaxDelinquentConnector = (function () {
  var VERSION = '3.6.0';
  var SERVICE_URL = 'https://services2.arcgis.com/CyVvlIiUfRBmMQuu/arcgis/rest/services/Delinquent_Real_Estate_Taxes_view/FeatureServer/0';
  var QUERY_URL = SERVICE_URL + '/query';
  var TARGET_SHEET = 'PHILA_TAX_DELINQUENT';
  var SIGNAL_SHEET = 'PHILADELPHIA_DISTRESS_SIGNALS';
  var STAGE_SHEET = '_REOS_PHILA_TAX_DELINQUENT_STAGE';
  var LOG_SHEET = 'PHILA_CONNECTOR_RUNS';
  var STATE_KEY = 'REOS_PHILA_TAX_DELINQUENT_SYNC_V1';
  var CONTINUE_HANDLER = 'reosPhilaTaxDelinquentContinueSync';
  var POST_SYNC_HANDLER = 'reosPhilaTaxDelinquentPostSync';
  var MONTHLY_HANDLER = 'reosPhilaTaxDelinquentMonthlySync';
  var PAGE_SIZE = 1000;
  var MAX_PAGES_PER_EXECUTION = 3;

  var STAGE_HEADERS = [
    'Property Key','OPA Account','Address','Owner Name','Mailing Address','City State Zip',
    'Tax Year','Bill Number','Tax Due','Penalty Due','Interest Due','Fee Due','Total Due',
    'Property Description','District','Source Object ID','Record ID','Record Date','Details','Imported At'
  ];

  var SIGNAL_HEADERS = [
    'Signal ID','Property Key','OPA Account','Address','Signal Type','Signal Weight',
    'Signal Date','Source Dataset','Source Record ID','Details','Imported At','Updated At'
  ];

  var RUN_HEADERS = [
    'Run ID','Started At','Completed At','Status','Expected Records','Fetched Records',
    'Pages Completed','Last Offset','Errors','Version'
  ];

  function ensureSheets() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheet_(ss, TARGET_SHEET, STAGE_HEADERS);
    ensureSheet_(ss, SIGNAL_SHEET, SIGNAL_HEADERS);
    ensureSheet_(ss, LOG_SHEET, RUN_HEADERS);
    var stage = ensureSheet_(ss, STAGE_SHEET, STAGE_HEADERS);
    try { stage.hideSheet(); } catch (ignored) {}
    return { ok: true, version: VERSION, serviceUrl: SERVICE_URL };
  }

  function start(options) {
    options = options || {};
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('A Philadelphia tax delinquency sync is already running.');
    try {
      ensureSheets();
      removeContinuationTriggers_();
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var stage = ss.getSheetByName(STAGE_SHEET);
      stage.clearContents();
      stage.getRange(1, 1, 1, STAGE_HEADERS.length).setValues([STAGE_HEADERS]);
      var total = fetchCount_();
      var state = {
        runId: id_('PHLTAX'),
        status: 'Running',
        startedAt: new Date().toISOString(),
        completedAt: '',
        expectedRecords: total,
        fetchedRecords: 0,
        offset: 0,
        pagesCompleted: 0,
        errors: [],
        rescoreAfterSync: options.rescoreAfterSync !== false
      };
      saveState_(state);
      writeRun_(state);
      return continueSync();
    } finally {
      lock.releaseLock();
    }
  }

  function continueSync() {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return { ok: false, status: 'Busy', message: 'Another sync execution holds the lock.' };
    try {
      ensureSheets();
      var state = loadState_();
      if (!state) throw new Error('No active Philadelphia tax delinquency sync. Run reosPhilaTaxDelinquentStartSync first.');
      if (state.status === 'Completed') return status();
      if (state.status === 'Canceled') return status();

      var pagesThisExecution = 0;
      while (state.offset < state.expectedRecords && pagesThisExecution < MAX_PAGES_PER_EXECUTION) {
        var page = fetchPage_(state.offset, PAGE_SIZE);
        appendStageRows_(page.rows);
        state.offset += page.rows.length;
        state.fetchedRecords += page.rows.length;
        state.pagesCompleted++;
        pagesThisExecution++;
        if (!page.rows.length || page.rows.length < PAGE_SIZE) break;
      }

      if (state.offset >= state.expectedRecords || pagesThisExecution === 0) {
        finalizeSnapshot_(state);
        state.status = 'Completed';
        state.completedAt = new Date().toISOString();
        saveState_(state);
        writeRun_(state);
        removeContinuationTriggers_();
        if (state.rescoreAfterSync) schedulePostSync_();
      } else {
        saveState_(state);
        writeRun_(state);
        scheduleContinuation_();
      }
      return status();
    } catch (error) {
      var failed = loadState_() || { runId: id_('PHLTAX'), startedAt: new Date().toISOString(), errors: [] };
      failed.status = 'Failed';
      failed.completedAt = new Date().toISOString();
      failed.errors = failed.errors || [];
      failed.errors.push(error.message);
      saveState_(failed);
      writeRun_(failed);
      throw error;
    } finally {
      lock.releaseLock();
    }
  }

  function status() {
    var state = loadState_();
    if (!state) return { ok: true, status: 'Not Started', version: VERSION };
    var expected = Number(state.expectedRecords || 0);
    var fetched = Number(state.fetchedRecords || 0);
    return {
      ok: state.status !== 'Failed',
      runId: state.runId,
      status: state.status,
      expectedRecords: expected,
      fetchedRecords: fetched,
      progressPercent: expected ? Math.min(100, Math.round(fetched / expected * 10000) / 100) : 100,
      offset: state.offset,
      pagesCompleted: state.pagesCompleted,
      startedAt: state.startedAt,
      completedAt: state.completedAt || '',
      errors: state.errors || [],
      serviceUrl: SERVICE_URL,
      version: VERSION
    };
  }

  function cancel() {
    var state = loadState_();
    if (!state) return { ok: true, status: 'Not Started' };
    state.status = 'Canceled';
    state.completedAt = new Date().toISOString();
    saveState_(state);
    writeRun_(state);
    removeContinuationTriggers_();
    return status();
  }

  function reset() {
    removeContinuationTriggers_();
    PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
    var stage = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAGE_SHEET);
    if (stage) {
      stage.clearContents();
      stage.getRange(1, 1, 1, STAGE_HEADERS.length).setValues([STAGE_HEADERS]);
    }
    return { ok: true, status: 'Reset' };
  }

  function postSync() {
    removeTriggersByHandler_(POST_SYNC_HANDLER);
    if (typeof reosDistressIntelligenceResetBatch === 'function') reosDistressIntelligenceResetBatch();
    if (typeof reosDistressIntelligenceStartBatch === 'function') {
      return reosDistressIntelligenceStartBatch();
    }
    return { ok: true, message: 'Tax snapshot synced. Batch distress processor is not deployed.' };
  }

  function installMonthlyTrigger() {
    removeTriggersByHandler_(MONTHLY_HANDLER);
    var trigger = ScriptApp.newTrigger(MONTHLY_HANDLER)
      .timeBased()
      .onMonthDay(2)
      .atHour(3)
      .create();
    return { ok: true, handler: MONTHLY_HANDLER, triggerId: trigger.getUniqueId(), cadence: 'MONTHLY_DAY_2_3AM' };
  }

  function removeMonthlyTrigger() {
    return { ok: true, removed: removeTriggersByHandler_(MONTHLY_HANDLER), handler: MONTHLY_HANDLER };
  }

  function monthlySync() {
    var state = loadState_();
    if (state && state.status === 'Running') return continueSync();
    return start({ rescoreAfterSync: true });
  }

  function fetchCount_() {
    var url = QUERY_URL + '?' + queryString_({
      where: "GPIN IS NOT NULL AND Total_Delinquent_Amount_Due > 0",
      returnCountOnly: 'true',
      f: 'json'
    });
    var data = fetchJson_(url);
    if (typeof data.count !== 'number') throw new Error('Philadelphia tax API did not return a record count.');
    return data.count;
  }

  function fetchPage_(offset, limit) {
    var fields = [
      'OBJECTID','Owner_Name','Mailing_Address','City_State_Zip','GPIN','Situs_Address',
      'Property_Description','District','Tax_Year','Bill_Number','Tax_Due','Penalty_Due',
      'Interest_Due','Fee_Due','Total_Delinquent_Amount_Due'
    ].join(',');
    var url = QUERY_URL + '?' + queryString_({
      where: "GPIN IS NOT NULL AND Total_Delinquent_Amount_Due > 0",
      outFields: fields,
      orderByFields: 'OBJECTID ASC',
      resultOffset: String(offset),
      resultRecordCount: String(limit),
      returnGeometry: 'false',
      f: 'json'
    });
    var data = fetchJson_(url);
    if (data.error) throw new Error('Philadelphia tax API error: ' + JSON.stringify(data.error));
    var features = Array.isArray(data.features) ? data.features : [];
    return { rows: features.map(normalizeFeature_) };
  }

  function normalizeFeature_(feature) {
    var a = feature.attributes || {};
    var propertyKey = normalizeKey_(a.GPIN);
    var recordId = [a.GPIN, a.Tax_Year, a.Bill_Number, a.OBJECTID].join('-');
    var totalDue = number_(a.Total_Delinquent_Amount_Due);
    var details = [
      'Tax year ' + String(a.Tax_Year || ''),
      'total due $' + totalDue,
      'tax $' + number_(a.Tax_Due),
      'penalty $' + number_(a.Penalty_Due),
      'interest $' + number_(a.Interest_Due),
      'fees $' + number_(a.Fee_Due)
    ].join('; ');
    return [
      propertyKey,
      String(a.GPIN || ''),
      String(a.Situs_Address || ''),
      String(a.Owner_Name || ''),
      String(a.Mailing_Address || ''),
      String(a.City_State_Zip || ''),
      String(a.Tax_Year || ''),
      String(a.Bill_Number || ''),
      number_(a.Tax_Due),
      number_(a.Penalty_Due),
      number_(a.Interest_Due),
      number_(a.Fee_Due),
      totalDue,
      String(a.Property_Description || ''),
      String(a.District || ''),
      Number(a.OBJECTID || 0),
      recordId,
      String(a.Tax_Year || ''),
      details,
      new Date()
    ];
  }

  function appendStageRows_(rows) {
    if (!rows.length) return;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAGE_SHEET);
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, STAGE_HEADERS.length).setValues(rows);
  }

  function finalizeSnapshot_(state) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stage = ss.getSheetByName(STAGE_SHEET);
    var target = ss.getSheetByName(TARGET_SHEET);
    var lastRow = stage.getLastRow();
    var rows = lastRow > 1 ? stage.getRange(2, 1, lastRow - 1, STAGE_HEADERS.length).getValues() : [];

    target.clearContents();
    target.getRange(1, 1, 1, STAGE_HEADERS.length).setValues([STAGE_HEADERS]);
    if (rows.length) target.getRange(2, 1, rows.length, STAGE_HEADERS.length).setValues(rows);
    target.setFrozenRows(1);

    rebuildTaxSignals_(rows);
    SpreadsheetApp.flush();
    state.fetchedRecords = rows.length;
    state.offset = rows.length;
  }

  function rebuildTaxSignals_(taxRows) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var signalSheet = ss.getSheetByName(SIGNAL_SHEET);
    var existing = readSheet_(signalSheet);
    var retained = existing.rows.filter(function (row) {
      return String(row[existing.map.signaltype] || '') !== 'TAX_DELINQUENT';
    });
    var now = new Date();
    var generated = taxRows.map(function (row) {
      var propertyKey = row[0];
      var opa = row[1];
      var address = row[2];
      var recordId = row[16];
      var recordDate = row[17];
      var details = row[18];
      return [
        'TAX_DELINQUENT-' + recordId,
        propertyKey,
        opa,
        address,
        'TAX_DELINQUENT',
        40,
        recordDate,
        TARGET_SHEET,
        recordId,
        details,
        now,
        now
      ];
    });
    var all = retained.concat(generated);
    signalSheet.clearContents();
    signalSheet.getRange(1, 1, 1, SIGNAL_HEADERS.length).setValues([SIGNAL_HEADERS]);
    if (all.length) signalSheet.getRange(2, 1, all.length, SIGNAL_HEADERS.length).setValues(all);
    signalSheet.setFrozenRows(1);
  }

  function fetchJson_(url) {
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'Accept': 'application/json', 'User-Agent': 'REOS-Enterprise/' + VERSION }
    });
    var code = response.getResponseCode();
    if (code < 200 || code >= 300) throw new Error('Philadelphia tax API HTTP ' + code + ': ' + response.getContentText().slice(0, 500));
    return JSON.parse(response.getContentText());
  }

  function scheduleContinuation_() {
    removeTriggersByHandler_(CONTINUE_HANDLER);
    ScriptApp.newTrigger(CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
  }

  function schedulePostSync_() {
    removeTriggersByHandler_(POST_SYNC_HANDLER);
    ScriptApp.newTrigger(POST_SYNC_HANDLER).timeBased().after(60 * 1000).create();
  }

  function removeContinuationTriggers_() {
    removeTriggersByHandler_(CONTINUE_HANDLER);
    removeTriggersByHandler_(POST_SYNC_HANDLER);
  }

  function removeTriggersByHandler_(handler) {
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === handler) {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });
    return removed;
  }

  function ensureSheet_(ss, name, headers) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastColumn() < headers.length || sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    sheet.setFrozenRows(1);
    return sheet;
  }

  function readSheet_(sheet) {
    if (!sheet || sheet.getLastRow() < 1) return { headers: SIGNAL_HEADERS, rows: [], map: headerMap_(SIGNAL_HEADERS) };
    var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    var headers = values.shift().map(function (v) { return String(v || ''); });
    return { headers: headers, rows: values, map: headerMap_(headers) };
  }

  function headerMap_(headers) {
    var map = {};
    headers.forEach(function (header, index) { map[normalize_(header)] = index; });
    return map;
  }

  function queryString_(params) {
    return Object.keys(params).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    }).join('&');
  }

  function loadState_() {
    var raw = PropertiesService.getScriptProperties().getProperty(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function saveState_(state) {
    PropertiesService.getScriptProperties().setProperty(STATE_KEY, JSON.stringify(state));
  }

  function writeRun_(state) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET);
    var data = readSheet_(sheet);
    var existingRow = 0;
    data.rows.some(function (row, index) {
      if (String(row[0] || '') === String(state.runId || '')) {
        existingRow = index + 2;
        return true;
      }
      return false;
    });
    var values = [[
      state.runId || '',
      state.startedAt ? new Date(state.startedAt) : '',
      state.completedAt ? new Date(state.completedAt) : '',
      state.status || '',
      Number(state.expectedRecords || 0),
      Number(state.fetchedRecords || 0),
      Number(state.pagesCompleted || 0),
      Number(state.offset || 0),
      (state.errors || []).join('\n'),
      VERSION
    ]];
    if (existingRow) sheet.getRange(existingRow, 1, 1, RUN_HEADERS.length).setValues(values);
    else sheet.getRange(sheet.getLastRow() + 1, 1, 1, RUN_HEADERS.length).setValues(values);
  }

  function id_(prefix) {
    return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 10000);
  }

  function normalize_(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function normalizeKey_(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function number_(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    var parsed = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
    return isFinite(parsed) ? parsed : 0;
  }

  return {
    ensureSheets: ensureSheets,
    start: start,
    continueSync: continueSync,
    status: status,
    cancel: cancel,
    reset: reset,
    postSync: postSync,
    installMonthlyTrigger: installMonthlyTrigger,
    removeMonthlyTrigger: removeMonthlyTrigger,
    monthlySync: monthlySync
  };
})();

function reosPhilaTaxDelinquentEnsureSheets() {
  return REOS.PhiladelphiaTaxDelinquentConnector.ensureSheets();
}

function reosPhilaTaxDelinquentStartSync() {
  return REOS.PhiladelphiaTaxDelinquentConnector.start({ rescoreAfterSync: true });
}

function reosPhilaTaxDelinquentContinueSync() {
  return REOS.PhiladelphiaTaxDelinquentConnector.continueSync();
}

function reosPhilaTaxDelinquentSyncStatus() {
  return REOS.PhiladelphiaTaxDelinquentConnector.status();
}

function reosPhilaTaxDelinquentCancelSync() {
  return REOS.PhiladelphiaTaxDelinquentConnector.cancel();
}

function reosPhilaTaxDelinquentResetSync() {
  return REOS.PhiladelphiaTaxDelinquentConnector.reset();
}

function reosPhilaTaxDelinquentPostSync() {
  return REOS.PhiladelphiaTaxDelinquentConnector.postSync();
}

function reosPhilaTaxDelinquentInstallMonthlyTrigger() {
  return REOS.PhiladelphiaTaxDelinquentConnector.installMonthlyTrigger();
}

function reosPhilaTaxDelinquentRemoveMonthlyTrigger() {
  return REOS.PhiladelphiaTaxDelinquentConnector.removeMonthlyTrigger();
}

function reosPhilaTaxDelinquentMonthlySync() {
  return REOS.PhiladelphiaTaxDelinquentConnector.monthlySync();
}

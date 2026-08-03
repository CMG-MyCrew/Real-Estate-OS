/**
 * REOS Enterprise v4.4.9
 * Sprint 7.3 Increment 3.3.4 - Offer Record Correlation
 */
var REOS = REOS || {};

REOS.OfferRecordCorrelation = (function () {
  var SHEET = 'OFFER_RECORD_CORRELATION';
  var STATE_KEY = 'REOS_LIVE_PIPELINE_STATE_V2';
  var HEADERS = [
    'Correlation ID','Run ID','Lead ID','Stage ID','Relationship','Source Sheet','Destination Sheet',
    'Correlation Field','Correlation Value','Source Count','Destination Count','Source IDs','Destination IDs',
    'Status','Reason Code','Message','Details JSON','Checked At','Checked By'
  ];

  function ensureSheet() {
    if (!REOS.Database) throw new Error('Database.gs is required.');
    REOS.Database.ensureTable(SHEET, HEADERS);
    return { ok: true, sheet: SHEET };
  }

  function run(options) {
    ensureSheet();
    options = options || {};
    var state = readState_();
    var context = {
      runId: String(options.runId || state.runId || ('ORC-' + Utilities.getUuid().slice(0, 8))),
      leadId: String(options.leadId || state.leadId || ''),
      decisionId: String(options.decisionId || state.decisionId || ''),
      offerQueueId: String(options.offerQueueId || state.offerQueueId || ''),
      reviewId: String(options.reviewId || state.reviewId || ''),
      offerId: String(options.offerId || state.offerId || ''),
      executionId: String(options.executionId || state.executionId || '')
    };

    var results = [
      correlate_(context, {
        stageId: 5,
        relationship: 'Decision to offer queue',
        sourceSheet: 'AI_ACQUISITION_DECISIONS',
        destinationSheet: 'AI_OFFER_QUEUE',
        sourceField: 'Decision ID',
        destinationField: 'Decision ID',
        value: context.decisionId,
        sourceIdField: 'Decision ID',
        destinationIdField: 'Offer Queue ID'
      }),
      correlate_(context, {
        stageId: 6,
        relationship: 'Offer queue to offer review',
        sourceSheet: 'AI_OFFER_QUEUE',
        destinationSheet: 'AI_OFFER_REVIEW',
        sourceField: 'Offer Queue ID',
        destinationField: 'Offer Queue ID',
        value: context.offerQueueId,
        sourceIdField: 'Offer Queue ID',
        destinationIdField: 'Review ID'
      }),
      correlate_(context, {
        stageId: 8,
        relationship: 'Offer review to offer record',
        sourceSheet: 'AI_OFFER_REVIEW',
        destinationSheet: 'OFFERS',
        sourceField: 'Review ID',
        destinationField: 'Offer ID',
        value: context.reviewId,
        destinationValue: context.offerId,
        sourceIdField: 'Review ID',
        destinationIdField: 'Offer ID',
        fallbackDestinationField: 'Lead ID',
        fallbackDestinationValue: context.leadId
      }),
      correlate_(context, {
        stageId: 9,
        relationship: 'Offer record to execution queue',
        sourceSheet: 'OFFERS',
        destinationSheet: 'OFFER_EXECUTION_QUEUE',
        sourceField: 'Offer ID',
        destinationField: 'Offer ID',
        value: context.offerId,
        sourceIdField: 'Offer ID',
        destinationIdField: 'Execution ID'
      })
    ];

    return {
      ok: results.every(function (r) { return r.status === 'Pass'; }),
      runId: context.runId,
      leadId: context.leadId,
      state: context,
      results: results,
      sheet: SHEET
    };
  }

  function correlate_(context, cfg) {
    var correlationValue = String(cfg.value || '');
    var destinationValue = String(cfg.destinationValue || correlationValue || '');
    var sourceRows = correlationValue ? findByField_(cfg.sourceSheet, cfg.sourceField, correlationValue) : [];
    var destinationRows = destinationValue ? findByField_(cfg.destinationSheet, cfg.destinationField, destinationValue) : [];

    if (!destinationRows.length && cfg.fallbackDestinationField && cfg.fallbackDestinationValue) {
      destinationRows = findByField_(cfg.destinationSheet, cfg.fallbackDestinationField, cfg.fallbackDestinationValue);
    }

    var reason = '';
    var status = 'Pass';
    if (!correlationValue) {
      status = 'Blocked';
      reason = 'STATE_ID_MISSING';
    } else if (!sourceRows.length) {
      status = 'Fail';
      reason = 'SOURCE_NOT_FOUND';
    } else if (!destinationRows.length) {
      status = 'Fail';
      reason = 'DESTINATION_NOT_FOUND';
    } else if (sourceRows.length > 1 || destinationRows.length > 1) {
      status = 'Warning';
      reason = 'MULTIPLE_MATCHES';
    }

    var sourceIds = sourceRows.map(function (row) { return String(row[cfg.sourceIdField] || ''); }).filter(Boolean);
    var destinationIds = destinationRows.map(function (row) { return String(row[cfg.destinationIdField] || ''); }).filter(Boolean);
    var message = cfg.relationship + ': field=' + cfg.destinationField + '; value=' + destinationValue +
      '; source=' + sourceRows.length + '; destination=' + destinationRows.length;
    if (reason) message += '; reason=' + reason;

    REOS.Database.insert(SHEET, {
      'Run ID': context.runId,
      'Lead ID': context.leadId,
      'Stage ID': cfg.stageId,
      Relationship: cfg.relationship,
      'Source Sheet': cfg.sourceSheet,
      'Destination Sheet': cfg.destinationSheet,
      'Correlation Field': cfg.destinationField,
      'Correlation Value': destinationValue,
      'Source Count': sourceRows.length,
      'Destination Count': destinationRows.length,
      'Source IDs': sourceIds.join(', '),
      'Destination IDs': destinationIds.join(', '),
      Status: status,
      'Reason Code': reason,
      Message: message,
      'Details JSON': safeJson_({ context: context, config: cfg, sourceRows: sourceRows, destinationRows: destinationRows }),
      'Checked At': new Date(),
      'Checked By': currentUser_()
    }, { idField: 'Correlation ID', idPrefix: 'ORC' });

    return {
      stageId: cfg.stageId,
      relationship: cfg.relationship,
      status: status,
      reasonCode: reason,
      correlationField: cfg.destinationField,
      correlationValue: destinationValue,
      sourceCount: sourceRows.length,
      destinationCount: destinationRows.length,
      sourceIds: sourceIds,
      destinationIds: destinationIds,
      message: message
    };
  }

  function runByIds(ids) {
    return run(ids || {});
  }

  function summary() {
    ensureSheet();
    var rows = all_(SHEET);
    var latestRunId = rows.length ? String(rows[rows.length - 1]['Run ID'] || '') : '';
    var latest = latestRunId ? rows.filter(function (row) { return String(row['Run ID'] || '') === latestRunId; }) : [];
    return {
      ok: true,
      totalRows: rows.length,
      latestRunId: latestRunId,
      latest: latest,
      pass: count_(latest, 'Status', 'Pass'),
      warning: count_(latest, 'Status', 'Warning'),
      fail: count_(latest, 'Status', 'Fail'),
      blocked: count_(latest, 'Status', 'Blocked')
    };
  }

  function findByField_(sheet, field, value) {
    return all_(sheet).filter(function (row) {
      return String(row[field] || '') === String(value || '');
    });
  }

  function all_(sheet) {
    try { return REOS.Database.getAll(sheet) || []; }
    catch (error) { return []; }
  }

  function count_(rows, field, value) {
    return rows.filter(function (row) { return String(row[field] || '') === value; }).length;
  }

  function readState_() {
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function safeJson_(value) {
    try { return JSON.stringify(value === undefined ? null : value); }
    catch (error) { return JSON.stringify({ error: 'Unable to serialize correlation details.' }); }
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || ''; }
    catch (error) { return ''; }
  }

  return {
    ensureSheet: ensureSheet,
    run: run,
    runByIds: runByIds,
    summary: summary
  };
})();

function reosOfferRecordCorrelationEnsureSheet() {
  return REOS.OfferRecordCorrelation.ensureSheet();
}

function reosOfferRecordCorrelationRun(options) {
  return REOS.OfferRecordCorrelation.run(options);
}

function reosOfferRecordCorrelationRunByIds(ids) {
  return REOS.OfferRecordCorrelation.runByIds(ids);
}

function reosOfferRecordCorrelationSummary() {
  return REOS.OfferRecordCorrelation.summary();
}

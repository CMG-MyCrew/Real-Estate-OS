/**
 * REOS Enterprise v4.4.8
 * Sprint 7.3 Increment 3.3.3 - Offer Module Instrumentation
 */
var REOS = REOS || {};

REOS.OfferModuleInstrumentation = (function () {
  var SHEET = 'OFFER_MODULE_INSTRUMENTATION';
  var STATE_KEY = 'REOS_LIVE_PIPELINE_STATE_V2';
  var HEADERS = [
    'Instrumentation ID','Run ID','Lead ID','Stage ID','Module','Method','Status',
    'Source Sheet','Destination Sheet','Source Count','Eligible Count','Destination Count',
    'Created Count','Skipped Count','Missing Fields','Reason Codes','Message',
    'Result JSON','Checked At','Checked By'
  ];

  function ensureSheet() {
    if (!REOS.Database) throw new Error('Database.gs is required.');
    REOS.Database.ensureTable(SHEET, HEADERS);
    return { ok: true, sheet: SHEET };
  }

  function run(options) {
    ensureSheet();
    options = Object.assign({ invoke: true, maxItems: 25, minimumScore: 70 }, options || {});
    var state = readState_();
    var runId = String(options.runId || state.runId || ('OMI-' + Utilities.getUuid().slice(0, 8)));
    var leadId = String(options.leadId || state.leadId || '');
    var rows = [];
    rows.push(instrumentDrafts_(runId, leadId, options));
    rows.push(instrumentReviews_(runId, leadId, options));
    rows.push(inspectPublishing_(runId, leadId));
    rows.push(instrumentExecution_(runId, leadId, options));
    return {
      ok: rows.every(function (row) { return row.status === 'Pass' || row.status === 'Ready'; }),
      runId: runId,
      leadId: leadId,
      results: rows,
      sheet: SHEET
    };
  }

  function inspect(options) {
    options = Object.assign({}, options || {}, { invoke: false });
    return run(options);
  }

  function instrumentDrafts_(runId, leadId, options) {
    var source = related_('AI_ACQUISITION_DECISIONS', leadId);
    var eligible = source.filter(function (row) {
      return ['Acquire','Review'].indexOf(String(row.Decision || '')) !== -1 &&
        Number(row['Lead Score'] || 0) >= Number(options.minimumScore || 70) &&
        !!row['Decision ID'];
    });
    var reasons = [];
    source.forEach(function (row) {
      if (!row['Decision ID']) reasons.push('MISSING_DECISION_ID');
      if (['Acquire','Review'].indexOf(String(row.Decision || '')) === -1) reasons.push('DECISION_NOT_ALLOWED');
      if (Number(row['Lead Score'] || 0) < Number(options.minimumScore || 70)) reasons.push('SCORE_BELOW_THRESHOLD');
    });
    var result = invokeOptional_(options.invoke, REOS.AcquisitionOfferAutomation, 'generateDrafts', [{
      minimumScore: Number(options.minimumScore || 70),
      allowedDecisions: ['Acquire','Review'],
      maxDrafts: Number(options.maxItems || 25)
    }]);
    var destination = related_('AI_OFFER_QUEUE', leadId);
    return save_(runId, leadId, 5, 'AcquisitionOfferAutomation', 'generateDrafts',
      'AI_ACQUISITION_DECISIONS', 'AI_OFFER_QUEUE', source, eligible, destination, result, reasons);
  }

  function instrumentReviews_(runId, leadId, options) {
    var source = related_('AI_OFFER_QUEUE', leadId);
    var eligible = source.filter(function (row) {
      return !!row['Offer Queue ID'] && String(row['Approval Status'] || '') !== 'Rejected';
    });
    var reasons = [];
    source.forEach(function (row) {
      if (!row['Offer Queue ID']) reasons.push('MISSING_OFFER_QUEUE_ID');
      if (String(row['Approval Status'] || '') === 'Rejected') reasons.push('QUEUE_REJECTED');
    });
    var result = invokeOptional_(options.invoke, REOS.OfferReviewWorkflow, 'generateQueue', [{
      includeDrafts: true,
      maxItems: Number(options.maxItems || 25)
    }]);
    var destination = related_('AI_OFFER_REVIEW', leadId);
    return save_(runId, leadId, 6, 'OfferReviewWorkflow', 'generateQueue',
      'AI_OFFER_QUEUE', 'AI_OFFER_REVIEW', source, eligible, destination, result, reasons);
  }

  function inspectPublishing_(runId, leadId) {
    var source = related_('AI_OFFER_REVIEW', leadId);
    var eligible = source.filter(function (row) {
      return String(row['Review Status'] || '') === 'Approved' && !row['Published Offer ID'];
    });
    var reasons = [];
    source.forEach(function (row) {
      if (String(row['Review Status'] || '') !== 'Approved') reasons.push('REVIEW_NOT_APPROVED');
      if (row['Published Offer ID']) reasons.push('ALREADY_PUBLISHED');
    });
    var destination = related_('OFFERS', leadId);
    return save_(runId, leadId, 8, 'OfferReviewWorkflow', 'publishApproved',
      'AI_OFFER_REVIEW', 'OFFERS', source, eligible, destination,
      { invoked: false, note: 'Inspection only.' }, reasons);
  }

  function instrumentExecution_(runId, leadId, options) {
    var source = related_('OFFERS', leadId);
    var eligible = source.filter(function (row) {
      var status = String(row.Status || 'Draft');
      return !!row['Offer ID'] && (status === 'Draft' || status === 'Ready');
    });
    var reasons = [];
    source.forEach(function (row) {
      if (!row['Offer ID']) reasons.push('MISSING_OFFER_ID');
      var status = String(row.Status || 'Draft');
      if (status !== 'Draft' && status !== 'Ready') reasons.push('OFFER_STATUS_NOT_ELIGIBLE');
    });
    var result = eligible.length ? invokeOptional_(options.invoke, REOS.OfferExecutionWorkflow, 'buildQueue', [{
      maxItems: Number(options.maxItems || 25)
    }]) : { invoked: false };
    var destination = related_('OFFER_EXECUTION_QUEUE', leadId);
    return save_(runId, leadId, 9, 'OfferExecutionWorkflow', 'buildQueue',
      'OFFERS', 'OFFER_EXECUTION_QUEUE', source, eligible, destination, result, reasons);
  }

  function save_(runId, leadId, stageId, moduleName, method, sourceSheet, destinationSheet,
                 source, eligible, destination, result, reasons) {
    var error = result && result.error ? String(result.error) : '';
    var status = error ? 'Error' : destination.length ? 'Pass' : eligible.length ? 'Fail' : 'Blocked';
    var missing = missingFields_(eligible.length ? eligible[0] : (source[0] || {}), stageId);
    var message = moduleName + '.' + method + ': source=' + source.length +
      '; eligible=' + eligible.length + '; destination=' + destination.length;
    if (reasons.length) message += '; reasons=' + unique_(reasons).join('|');
    if (missing.length) message += '; missing=' + missing.join('|');
    if (error) message += '; error=' + error;

    REOS.Database.insert(SHEET, {
      'Run ID': runId,
      'Lead ID': leadId,
      'Stage ID': stageId,
      Module: moduleName,
      Method: method,
      Status: status,
      'Source Sheet': sourceSheet,
      'Destination Sheet': destinationSheet,
      'Source Count': source.length,
      'Eligible Count': eligible.length,
      'Destination Count': destination.length,
      'Created Count': Number(result && (result.created || result.published) || 0),
      'Skipped Count': Number(result && result.skipped || 0),
      'Missing Fields': missing.join(', '),
      'Reason Codes': unique_(reasons).join(', '),
      Message: message,
      'Result JSON': safeJson_(result),
      'Checked At': new Date(),
      'Checked By': currentUser_()
    }, { idField: 'Instrumentation ID', idPrefix: 'OMI' });

    return { stageId: stageId, module: moduleName, method: method, status: status, message: message };
  }

  function invokeOptional_(enabled, module, method, args) {
    if (!enabled) return { invoked: false };
    try {
      if (!module || typeof module[method] !== 'function') throw new Error('Method unavailable: ' + method);
      return module[method].apply(module, args || []);
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  }

  function related_(sheet, leadId) {
    var rows = all_(sheet);
    if (!leadId) return rows;
    var keys = ['Lead ID','Distress Lead ID','IA Lead ID','Parent Lead ID','Source Lead ID'];
    return rows.filter(function (row) {
      return keys.some(function (key) { return String(row[key] || '') === leadId; });
    });
  }

  function all_(sheet) {
    try { return REOS.Database.getAll(sheet) || []; }
    catch (error) { return []; }
  }

  function missingFields_(row, stageId) {
    var map = {
      5: ['Decision ID','Lead ID','Decision','Lead Score'],
      6: ['Offer Queue ID','Decision ID','Lead ID'],
      8: ['Review ID','Offer Queue ID','Lead ID','Review Status'],
      9: ['Offer ID','Lead ID','Status','Offer Amount']
    };
    return (map[stageId] || []).filter(function (field) {
      return row[field] === null || row[field] === undefined || String(row[field]).trim() === '';
    });
  }

  function unique_(values) {
    var seen = {};
    return (values || []).filter(function (value) {
      value = String(value || '');
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function readState_() {
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) { return {}; }
  }

  function safeJson_(value) {
    try { return JSON.stringify(value === undefined ? null : value); }
    catch (error) { return JSON.stringify({ error: 'Unable to serialize result.' }); }
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || ''; }
    catch (error) { return ''; }
  }

  return {
    ensureSheet: ensureSheet,
    inspect: inspect,
    run: run
  };
})();

function reosOfferModuleInstrumentationEnsureSheet() {
  return REOS.OfferModuleInstrumentation.ensureSheet();
}

function reosOfferModuleInstrumentationInspect(options) {
  return REOS.OfferModuleInstrumentation.inspect(options);
}

function reosOfferModuleInstrumentationRun(options) {
  return REOS.OfferModuleInstrumentation.run(options);
}

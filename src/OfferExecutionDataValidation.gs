/**
 * REOS Enterprise v4.4.7
 * Sprint 7.3 Increment 3.3.2 - Offer Execution Data Validation
 *
 * Validates the parent/child data chain across:
 * AI_ACQUISITION_DECISIONS -> AI_OFFER_QUEUE -> AI_OFFER_REVIEW ->
 * OFFERS -> OFFER_EXECUTION_QUEUE.
 *
 * This module is read-only against business tables. It writes only to
 * OFFER_EXECUTION_VALIDATION and never approves, publishes, or submits offers.
 */
var REOS = REOS || {};

REOS.OfferExecutionDataValidation = (function () {
  var VALIDATION_SHEET = 'OFFER_EXECUTION_VALIDATION';
  var PIPELINE_STATE_KEY = 'REOS_LIVE_PIPELINE_STATE_V2';
  var VERSION = '4.4.7';

  var HEADERS = [
    'Validation ID',
    'Run ID',
    'Validation Status',
    'Stage ID',
    'Relationship',
    'Source Sheet',
    'Destination Sheet',
    'Source Field',
    'Source ID',
    'Destination Field',
    'Expected Count',
    'Actual Count',
    'Destination IDs',
    'Missing Fields',
    'Message',
    'Checked At',
    'Checked By'
  ];

  var RELATIONSHIPS = [
    {
      stageId: 5,
      name: 'Decision to offer queue',
      sourceSheet: 'AI_ACQUISITION_DECISIONS',
      sourceField: 'Decision ID',
      stateField: 'decisionId',
      destinationSheet: 'AI_OFFER_QUEUE',
      destinationField: 'Decision ID',
      destinationIdField: 'Offer Queue ID',
      requiredDestinationFields: ['Offer Queue ID', 'Decision ID', 'Lead ID'],
      expectedCount: 1
    },
    {
      stageId: 6,
      name: 'Offer queue to review',
      sourceSheet: 'AI_OFFER_QUEUE',
      sourceField: 'Offer Queue ID',
      stateField: 'offerQueueId',
      destinationSheet: 'AI_OFFER_REVIEW',
      destinationField: 'Offer Queue ID',
      destinationIdField: 'Review ID',
      requiredDestinationFields: ['Review ID', 'Offer Queue ID', 'Review Status'],
      expectedCount: 1
    },
    {
      stageId: 8,
      name: 'Review to published offer',
      sourceSheet: 'AI_OFFER_REVIEW',
      sourceField: 'Review ID',
      stateField: 'reviewId',
      destinationSheet: 'OFFERS',
      destinationField: 'Offer ID',
      destinationStateField: 'offerId',
      destinationIdField: 'Offer ID',
      requiredDestinationFields: ['Offer ID', 'Lead ID', 'Status'],
      expectedCount: 1
    },
    {
      stageId: 9,
      name: 'Offer to execution queue',
      sourceSheet: 'OFFERS',
      sourceField: 'Offer ID',
      stateField: 'offerId',
      destinationSheet: 'OFFER_EXECUTION_QUEUE',
      destinationField: 'Offer ID',
      destinationIdField: 'Execution ID',
      requiredDestinationFields: ['Execution ID', 'Offer ID', 'Execution Status'],
      expectedCount: 1
    }
  ];

  function ensureSheet() {
    requireDatabase_();
    REOS.Database.ensureTable(VALIDATION_SHEET, HEADERS);
    return {
      ok: true,
      version: VERSION,
      sheet: VALIDATION_SHEET,
      headers: HEADERS.slice()
    };
  }

  function validateCurrent() {
    var state = loadPipelineState_();
    if (!state) {
      throw new Error('No staged live-pipeline state was found. Run reosLivePipelineStart() first.');
    }
    return validateState(state);
  }

  function validateRun(runId) {
    if (!runId) throw new Error('runId is required.');
    var state = loadPipelineState_();
    if (state && String(state.runId || '') === String(runId)) {
      return validateState(state);
    }

    var runs = safeAll_('LIVE_PIPELINE_RUNS');
    var run = findFirst_(runs, 'Run ID', runId);
    if (!run) throw new Error('Live pipeline run not found: ' + runId);

    var summary = parseJson_(run['Summary JSON']);
    var reconstructed = {
      runId: runId,
      leadId: summary.leadId || run['Lead ID'] || '',
      decisionId: summary.decisionId || '',
      offerQueueId: summary.offerQueueId || '',
      reviewId: summary.reviewId || '',
      offerId: summary.offerId || '',
      executionId: summary.executionId || '',
      status: run.Status || summary.status || ''
    };
    return validateState(reconstructed);
  }

  function validateState(state) {
    ensureSheet();
    var started = new Date();
    var checks = RELATIONSHIPS.map(function (relationship) {
      return validateRelationship_(state, relationship);
    });

    var passed = checks.filter(function (check) { return check.status === 'Pass'; }).length;
    var failed = checks.length - passed;
    var missingLinks = checks.filter(function (check) { return check.actualCount < check.expectedCount; }).length;
    var duplicateLinks = checks.filter(function (check) { return check.actualCount > check.expectedCount; }).length;
    var invalidRecords = checks.filter(function (check) { return check.missingFields.length > 0; }).length;

    return {
      ok: failed === 0,
      version: VERSION,
      runId: state.runId || '',
      status: failed === 0 ? 'Validated' : 'Needs Attention',
      passed: passed,
      failed: failed,
      missingLinks: missingLinks,
      duplicateLinks: duplicateLinks,
      invalidRecords: invalidRecords,
      durationMs: new Date().getTime() - started.getTime(),
      checks: checks
    };
  }

  function validateRelationship_(state, relationship) {
    var sourceId = String(state[relationship.stateField] || '');
    var expectedCount = Number(relationship.expectedCount || 1);
    var destinationRows = [];

    if (relationship.destinationStateField) {
      var destinationId = String(state[relationship.destinationStateField] || '');
      if (destinationId) {
        destinationRows = findByField_(
          relationship.destinationSheet,
          relationship.destinationField,
          destinationId
        );
      }
    } else if (sourceId) {
      destinationRows = findByField_(
        relationship.destinationSheet,
        relationship.destinationField,
        sourceId
      );
    }

    var destinationIds = destinationRows.map(function (row) {
      return String(row[relationship.destinationIdField] || '');
    }).filter(Boolean);

    var missingFields = [];
    destinationRows.forEach(function (row, index) {
      relationship.requiredDestinationFields.forEach(function (field) {
        if (row[field] === '' || row[field] === null || typeof row[field] === 'undefined') {
          missingFields.push('row ' + (index + 1) + ': ' + field);
        }
      });
    });

    var actualCount = destinationRows.length;
    var sourcePresent = !!sourceId;
    var status = sourcePresent && actualCount === expectedCount && missingFields.length === 0
      ? 'Pass'
      : 'Fail';

    var message = buildMessage_(sourcePresent, expectedCount, actualCount, missingFields);
    var result = {
      stageId: relationship.stageId,
      relationship: relationship.name,
      status: status,
      sourceSheet: relationship.sourceSheet,
      destinationSheet: relationship.destinationSheet,
      sourceField: relationship.sourceField,
      sourceId: sourceId,
      destinationField: relationship.destinationField,
      expectedCount: expectedCount,
      actualCount: actualCount,
      destinationIds: destinationIds,
      missingFields: missingFields,
      message: message
    };

    writeValidation_(state.runId || '', result);
    return result;
  }

  function buildMessage_(sourcePresent, expectedCount, actualCount, missingFields) {
    if (!sourcePresent) return 'Source identifier is missing from the staged pipeline state.';
    if (actualCount === 0) return 'No related destination record was found.';
    if (actualCount < expectedCount) {
      return 'Related destination record count is below expectation: expected ' + expectedCount + ', found ' + actualCount + '.';
    }
    if (actualCount > expectedCount) {
      return 'Duplicate or ambiguous relationship: expected ' + expectedCount + ', found ' + actualCount + '.';
    }
    if (missingFields.length) {
      return 'Related record exists but required fields are missing: ' + missingFields.join(', ');
    }
    return 'Relationship and required fields validated.';
  }

  function writeValidation_(runId, result) {
    REOS.Database.insert(VALIDATION_SHEET, {
      'Run ID': runId,
      'Validation Status': result.status,
      'Stage ID': result.stageId,
      Relationship: result.relationship,
      'Source Sheet': result.sourceSheet,
      'Destination Sheet': result.destinationSheet,
      'Source Field': result.sourceField,
      'Source ID': result.sourceId,
      'Destination Field': result.destinationField,
      'Expected Count': result.expectedCount,
      'Actual Count': result.actualCount,
      'Destination IDs': result.destinationIds.join(', '),
      'Missing Fields': result.missingFields.join(', '),
      Message: result.message,
      'Checked At': new Date(),
      'Checked By': currentUser_()
    }, {
      idField: 'Validation ID',
      idPrefix: 'OEV'
    });
  }

  function summary(runId) {
    ensureSheet();
    var rows = safeAll_(VALIDATION_SHEET);
    if (runId) {
      rows = rows.filter(function (row) {
        return String(row['Run ID'] || '') === String(runId);
      });
    }

    var pass = rows.filter(function (row) { return String(row['Validation Status'] || '') === 'Pass'; }).length;
    var fail = rows.length - pass;
    return {
      ok: fail === 0,
      version: VERSION,
      runId: runId || '',
      total: rows.length,
      passed: pass,
      failed: fail,
      rows: rows
    };
  }

  function loadPipelineState_() {
    var raw = PropertiesService.getScriptProperties().getProperty(PIPELINE_STATE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error('The staged live-pipeline state is invalid JSON.');
    }
  }

  function findByField_(sheetName, field, value) {
    return safeAll_(sheetName).filter(function (row) {
      return String(row[field] || '') === String(value || '');
    });
  }

  function findFirst_(rows, field, value) {
    for (var i = 0; i < rows.length; i += 1) {
      if (String(rows[i][field] || '') === String(value || '')) return rows[i];
    }
    return null;
  }

  function safeAll_(sheetName) {
    try {
      return REOS.Database.getAll(sheetName) || [];
    } catch (error) {
      return [];
    }
  }

  function parseJson_(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch (error) {
      return {};
    }
  }

  function currentUser_() {
    try {
      return Session.getActiveUser().getEmail() || '';
    } catch (error) {
      return '';
    }
  }

  function requireDatabase_() {
    if (!REOS.Database) throw new Error('Database.gs is required.');
  }

  return {
    ensureSheet: ensureSheet,
    validateCurrent: validateCurrent,
    validateRun: validateRun,
    validateState: validateState,
    summary: summary
  };
})();

function reosOfferExecutionValidationEnsureSheet() {
  return REOS.OfferExecutionDataValidation.ensureSheet();
}

function reosOfferExecutionValidationRun() {
  return REOS.OfferExecutionDataValidation.validateCurrent();
}

function reosOfferExecutionValidationRunById(runId) {
  return REOS.OfferExecutionDataValidation.validateRun(runId);
}

function reosOfferExecutionValidationSummary(runId) {
  return REOS.OfferExecutionDataValidation.summary(runId);
}

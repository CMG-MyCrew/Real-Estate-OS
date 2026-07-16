/**
 * REOS Enterprise v4.3.3
 * Sprint 7.2 Increment 5 — Offer Execution Workflow
 */
var REOS = REOS || {};

REOS.OfferExecutionWorkflow = (function () {
  var SOURCE = 'OFFERS';
  var QUEUE = 'OFFER_EXECUTION_QUEUE';
  var LOG = 'OFFER_EXECUTION_LOG';
  var STATUSES = ['Ready','Submitted','Countered','Accepted','Rejected','Expired','Withdrawn'];

  var QUEUE_HEADERS = [
    'Execution ID','Offer ID','Deal ID','Lead ID','Address','Offer Type','Offer Amount',
    'Execution Status','Recipient Name','Recipient Email','Submission Method','Submitted At',
    'Follow Up At','Response At','Response Notes','Assigned To','Published Document URL',
    'Created At','Updated At'
  ];

  var LOG_HEADERS = [
    'Execution Log ID','Execution ID','Offer ID','Deal ID','Action','Previous Status',
    'New Status','Notes','Performed By','Created At'
  ];

  function ensureSheets() {
    REOS.Database.ensureTable(QUEUE, QUEUE_HEADERS);
    REOS.Database.ensureTable(LOG, LOG_HEADERS);
    return { ok: true, queue: QUEUE, log: LOG };
  }

  function buildQueue(options) {
    ensureSheets();
    options = Object.assign({ maxItems: 200 }, options || {});

    var offers = safeAll_(SOURCE).filter(function (row) {
      var status = String(row.Status || 'Draft');
      return status === 'Draft' || status === 'Ready';
    }).slice(0, Number(options.maxItems || 200));

    var existing = {};
    safeAll_(QUEUE).forEach(function (row) {
      existing[String(row['Offer ID'] || '')] = true;
    });

    var created = [];
    var skipped = 0;

    offers.forEach(function (offer) {
      var offerId = String(offer['Offer ID'] || '');
      if (!offerId || existing[offerId]) { skipped++; return; }

      var deal = findOne_('DEALS', 'Deal ID', offer['Deal ID']) || {};
      var row = REOS.Database.insert(QUEUE, {
        'Offer ID': offerId,
        'Deal ID': offer['Deal ID'] || '',
        'Lead ID': offer['Lead ID'] || '',
        Address: deal.Address || offer.Address || '',
        'Offer Type': offer['Offer Type'] || 'Acquisition',
        'Offer Amount': Number(offer['Offer Amount'] || 0),
        'Execution Status': 'Ready',
        'Recipient Name': deal['Seller Name'] || '',
        'Recipient Email': deal['Seller Email'] || '',
        'Submission Method': 'Email',
        'Submitted At': '',
        'Follow Up At': '',
        'Response At': '',
        'Response Notes': '',
        'Assigned To': offer['Assigned To'] || currentUser_(),
        'Published Document URL': '',
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: 'Execution ID', idPrefix: 'OEXEC' });

      REOS.Database.update(SOURCE, 'Offer ID', offerId, {
        Status: 'Ready',
        'Updated At': new Date()
      });

      log_(row, 'Queue Created', '', 'Ready', 'Offer added to execution queue.');
      existing[offerId] = true;
      created.push(row);
    });

    return { ok: true, source: offers.length, created: created.length, skipped: skipped, records: clean_(created) };
  }

  function markSubmitted(executionId, details) {
    details = details || {};
    var row = requireExecution_(executionId);
    var submittedAt = details.submittedAt ? new Date(details.submittedAt) : new Date();
    var followUpAt = details.followUpAt ? new Date(details.followUpAt) : new Date(submittedAt.getTime() + 2 * 24 * 60 * 60 * 1000);

    var updated = updateStatus_(row, 'Submitted', {
      'Recipient Name': details.recipientName || row['Recipient Name'] || '',
      'Recipient Email': details.recipientEmail || row['Recipient Email'] || '',
      'Submission Method': details.submissionMethod || row['Submission Method'] || 'Email',
      'Submitted At': submittedAt,
      'Follow Up At': followUpAt,
      'Published Document URL': details.documentUrl || row['Published Document URL'] || '',
      'Response Notes': details.notes || row['Response Notes'] || ''
    }, details.notes || 'Offer submitted.');

    createFollowUpTask_(updated);
    advancePipeline_(updated['Deal ID'], 'Offer Submitted', 'Offer marked submitted from execution workflow.');
    return { ok: true, record: clean_(updated) };
  }

  function recordResponse(executionId, status, notes) {
    if (STATUSES.indexOf(status) === -1 || status === 'Ready' || status === 'Submitted') {
      throw new Error('Invalid response status: ' + status);
    }
    var row = requireExecution_(executionId);
    var updated = updateStatus_(row, status, {
      'Response At': new Date(),
      'Response Notes': String(notes || '').trim()
    }, notes || ('Offer response recorded: ' + status));

    if (status === 'Accepted') advancePipeline_(updated['Deal ID'], 'Under Contract', 'Offer accepted.');
    if (status === 'Countered') advancePipeline_(updated['Deal ID'], 'Negotiation', 'Offer countered.');
    return { ok: true, record: clean_(updated) };
  }

  function scheduleFollowUps() {
    ensureSheets();
    var now = new Date();
    var due = safeAll_(QUEUE).filter(function (row) {
      return row['Execution Status'] === 'Submitted' && row['Follow Up At'] && new Date(row['Follow Up At']) <= now;
    });
    var created = 0;
    due.forEach(function (row) {
      if (createFollowUpTask_(row)) created++;
    });
    return { ok: true, due: due.length, tasksCreated: created };
  }

  function list(filters) {
    ensureSheets();
    filters = filters || {};
    return clean_(safeAll_(QUEUE).filter(function (row) {
      if (filters.status && row['Execution Status'] !== filters.status) return false;
      if (filters.method && row['Submission Method'] !== filters.method) return false;
      if (filters.assignedTo && row['Assigned To'] !== filters.assignedTo) return false;
      return true;
    }).slice().reverse());
  }

  function summary() {
    var rows = list();
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      total: rows.length,
      ready: count_(rows, 'Execution Status', 'Ready'),
      submitted: count_(rows, 'Execution Status', 'Submitted'),
      countered: count_(rows, 'Execution Status', 'Countered'),
      accepted: count_(rows, 'Execution Status', 'Accepted'),
      rejected: count_(rows, 'Execution Status', 'Rejected'),
      expired: count_(rows, 'Execution Status', 'Expired'),
      totalOfferValue: rows.reduce(function (s, r) { return s + Number(r['Offer Amount'] || 0); }, 0),
      records: rows
    };
  }

  function requireExecution_(executionId) {
    ensureSheets();
    requireText_(executionId, 'Execution ID');
    var row = findOne_(QUEUE, 'Execution ID', executionId);
    if (!row) throw new Error('Offer execution not found: ' + executionId);
    return row;
  }

  function updateStatus_(row, status, changes, notes) {
    var previous = row['Execution Status'] || '';
    changes = Object.assign({}, changes || {}, {
      'Execution Status': status,
      'Updated At': new Date()
    });
    var updated = REOS.Database.update(QUEUE, 'Execution ID', row['Execution ID'], changes);
    REOS.Database.update(SOURCE, 'Offer ID', row['Offer ID'], { Status: status, 'Updated At': new Date() });
    log_(row, 'Status Changed', previous, status, notes || '');
    publish_('offer.execution.status.changed', { executionId: row['Execution ID'], offerId: row['Offer ID'], status: status });
    return updated;
  }

  function createFollowUpTask_(row) {
    try {
      REOS.Database.ensureTable('ACQUISITION_TASK_QUEUE', [
        'Acquisition Task ID','Deal ID','Stage','Task Name','Owner Role','Priority','Due At','Status','Notes','Created At','Updated At'
      ]);
      var existing = safeAll_('ACQUISITION_TASK_QUEUE').some(function (task) {
        return task['Deal ID'] === row['Deal ID'] && task.Status === 'Open' && String(task['Task Name'] || '').indexOf('Follow up on offer') === 0;
      });
      if (existing) return false;
      REOS.Database.insert('ACQUISITION_TASK_QUEUE', {
        'Deal ID': row['Deal ID'] || '',
        Stage: 'Offer Submitted',
        'Task Name': 'Follow up on offer ' + (row['Offer ID'] || ''),
        'Owner Role': 'Acquisitions',
        Priority: 'High',
        'Due At': row['Follow Up At'] || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        Status: 'Open',
        Notes: 'Automated follow-up from Offer Execution Workflow.',
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: 'Acquisition Task ID', idPrefix: 'ATASK' });
      return true;
    } catch (error) { return false; }
  }

  function advancePipeline_(dealId, stage, notes) {
    try {
      if (dealId && REOS.AcquisitionPipeline && typeof REOS.AcquisitionPipeline.advanceStage === 'function') {
        REOS.AcquisitionPipeline.advanceStage(dealId, stage, notes || '');
      }
    } catch (ignored) {}
  }

  function log_(row, action, previous, next, notes) {
    REOS.Database.insert(LOG, {
      'Execution ID': row['Execution ID'] || '',
      'Offer ID': row['Offer ID'] || '',
      'Deal ID': row['Deal ID'] || '',
      Action: action,
      'Previous Status': previous || '',
      'New Status': next || '',
      Notes: notes || '',
      'Performed By': currentUser_(),
      'Created At': new Date()
    }, { idField: 'Execution Log ID', idPrefix: 'OLOG' });
  }

  function safeAll_(sheet) { try { return REOS.Database.getAll(sheet) || []; } catch (e) { return []; } }
  function findOne_(sheet, field, value) { return safeAll_(sheet).filter(function (r) { return r[field] === value; })[0] || null; }
  function count_(rows, field, value) { return rows.filter(function (r) { return r[field] === value; }).length; }
  function requireText_(value, label) { if (value === null || value === undefined || String(value).trim() === '') throw new Error(label + ' is required.'); }
  function currentUser_() { try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; } }
  function clean_(value) { return JSON.parse(JSON.stringify(value || null, function (k, v) { return v instanceof Date ? v.toISOString() : v; })); }
  function publish_(topic, payload) { try { if (REOS.PluginEventBus && typeof REOS.PluginEventBus.publish === 'function') REOS.PluginEventBus.publish(topic, payload, 'offer-execution'); } catch (e) {} }

  return {
    ensureSheets: ensureSheets,
    buildQueue: buildQueue,
    markSubmitted: markSubmitted,
    recordResponse: recordResponse,
    scheduleFollowUps: scheduleFollowUps,
    list: list,
    summary: summary
  };
})();

function reosOfferExecutionEnsureSheets() { return REOS.OfferExecutionWorkflow.ensureSheets(); }
function reosOfferExecutionBuildQueue(options) { return REOS.OfferExecutionWorkflow.buildQueue(options); }
function reosOfferExecutionMarkSubmitted(executionId, details) { return REOS.OfferExecutionWorkflow.markSubmitted(executionId, details); }
function reosOfferExecutionRecordResponse(executionId, status, notes) { return REOS.OfferExecutionWorkflow.recordResponse(executionId, status, notes); }
function reosOfferExecutionScheduleFollowUps() { return REOS.OfferExecutionWorkflow.scheduleFollowUps(); }
function reosOfferExecutionList(filters) { return REOS.OfferExecutionWorkflow.list(filters); }
function reosOfferExecutionSummary() { return REOS.OfferExecutionWorkflow.summary(); }

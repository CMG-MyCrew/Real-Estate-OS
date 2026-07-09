/**
 * REOS Enterprise v3.4.5
 * Sprint 5.4 — Acquisition Pipeline Core
 */

var REOS = REOS || {};

REOS.AcquisitionPipeline = (function () {
  var PIPELINE = 'ACQUISITION_PIPELINE';
  var HISTORY = 'ACQUISITION_STAGE_HISTORY';
  var TASKS = 'ACQUISITION_TASKS';
  var NOTES = 'ACQUISITION_NOTES';
  var METRICS = 'ACQUISITION_METRICS';

  var STAGES = ['Lead','Property Review','Initial Analysis','Comparable Analysis','Offer Generation','Offer Submitted','Negotiation','Under Contract','Due Diligence','Closing','Disposition','Closed'];

  function ensureSheets() {
    REOS.Database.ensureTable(PIPELINE, ['Pipeline ID','Deal ID','Current Stage','Status','Assigned To','Stage Started At','Percent Complete','Notes','Created At','Updated At']);
    REOS.Database.ensureTable(HISTORY, ['History ID','Deal ID','Previous Stage','New Stage','Changed By','Notes','Changed At']);
    REOS.Database.ensureTable(TASKS, ['Task ID','Deal ID','Stage','Task Name','Status','Assigned To','Due Date','Completed At','Notes','Created At']);
    REOS.Database.ensureTable(NOTES, ['Note ID','Deal ID','Stage','Note','Created By','Created At']);
    REOS.Database.ensureTable(METRICS, ['Metric ID','Generated At','Total Deals','Active Pipelines','Closed Deals','By Stage JSON']);
  }

  function createPipeline(dealId) {
    ensureSheets();
    var existing = getPipeline(dealId);
    if (existing) return existing;

    var row = REOS.Database.insert(PIPELINE, {
      'Deal ID': dealId,
      'Current Stage': 'Lead',
      Status: 'Active',
      'Assigned To': currentUser_(),
      'Stage Started At': new Date(),
      'Percent Complete': percent_('Lead'),
      Notes: '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Pipeline ID', idPrefix: 'PIPE' });

    logHistory_(dealId, '', 'Lead', 'Pipeline created.');
    publish_('pipeline.created', row);
    return row;
  }

  function createForLatestDeal() {
    var deals = REOS.Database.getAll('DEALS');
    if (!deals.length) throw new Error('No deals found.');
    return createPipeline(deals[deals.length - 1]['Deal ID']);
  }

  function advanceStage(dealId, nextStage, notes) {
    ensureSheets();
    if (STAGES.indexOf(nextStage) === -1) throw new Error('Invalid stage: ' + nextStage);

    var pipeline = getPipeline(dealId) || createPipeline(dealId);
    var previous = pipeline['Current Stage'];

    var updated = REOS.Database.update(PIPELINE, 'Deal ID', dealId, {
      'Current Stage': nextStage,
      Status: nextStage === 'Closed' ? 'Closed' : 'Active',
      'Stage Started At': new Date(),
      'Percent Complete': percent_(nextStage),
      Notes: notes || '',
      'Updated At': new Date()
    });

    logHistory_(dealId, previous, nextStage, notes || '');
    createStageTasks_(dealId, nextStage);
    publish_('pipeline.stage.changed', { dealId: dealId, previousStage: previous, newStage: nextStage });

    return updated;
  }

  function advanceDemo() {
    var deals = REOS.Database.getAll('DEALS');
    if (!deals.length) throw new Error('No deals found.');
    var dealId = deals[deals.length - 1]['Deal ID'];
    createPipeline(dealId);
    return advanceStage(dealId, 'Property Review', 'Demo advancement.');
  }

  function getPipeline(dealId) {
    ensureSheets();
    var rows = REOS.Database.getAll(PIPELINE).filter(function (r) { return r['Deal ID'] === dealId; });
    return rows.length ? rows[0] : null;
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(PIPELINE);
    var byStage = rows.reduce(function (m, r) {
      var stage = r['Current Stage'] || 'Unknown';
      m[stage] = (m[stage] || 0) + 1;
      return m;
    }, {});

    var result = {
      ok: true,
      generatedAt: new Date().toISOString(),
      totalPipelines: rows.length,
      active: rows.filter(function (r) { return r.Status === 'Active'; }).length,
      closed: rows.filter(function (r) { return r.Status === 'Closed'; }).length,
      byStage: byStage
    };

    REOS.Database.insert(METRICS, {
      'Generated At': new Date(),
      'Total Deals': REOS.Database.getAll('DEALS').length,
      'Active Pipelines': result.active,
      'Closed Deals': result.closed,
      'By Stage JSON': REOS.toJson_(byStage)
    }, { idField: 'Metric ID', idPrefix: 'AMET' });

    return result;
  }

  function createStageTasks_(dealId, stage) {
    var tasks = [];
    if (stage === 'Due Diligence') {
      tasks = ['Property inspection','Title search','Tax verification','HOA verification','Insurance quote','Contractor estimate','Utility verification','Permit history review'];
    } else if (stage === 'Offer Submitted') {
      tasks = ['Confirm offer delivery','Schedule seller follow-up','Update CRM activity'];
    } else if (stage === 'Under Contract') {
      tasks = ['Upload contract','Open escrow','Order inspection','Confirm closing timeline'];
    }

    tasks.forEach(function (name) {
      REOS.Database.insert(TASKS, {
        'Deal ID': dealId,
        Stage: stage,
        'Task Name': name,
        Status: 'Open',
        'Assigned To': currentUser_(),
        'Due Date': '',
        'Completed At': '',
        Notes: '',
        'Created At': new Date()
      }, { idField: 'Task ID', idPrefix: 'ATASK' });
    });
  }

  function logHistory_(dealId, previousStage, newStage, notes) {
    return REOS.Database.insert(HISTORY, {
      'Deal ID': dealId,
      'Previous Stage': previousStage,
      'New Stage': newStage,
      'Changed By': currentUser_(),
      Notes: notes || '',
      'Changed At': new Date()
    }, { idField: 'History ID', idPrefix: 'AHIST' });
  }

  function percent_(stage) {
    var idx = STAGES.indexOf(stage);
    return idx < 0 ? 0 : Math.round((idx / (STAGES.length - 1)) * 100);
  }

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
    }
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail(); } catch (e) { return ''; }
  }

  return {
    ensureSheets: ensureSheets,
    createPipeline: createPipeline,
    createForLatestDeal: createForLatestDeal,
    advanceStage: advanceStage,
    advanceDemo: advanceDemo,
    getPipeline: getPipeline,
    summary: summary
  };
})();

function reosAcquisitionPipelineEnsureSheets() {
  REOS.AcquisitionPipeline.ensureSheets();
  SpreadsheetApp.getUi().alert('Acquisition Pipeline sheets ready.');
}

function reosAcquisitionPipelineCreateForLatestDeal() {
  var result = REOS.AcquisitionPipeline.createForLatestDeal();
  SpreadsheetApp.getUi().alert('Acquisition Pipeline Created', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionPipelineAdvanceDemo() {
  var result = REOS.AcquisitionPipeline.advanceDemo();
  SpreadsheetApp.getUi().alert('Acquisition Pipeline Advanced', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionPipelineSummary() {
  var result = REOS.AcquisitionPipeline.summary();
  SpreadsheetApp.getUi().alert('Acquisition Pipeline Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

/**
 * REOS Enterprise v3.4.6
 * Sprint 5.4 Increment 2 — Acquisition Workflow Automation
 */

var REOS = REOS || {};

REOS.AcquisitionWorkflow = (function () {
  var RUNS = 'ACQUISITION_WORKFLOW_RUNS';

  function ensureSheets() {
    REOS.Database.ensureTable(RUNS, ['Workflow Run ID','Deal ID','Status','Steps Completed','Message','Created At']);
    if (REOS.AcquisitionPipeline && REOS.AcquisitionPipeline.ensureSheets) REOS.AcquisitionPipeline.ensureSheets();
  }

  function runForDeal(dealId) {
    ensureSheets();

    var steps = [];
    var message = 'Workflow completed.';

    try {
      var pipeline = REOS.AcquisitionPipeline.createPipeline(dealId);
      steps.push('Pipeline Created');

      REOS.AcquisitionPipeline.advanceStage(dealId, 'Initial Analysis', 'Workflow automation.');
      steps.push('Initial Analysis Stage');

      var analyses = REOS.Database.getAll('DEAL_ANALYSIS').filter(function (r) {
        return r['Deal ID'] === dealId;
      });

      if (analyses.length) {
        REOS.AcquisitionPipeline.advanceStage(dealId, 'Comparable Analysis', 'Analysis found.');
        steps.push('Comparable Analysis Stage');
      }

      var comps = REOS.Database.getAll('DEAL_COMPARABLES').filter(function (r) {
        return r['Deal ID'] === dealId;
      });

      if (comps.length) {
        REOS.AcquisitionPipeline.advanceStage(dealId, 'Offer Generation', 'Comps found.');
        steps.push('Offer Generation Stage');
      }

      var offers = REOS.Database.getAll('OFFERS').filter(function (r) {
        return r['Deal ID'] === dealId;
      });

      if (offers.length) {
        REOS.AcquisitionPipeline.advanceStage(dealId, 'Offer Submitted', 'Offers found.');
        steps.push('Offer Submitted Stage');
      }

      publish_('acquisition.workflow.completed', { dealId: dealId, steps: steps });

      return logRun_(dealId, 'Complete', steps, message);
    } catch (error) {
      message = error.message;
      if (REOS.ErrorCenter && REOS.ErrorCenter.capture) {
        REOS.ErrorCenter.capture(error, { module: 'AcquisitionWorkflow', functionName: 'runForDeal', dealId: dealId });
      }
      return logRun_(dealId, 'Failed', steps, message);
    }
  }

  function runForLatestDeal() {
    var deals = REOS.Database.getAll('DEALS');
    if (!deals.length) throw new Error('No deals found.');
    return runForDeal(deals[deals.length - 1]['Deal ID']);
  }

  function runAllNewDeals() {
    ensureSheets();
    var pipelines = REOS.Database.getAll('ACQUISITION_PIPELINE').map(function (r) { return r['Deal ID']; });
    var deals = REOS.Database.getAll('DEALS').filter(function (d) {
      return pipelines.indexOf(d['Deal ID']) === -1;
    });

    return deals.map(function (deal) {
      return runForDeal(deal['Deal ID']);
    });
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(RUNS);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      runs: rows.length,
      complete: rows.filter(function (r) { return r.Status === 'Complete'; }).length,
      failed: rows.filter(function (r) { return r.Status === 'Failed'; }).length
    };
  }

  function logRun_(dealId, status, steps, message) {
    return REOS.Database.insert(RUNS, {
      'Deal ID': dealId,
      Status: status,
      'Steps Completed': steps.join(', '),
      Message: message,
      'Created At': new Date()
    }, { idField: 'Workflow Run ID', idPrefix: 'AWRK' });
  }

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
    }
  }

  return {
    ensureSheets: ensureSheets,
    runForDeal: runForDeal,
    runForLatestDeal: runForLatestDeal,
    runAllNewDeals: runAllNewDeals,
    summary: summary
  };
})();

function reosAcquisitionWorkflowRunForLatestDeal() {
  var result = REOS.AcquisitionWorkflow.runForLatestDeal();
  SpreadsheetApp.getUi().alert('Acquisition Workflow Latest Deal', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionWorkflowRunAllNewDeals() {
  var result = REOS.AcquisitionWorkflow.runAllNewDeals();
  SpreadsheetApp.getUi().alert('Acquisition Workflow New Deals', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionWorkflowSummary() {
  var result = REOS.AcquisitionWorkflow.summary();
  SpreadsheetApp.getUi().alert('Acquisition Workflow Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

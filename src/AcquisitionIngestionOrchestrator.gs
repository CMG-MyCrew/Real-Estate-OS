/**
 * REOS Enterprise v4.2.3 - Acquisition Ingestion Orchestrator
 * Sprint 7.1 Increment 4: connector-to-intelligence automation.
 */
var REOS = REOS || {};

REOS.AcquisitionIngestionOrchestrator = (function () {
  var RUNS = 'ACQUISITION_INGESTION_RUNS';
  var HEADERS = [
    'Ingestion Run ID','Status','Connectors Run','Connector Failures','Records Found',
    'Records Imported','Records Skipped','Duplicates Found','IA Rows Imported',
    'Rows Scored','Rows Promoted','Started At','Completed At','Duration Ms',
    'Options JSON','Summary JSON','Errors JSON','Executed By'
  ];

  function ensureSheets() {
    REOS.Database.ensureTable(RUNS, HEADERS);
    if (REOS.AcquisitionConnectorManager) REOS.AcquisitionConnectorManager.ensureSheets();
    if (REOS.LeadNormalization) REOS.LeadNormalization.ensureSheets();
    if (REOS.LeadDeduplication) REOS.LeadDeduplication.ensureSheets();
    if (REOS.IntelligentAcquisition) REOS.IntelligentAcquisition.ensureSheets();
    return { ok: true, runs: RUNS };
  }

  function run(options) {
    ensureSheets();
    options = Object.assign({
      runConnectors: true,
      includeDisabled: false,
      scanDuplicates: true,
      scoreLeads: true,
      autoPromote: false,
      promoteThreshold: 80,
      topLimit: 10,
      assignedTo: ''
    }, options || {});

    var started = new Date();
    var errors = [];
    var connectorResult = { ok: true, connectors: 0, failed: 0, results: [] };
    var duplicateResult = { ok: true, duplicates: 0, matches: [] };
    var ingestResult = { ok: true, rowsFound: 0, imported: 0, duplicates: 0 };
    var scoreResult = { ok: true, scored: 0, topScore: 0, averageScore: 0 };
    var promotionResult = { ok: true, candidates: 0, promoted: 0, skipped: 0 };

    if (options.runConnectors) {
      connectorResult = step_(function () {
        require_('AcquisitionConnectorManager');
        return REOS.AcquisitionConnectorManager.runAll({
          includeDisabled: !!options.includeDisabled,
          context: { source: 'AcquisitionIngestionOrchestrator' }
        });
      }, errors, 'connectors', connectorResult);
    }

    if (options.scanDuplicates) {
      duplicateResult = step_(function () {
        require_('LeadDeduplication');
        return REOS.LeadDeduplication.scanSheet('DISTRESS_LEADS', 'Distress Lead ID');
      }, errors, 'deduplication', duplicateResult);
    }

    ingestResult = step_(function () {
      require_('IntelligentAcquisition');
      return REOS.IntelligentAcquisition.ingestDistressLeads();
    }, errors, 'intelligence-ingest', ingestResult);

    if (options.scoreLeads) {
      scoreResult = step_(function () {
        require_('IntelligentAcquisition');
        return REOS.IntelligentAcquisition.scoreAll();
      }, errors, 'scoring', scoreResult);
    }

    if (options.autoPromote) {
      promotionResult = step_(function () {
        require_('IntelligentAcquisition');
        return REOS.IntelligentAcquisition.promoteTop({
          promoteThreshold: Number(options.promoteThreshold || 80),
          topLimit: Number(options.topLimit || 10),
          assignedTo: options.assignedTo || ''
        });
      }, errors, 'promotion', promotionResult);
    }

    var completed = new Date();
    var connectorMetrics = connectorTotals_(connectorResult);
    var summary = {
      connectors: connectorResult,
      deduplication: duplicateResult,
      intelligenceIngest: ingestResult,
      scoring: scoreResult,
      promotion: promotionResult
    };

    var runRow = REOS.Database.insert(RUNS, {
      Status: errors.length ? 'Completed With Errors' : 'Complete',
      'Connectors Run': Number(connectorResult.connectors || 0),
      'Connector Failures': Number(connectorResult.failed || 0),
      'Records Found': connectorMetrics.found,
      'Records Imported': connectorMetrics.imported,
      'Records Skipped': connectorMetrics.skipped,
      'Duplicates Found': Number(duplicateResult.duplicates || 0),
      'IA Rows Imported': Number(ingestResult.imported || 0),
      'Rows Scored': Number(scoreResult.scored || 0),
      'Rows Promoted': Number(promotionResult.promoted || 0),
      'Started At': started,
      'Completed At': completed,
      'Duration Ms': completed.getTime() - started.getTime(),
      'Options JSON': JSON.stringify(options),
      'Summary JSON': JSON.stringify(summary),
      'Errors JSON': JSON.stringify(errors),
      'Executed By': currentUser_()
    }, { idField: 'Ingestion Run ID', idPrefix: 'INGRUN' });

    publish_('acquisition.ingestion.completed', {
      runId: runRow['Ingestion Run ID'],
      imported: connectorMetrics.imported,
      scored: Number(scoreResult.scored || 0),
      promoted: Number(promotionResult.promoted || 0),
      errors: errors.length
    });

    return {
      ok: errors.length === 0,
      runId: runRow['Ingestion Run ID'],
      status: runRow.Status,
      summary: summary,
      errors: errors
    };
  }

  function summary(limit) {
    ensureSheets();
    var runs = REOS.Database.getAll(RUNS);
    var recent = runs.slice().reverse().slice(0, Number(limit || 10));
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      runs: runs.length,
      latest: runs.length ? runs[runs.length - 1] : null,
      recent: recent
    };
  }

  function connectorTotals_(result) {
    var totals = { found: 0, imported: 0, skipped: 0 };
    (result.results || []).forEach(function (item) {
      var r = item.result || {};
      totals.found += Number(r.recordsFound || 0);
      totals.imported += Number(r.recordsImported || 0);
      totals.skipped += Number(r.recordsSkipped || 0);
    });
    return totals;
  }

  function step_(fn, errors, name, fallback) {
    try { return fn(); }
    catch (error) {
      errors.push({ step: name, message: error.message || String(error) });
      return fallback;
    }
  }

  function require_(name) {
    if (!REOS[name]) throw new Error(name + '.gs is required.');
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || ''; }
    catch (error) { return ''; }
  }

  function publish_(topic, payload) {
    try {
      if (REOS.PluginEventBus && typeof REOS.PluginEventBus.publish === 'function') {
        REOS.PluginEventBus.publish(topic, payload, 'acquisition-ingestion');
      }
    } catch (error) {}
  }

  return { ensureSheets: ensureSheets, run: run, summary: summary };
})();

function reosAcquisitionIngestionEnsureSheets() {
  return REOS.AcquisitionIngestionOrchestrator.ensureSheets();
}
function reosAcquisitionIngestionRun(options) {
  return REOS.AcquisitionIngestionOrchestrator.run(options);
}
function reosAcquisitionIngestionSummary(limit) {
  return REOS.AcquisitionIngestionOrchestrator.summary(limit);
}
function reosAcquisitionIngestionRunConservative() {
  return REOS.AcquisitionIngestionOrchestrator.run({ autoPromote: false });
}
function reosAcquisitionIngestionRunAndPromote() {
  return REOS.AcquisitionIngestionOrchestrator.run({
    autoPromote: true,
    promoteThreshold: 80,
    topLimit: 10
  });
}

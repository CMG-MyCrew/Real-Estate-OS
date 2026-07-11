/**
 * REOS Enterprise v4.2.0 - Acquisition Connector Manager
 * Sprint 7.1 Increment 1: execution, health, and run logging.
 */
var REOS = REOS || {};

REOS.AcquisitionConnectorManager = (function () {
  var RUNS = 'ACQUISITION_CONNECTOR_RUNS';
  var RUN_HEADERS = [
    'Run ID','Connector Key','Connector Name','Status','Started At','Completed At',
    'Duration Ms','Records Found','Records Imported','Records Skipped','Message',
    'Details JSON','Executed By'
  ];

  function ensureSheets() {
    if (!REOS.ConnectorRegistry) throw new Error('ConnectorRegistry.gs is required.');
    REOS.ConnectorRegistry.ensureSheet();
    REOS.Database.ensureTable(RUNS, RUN_HEADERS);
    return { ok: true, registry: REOS.ConnectorRegistry.table, runs: RUNS };
  }

  function initialize() {
    ensureSheets();
    return REOS.ConnectorRegistry.seedDefaults();
  }

  function list() {
    ensureSheets();
    return REOS.ConnectorRegistry.list();
  }

  function run(key, options) {
    ensureSheets();
    options = options || {};

    var connector = REOS.ConnectorRegistry.get(key);
    if (!connector) throw new Error('Unknown connector: ' + key);
    if (!REOS.ConnectorRegistry.isEnabled(connector) && !options.force) {
      return {
        ok: false,
        skipped: true,
        connectorKey: key,
        status: 'Disabled',
        message: 'Connector is disabled.'
      };
    }

    var started = new Date();
    var status = 'Complete';
    var result;
    var message = '';

    try {
      result = invoke_(connector, options);
      if (result && result.ok === false) status = result.status || 'Failed';
      message = result && result.message ? result.message : 'Connector completed.';
    } catch (error) {
      status = 'Failed';
      message = error.message || String(error);
      result = { ok: false, error: message };
    }

    var completed = new Date();
    var metrics = extractMetrics_(result);
    var runRow = REOS.Database.insert(RUNS, {
      'Connector Key': connector['Connector Key'],
      'Connector Name': connector.Name,
      'Status': status,
      'Started At': started,
      'Completed At': completed,
      'Duration Ms': completed.getTime() - started.getTime(),
      'Records Found': metrics.found,
      'Records Imported': metrics.imported,
      'Records Skipped': metrics.skipped,
      'Message': message,
      'Details JSON': JSON.stringify(result || {}),
      'Executed By': currentUser_()
    }, { idField: 'Run ID', idPrefix: 'CRUN' });

    REOS.ConnectorRegistry.update(key, {
      'Last Run At': completed,
      'Last Status': status,
      'Last Message': message
    });

    publish_('acquisition.connector.completed', {
      connectorKey: key,
      status: status,
      runId: runRow['Run ID'],
      metrics: metrics
    });

    return {
      ok: status === 'Complete' || status === 'Success',
      connectorKey: key,
      status: status,
      run: runRow,
      result: result
    };
  }

  function runAll(options) {
    ensureSheets();
    options = options || {};
    var connectors = list().filter(function (connector) {
      return options.includeDisabled || REOS.ConnectorRegistry.isEnabled(connector);
    });

    var results = connectors.map(function (connector) {
      return run(connector['Connector Key'], {
        force: !!options.includeDisabled,
        context: options.context || {}
      });
    });

    return {
      ok: results.every(function (item) { return item.ok || item.skipped; }),
      generatedAt: new Date().toISOString(),
      connectors: connectors.length,
      succeeded: results.filter(function (item) { return item.ok; }).length,
      failed: results.filter(function (item) { return !item.ok && !item.skipped; }).length,
      skipped: results.filter(function (item) { return item.skipped; }).length,
      results: results
    };
  }

  function health() {
    ensureSheets();
    var now = new Date();
    var connectors = list();
    var items = connectors.map(function (connector) {
      var enabled = REOS.ConnectorRegistry.isEnabled(connector);
      var lastRun = connector['Last Run At'] ? new Date(connector['Last Run At']) : null;
      var ageHours = lastRun ? Math.round((now.getTime() - lastRun.getTime()) / 3600000) : null;
      var lastStatus = connector['Last Status'] || 'Never Run';
      var state = !enabled ? 'Disabled' : lastStatus === 'Failed' ? 'Unhealthy' : !lastRun ? 'Not Tested' : ageHours > 48 ? 'Stale' : 'Healthy';

      return {
        key: connector['Connector Key'],
        name: connector.Name,
        enabled: enabled,
        state: state,
        lastStatus: lastStatus,
        lastRunAt: lastRun ? lastRun.toISOString() : '',
        ageHours: ageHours,
        message: connector['Last Message'] || ''
      };
    });

    return {
      ok: items.every(function (item) { return !item.enabled || item.state === 'Healthy'; }),
      generatedAt: now.toISOString(),
      total: items.length,
      enabled: items.filter(function (item) { return item.enabled; }).length,
      healthy: items.filter(function (item) { return item.state === 'Healthy'; }).length,
      unhealthy: items.filter(function (item) { return item.state === 'Unhealthy'; }).length,
      stale: items.filter(function (item) { return item.state === 'Stale'; }).length,
      items: items
    };
  }

  function recentRuns(limit) {
    ensureSheets();
    limit = Number(limit || 25);
    return REOS.Database.getAll(RUNS).slice().reverse().slice(0, limit);
  }

  function invoke_(connector, options) {
    var handlerName = String(connector['Handler Function'] || '').trim();
    if (!handlerName) throw new Error('Connector handler is not configured.');
    if (typeof globalThis[handlerName] !== 'function') {
      throw new Error('Connector handler unavailable: ' + handlerName);
    }

    return globalThis[handlerName]({
      connector: connector,
      config: REOS.ConnectorRegistry.getConfig(connector),
      options: options || {}
    });
  }

  function extractMetrics_(result) {
    result = result || {};
    return {
      found: Number(result.recordsFound || result.rowsFound || result.found || 0),
      imported: Number(result.recordsImported || result.rowsImported || result.imported || 0),
      skipped: Number(result.recordsSkipped || result.rowsSkipped || result.skipped || 0)
    };
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || ''; }
    catch (error) { return ''; }
  }

  function publish_(topic, payload) {
    try {
      if (REOS.PluginEventBus && typeof REOS.PluginEventBus.publish === 'function') {
        REOS.PluginEventBus.publish(topic, payload, 'acquisition-connectors');
      }
    } catch (error) {}
  }

  return {
    ensureSheets: ensureSheets,
    initialize: initialize,
    list: list,
    run: run,
    runAll: runAll,
    health: health,
    recentRuns: recentRuns
  };
})();

function reosConnectorEnsureSheets() { return REOS.AcquisitionConnectorManager.ensureSheets(); }
function reosConnectorInitialize() { return REOS.AcquisitionConnectorManager.initialize(); }
function reosConnectorList() { return REOS.AcquisitionConnectorManager.list(); }
function reosConnectorRun(key, options) { return REOS.AcquisitionConnectorManager.run(key, options); }
function reosConnectorRunAll(options) { return REOS.AcquisitionConnectorManager.runAll(options); }
function reosConnectorHealth() { return REOS.AcquisitionConnectorManager.health(); }
function reosConnectorRecentRuns(limit) { return REOS.AcquisitionConnectorManager.recentRuns(limit); }

// Increment 1 placeholder handlers. Increment 2 will replace these with CSV/API ingestion.
function reosConnectorHandleCountyCsv(context) { return reosConnectorPlaceholder_(context); }
function reosConnectorHandleTaxDelinquent(context) { return reosConnectorPlaceholder_(context); }
function reosConnectorHandleProbate(context) { return reosConnectorPlaceholder_(context); }
function reosConnectorHandleCodeViolations(context) { return reosConnectorPlaceholder_(context); }
function reosConnectorHandleVacantProperties(context) { return reosConnectorPlaceholder_(context); }
function reosConnectorHandleAbsenteeOwners(context) { return reosConnectorPlaceholder_(context); }

function reosConnectorPlaceholder_(context) {
  var connector = (context || {}).connector || {};
  return {
    ok: true,
    status: 'Complete',
    message: 'Connector framework test completed; source ingestion is added in Increment 2.',
    connectorKey: connector['Connector Key'] || '',
    recordsFound: 0,
    recordsImported: 0,
    recordsSkipped: 0
  };
}

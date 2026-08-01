/**
 * REOS Enterprise - County Connector Commands
 * Public entry points for terminal-driven county connector execution.
 */
var REOS = REOS || {};

function REOS_COUNTY_REGISTER_ADAPTERS_() {
  if (
    !REOS.CountyAdapters ||
    !REOS.CountyAdapters.Registry
  ) {
    throw new Error(
      'CountyAdapterRegistry is not loaded.'
    );
  }

  var registry = REOS.CountyAdapters.Registry;

  var adapters = [
    {
      name: 'arcgis',
      adapter: REOS.CountyAdapters.ArcGIS
    },
    {
      name: 'html-table',
      adapter: REOS.CountyAdapters.HTMLTable
    },
    {
      name: 'json-api',
      adapter: REOS.CountyAdapters.JSONAPI
    },
    {
      name: 'socrata',
      adapter: REOS.CountyAdapters.Socrata
    },
    {
      name: 'csv',
      adapter: REOS.CountyAdapters.CSV
    }
  ];

  adapters.forEach(function (item) {
    if (!item.adapter) {
      throw new Error(
        'County adapter implementation is not loaded: ' +
        item.name
      );
    }

    if (!registry.get(item.name)) {
      registry.register(
        item.name,
        item.adapter
      );
    }
  });

  return registry.list();
}

function REOS_COUNTY_REGISTER_CONNECTORS_() {
  REOS_COUNTY_REGISTER_ADAPTERS_();

  if (!REOS.CountyConnectorSDK) {
    throw new Error('CountyConnectorSDK is not loaded.');
  }

  if (
    REOS.PhiladelphiaCountyConnector &&
    !REOS.CountyConnectorSDK.get(
      REOS.PhiladelphiaCountyConnector.connectorId
    )
  ) {
    REOS.PhiladelphiaCountyConnector.register();
  }
}

function REOS_COUNTY_SETUP() {
  REOS_COUNTY_REGISTER_CONNECTORS_();
  return REOS.CountyConnectorSDK.ensureInfrastructure();
}

function REOS_COUNTY_LIST() {
  REOS_COUNTY_REGISTER_CONNECTORS_();
  return REOS.CountyConnectorSDK.list();
}

function REOS_COUNTY_DRY_RUN(connectorId, dataset, limit) {
  REOS_COUNTY_REGISTER_CONNECTORS_();

  return REOS.CountyConnectorSDK.run(connectorId, {
    dataset: dataset,
    limit: Number(limit || 100),
    dryRun: true
  });
}

function REOS_COUNTY_SYNC(connectorId, dataset, limit, cursor) {
  REOS_COUNTY_REGISTER_CONNECTORS_();

  return REOS.CountyConnectorSDK.run(connectorId, {
    dataset: dataset,
    limit: Number(limit || 500),
    cursor: cursor || '',
    dryRun: false
  });
}

function REOS_COUNTY_SYNC_ALL_DRY_RUN() {
  REOS_COUNTY_REGISTER_CONNECTORS_();
  return REOS.CountyConnectorSDK.runAll({
    dryRun: true,
    limit: 100
  });
}

function REOS_COUNTY_SYNC_ALL() {
  REOS_COUNTY_REGISTER_CONNECTORS_();
  return REOS.CountyConnectorSDK.runAll({
    dryRun: false,
    limit: 500
  });
}

function REOS_COUNTY_TERMINAL_SYNC(options) {
  REOS_COUNTY_REGISTER_CONNECTORS_();

  options = options || {};

  var action = String(options.action || 'sync').toLowerCase();
  var connectorId = String(options.connectorId || '').trim();
  var dataset = String(options.dataset || '').trim();
  var limit = Math.max(
    1,
    Math.min(Number(options.limit || 100), 5000)
  );
  var cursor = String(options.cursor || '');
  var dryRun = options.dryRun !== false;

  if (action === 'setup') {
    return REOS_COUNTY_SETUP();
  }

  if (action === 'list') {
    return REOS_COUNTY_LIST();
  }

  if (action === 'adapter-list') {
    return {
      ok: true,
      adapters: REOS.CountyAdapters.Registry.list()
    };
  }

  if (action === 'adapter-health') {
    var adapterName = String(
      options.adapter || ''
    ).trim();

    var healthEndpoint = String(
      options.endpoint || ''
    ).trim();

    if (!adapterName) {
      throw new Error(
        'adapter is required for adapter-health.'
      );
    }

    if (!healthEndpoint) {
      throw new Error(
        'endpoint is required for adapter-health.'
      );
    }

    return REOS.CountyAdapters.Registry.health(
      adapterName,
      {
        endpoint: healthEndpoint
      }
    );
  }

  if (action === 'configure-endpoint') {
    if (!connectorId) {
      throw new Error(
        'connectorId is required for endpoint configuration.'
      );
    }

    if (!dataset) {
      throw new Error(
        'dataset is required for endpoint configuration.'
      );
    }

    var endpoint = String(options.endpoint || '').trim();

    if (!endpoint) {
      throw new Error(
        'endpoint is required for endpoint configuration.'
      );
    }

    var propertyKey =
      'REOS_COUNTY_' +
      connectorId.replace(/-/g, '_') +
      '_' +
      dataset.toUpperCase() +
      '_URL';

    PropertiesService
      .getScriptProperties()
      .setProperty(propertyKey, endpoint);

    return {
      ok: true,
      action: 'configure-endpoint',
      connectorId: connectorId,
      dataset: dataset,
      propertyKey: propertyKey,
      endpoint: endpoint
    };
  }

  if (action === 'get-endpoint') {
    if (!connectorId) {
      throw new Error('connectorId is required.');
    }

    if (!dataset) {
      throw new Error('dataset is required.');
    }

    var lookupKey =
      'REOS_COUNTY_' +
      connectorId.replace(/-/g, '_') +
      '_' +
      dataset.toUpperCase() +
      '_URL';

    return {
      connectorId: connectorId,
      dataset: dataset,
      propertyKey: lookupKey,
      endpoint: PropertiesService
        .getScriptProperties()
        .getProperty(lookupKey) || ''
    };
  }

  if (action === 'sync-all') {
    if (!dryRun && options.confirmLive !== true) {
      throw new Error(
        'Live terminal sync-all requires confirmLive=true.'
      );
    }

    return REOS.CountyConnectorSDK.runAll({
      dryRun: dryRun,
      limit: limit
    });
  }

  if (action !== 'sync') {
    throw new Error(
      'Unsupported county terminal action: ' + action
    );
  }

  if (!connectorId) {
    throw new Error(
      'connectorId is required for terminal sync.'
    );
  }

  if (!dataset) {
    throw new Error(
      'dataset is required for terminal sync.'
    );
  }

  if (!dryRun && options.confirmLive !== true) {
    throw new Error(
      'Live terminal sync requires confirmLive=true.'
    );
  }

  try {
    return REOS.CountyConnectorSDK.run(connectorId, {
      dataset: dataset,
      limit: limit,
      cursor: cursor,
      dryRun: dryRun
    });
  } catch (e) {
    return {
      ok: false,
      error: String(e),
      message: e && e.message ? e.message : String(e),
      stack: e && e.stack ? e.stack : ''
    };
  }
}

function REOS_COUNTY_INSTALL_DAILY_TRIGGER() {
  var functionName = 'REOS_COUNTY_SYNC_ALL';

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  var trigger = ScriptApp
    .newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(4)
    .create();

  return {
    ok: true,
    handler: functionName,
    triggerId: trigger.getUniqueId(),
    schedule: 'Daily at approximately 4:00 AM'
  };
}

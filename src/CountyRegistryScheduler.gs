/**
 * REOS Enterprise
 * Scheduled County Registry Verification
 */
var REOS = REOS || {};

function REOS_COUNTY_SCHEDULED_VERIFY() {
  REOS_COUNTY_REGISTER_CONNECTORS_();

  var connectors =
    REOS.CountyConnectorSDK.list();

  var results = [];

  connectors.forEach(function (connector) {
    if (connector.enabled === false) {
      return;
    }

    var registeredConnector =
      REOS.CountyConnectorSDK.get(connector.id);

    (connector.datasets || []).forEach(
      function (dataset) {
        var datasetDefinition =
          registeredConnector &&
          registeredConnector.datasetDefinitions
            ? registeredConnector.datasetDefinitions[dataset]
            : null;

        if (
          datasetDefinition &&
          datasetDefinition.enabled === false
        ) {
          results.push({
            connectorId: connector.id,
            dataset: dataset,
            ok: true,
            skipped: true,
            status: 'DISABLED',
            message: 'Dataset intentionally disabled.'
          });

          return;
        }

        try {
          var result =
            REOS.CountyConnectorSDK.run(
              connector.id,
              {
                dataset: dataset,
                limit: 10,
                dryRun: true
              }
            );

          results.push({
            connectorId: connector.id,
            dataset: dataset,
            ok:
              result &&
              result.ok === true &&
              result.stats &&
              Number(
                result.stats.failed || 0
              ) === 0,
            stats:
              result && result.stats
                ? result.stats
                : null,
            runId:
              result && result.runId
                ? result.runId
                : ''
          });
        } catch (error) {
          var message =
            error && error.message
              ? error.message
              : String(error);

          if (
            message.indexOf(
              'Dataset is disabled for'
            ) !== -1
          ) {
            results.push({
              connectorId: connector.id,
              dataset: dataset,
              ok: true,
              skipped: true,
              status: 'DISABLED',
              message: message
            });

            return;
          }

          results.push({
            connectorId: connector.id,
            dataset: dataset,
            ok: false,
            error: String(error),
            message: message
          });
        }
      }
    );
  });

  var summary = {
    checkedAt: new Date().toISOString(),
    connectorCount: connectors.length,
    datasetCount: results.length,
    passed: results.filter(function (result) {
      return result.ok === true;
    }).length,
    failed: results.filter(function (result) {
      return result.ok !== true;
    }).length,
    results: results
  };

  PropertiesService
    .getScriptProperties()
    .setProperty(
      'REOS_COUNTY_LAST_SCHEDULED_VERIFY',
      JSON.stringify(summary)
    );

  return summary;
}

function REOS_COUNTY_GET_SCHEDULED_VERIFY_STATUS() {
  var raw = PropertiesService
    .getScriptProperties()
    .getProperty(
      'REOS_COUNTY_LAST_SCHEDULED_VERIFY'
    );

  return raw
    ? JSON.parse(raw)
    : {
        checkedAt: '',
        datasetCount: 0,
        passed: 0,
        failed: 0,
        results: []
      };
}

function REOS_COUNTY_INSTALL_VERIFY_TRIGGER() {
  var functionName =
    'REOS_COUNTY_SCHEDULED_VERIFY';

  ScriptApp
    .getProjectTriggers()
    .forEach(function (trigger) {
      if (
        trigger.getHandlerFunction() ===
        functionName
      ) {
        ScriptApp.deleteTrigger(trigger);
      }
    });

  var trigger = ScriptApp
    .newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();

  return {
    ok: true,
    handler: functionName,
    triggerId:
      trigger.getUniqueId(),
    schedule:
      'Daily at approximately 3:00 AM'
  };
}

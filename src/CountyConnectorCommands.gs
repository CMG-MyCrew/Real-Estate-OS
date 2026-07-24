/**
 * REOS Enterprise v4.5.0 - County Connector Commands
 * Public Apps Script entry points for setup, inspection, dry runs, and live syncs.
 */
var REOS = REOS || {};

function REOS_COUNTY_SETUP() {
  return REOS.CountyConnectorSDK.ensureInfrastructure();
}

function REOS_COUNTY_LIST() {
  return REOS.CountyConnectorSDK.list();
}

function REOS_COUNTY_DRY_RUN(connectorId, dataset, limit) {
  return REOS.CountyConnectorSDK.run(connectorId, {
    dataset: dataset,
    limit: Number(limit || 100),
    dryRun: true
  });
}

function REOS_COUNTY_SYNC(connectorId, dataset, limit, cursor) {
  return REOS.CountyConnectorSDK.run(connectorId, {
    dataset: dataset,
    limit: Number(limit || 500),
    cursor: cursor || '',
    dryRun: false
  });
}

function REOS_COUNTY_SYNC_ALL_DRY_RUN() {
  return REOS.CountyConnectorSDK.runAll({ dryRun: true, limit: 100 });
}

function REOS_COUNTY_SYNC_ALL() {
  return REOS.CountyConnectorSDK.runAll({ dryRun: false, limit: 500 });
}

function REOS_COUNTY_INSTALL_DAILY_TRIGGER() {
  var functionName = 'REOS_COUNTY_SYNC_ALL';
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === functionName) ScriptApp.deleteTrigger(trigger);
  });
  var trigger = ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(4)
    .create();
  return { ok: true, handler: functionName, triggerId: trigger.getUniqueId(), schedule: 'Daily at approximately 4:00 AM' };
}

/**
 * REOS Enterprise v3.5.1
 * Unique public entry points for the Distress Intelligence engine.
 * Prevents collisions with the legacy AcquisitionIntelligence modules.
 */

function reosDistressIntelligenceEnsureSheets() {
  return REOS.AcquisitionDistressIntelligence.ensureSheets();
}

function reosDistressIntelligenceRun() {
  return REOS.AcquisitionDistressIntelligence.run({});
}

function reosDistressIntelligenceScheduledRun() {
  return REOS.AcquisitionDistressIntelligence.run({
    source: 'hourly-trigger'
  });
}

function reosDistressIntelligenceMergePhiladelphiaDataset(datasetType, rows, options) {
  return REOS.AcquisitionDistressIntelligence.mergeDataset(
    datasetType,
    rows,
    options || {}
  );
}

function reosDistressIntelligenceInstallTrigger() {
  reosDistressIntelligenceRemoveTriggers();

  var trigger = ScriptApp.newTrigger('reosDistressIntelligenceScheduledRun')
    .timeBased()
    .everyHours(1)
    .create();

  return {
    ok: true,
    handler: 'reosDistressIntelligenceScheduledRun',
    triggerId: trigger.getUniqueId(),
    cadence: 'HOURLY'
  };
}

function reosDistressIntelligenceRemoveTriggers() {
  var handler = 'reosDistressIntelligenceScheduledRun';
  var removed = 0;

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  return {
    ok: true,
    handler: handler,
    removed: removed
  };
}

function reosDistressIntelligenceSummary() {
  return REOS.AcquisitionDistressIntelligence.summary();
}

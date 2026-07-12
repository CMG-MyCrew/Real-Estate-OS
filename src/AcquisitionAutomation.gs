/**
 * REOS Enterprise v4.2.3 - Acquisition Automation
 * Sprint 7.1 Increment 4: scheduled connector-to-intelligence execution.
 */
var REOS = REOS || {};

REOS.AcquisitionAutomation = (function () {
  var HANDLER = 'reosAcquisitionAutomationDailyRun';
  var PROPERTY = 'REOS_ACQUISITION_AUTOMATION_OPTIONS';

  function installTrigger(hour, options) {
    hour = Math.max(0, Math.min(23, Number(hour == null ? 7 : hour)));
    removeTrigger();
    setOptions(options || {});
    ScriptApp.newTrigger(HANDLER)
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .create();
    return {
      ok: true,
      handler: HANDLER,
      hour: hour,
      options: getOptions()
    };
  }

  function removeTrigger() {
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === HANDLER) {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });
    return { ok: true, handler: HANDLER, removed: removed };
  }

  function runNow(overrides) {
    if (!REOS.AcquisitionIngestionOrchestrator) {
      throw new Error('AcquisitionIngestionOrchestrator.gs is required.');
    }
    var options = Object.assign({}, getOptions(), overrides || {});
    return REOS.AcquisitionIngestionOrchestrator.run(options);
  }

  function setOptions(options) {
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
    PropertiesService.getScriptProperties().setProperty(PROPERTY, JSON.stringify(options));
    return { ok: true, options: options };
  }

  function getOptions() {
    var raw = PropertiesService.getScriptProperties().getProperty(PROPERTY);
    if (!raw) return setOptions({}).options;
    try { return JSON.parse(raw); }
    catch (error) { return setOptions({}).options; }
  }

  function status() {
    var triggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === HANDLER;
    });
    return {
      ok: true,
      installed: triggers.length > 0,
      triggerCount: triggers.length,
      handler: HANDLER,
      options: getOptions(),
      ingestionSummary: REOS.AcquisitionIngestionOrchestrator
        ? REOS.AcquisitionIngestionOrchestrator.summary(5)
        : null
    };
  }

  return {
    installTrigger: installTrigger,
    removeTrigger: removeTrigger,
    runNow: runNow,
    setOptions: setOptions,
    getOptions: getOptions,
    status: status
  };
})();

function reosAcquisitionAutomationInstallTrigger(hour, options) {
  return REOS.AcquisitionAutomation.installTrigger(hour, options);
}
function reosAcquisitionAutomationRemoveTrigger() {
  return REOS.AcquisitionAutomation.removeTrigger();
}
function reosAcquisitionAutomationSetOptions(options) {
  return REOS.AcquisitionAutomation.setOptions(options);
}
function reosAcquisitionAutomationGetOptions() {
  return REOS.AcquisitionAutomation.getOptions();
}
function reosAcquisitionAutomationStatus() {
  return REOS.AcquisitionAutomation.status();
}
function reosAcquisitionAutomationRunNow(overrides) {
  return REOS.AcquisitionAutomation.runNow(overrides);
}
function reosAcquisitionAutomationDailyRun() {
  return REOS.AcquisitionAutomation.runNow();
}

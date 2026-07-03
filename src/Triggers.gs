/**
 * REOS Enterprise v3.0 - Trigger Management Framework
 *
 * Installs and removes Apps Script time-based triggers.
 */

var REOS = REOS || {};

REOS.Triggers = (function () {
  function installDailyAutomationTrigger() {
    REOS.Security.requirePermission('finance:write');
    removeTriggerByFunction_('automationDailyRun');
    ScriptApp.newTrigger('automationDailyRun')
      .timeBased()
      .everyDays(1)
      .atHour(7)
      .create();
    REOS.Logger.audit('Daily automation trigger installed', { functionName: 'automationDailyRun' });
    return true;
  }

  function installDailyDigestTrigger() {
    REOS.Security.requirePermission('finance:write');
    removeTriggerByFunction_('notificationsDailyDigest');
    ScriptApp.newTrigger('notificationsDailyDigest')
      .timeBased()
      .everyDays(1)
      .atHour(8)
      .create();
    REOS.Logger.audit('Daily digest trigger installed', { functionName: 'notificationsDailyDigest' });
    return true;
  }

  function installAll() {
    return {
      automation: installDailyAutomationTrigger(),
      digest: installDailyDigestTrigger()
    };
  }

  function removeAll() {
    REOS.Security.requirePermission('finance:write');
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
    REOS.Logger.audit('All triggers removed', { count: triggers.length });
    return triggers.length;
  }

  function list() {
    return ScriptApp.getProjectTriggers().map(function (trigger) {
      return {
        functionName: trigger.getHandlerFunction(),
        eventType: String(trigger.getEventType()),
        source: String(trigger.getTriggerSource())
      };
    });
  }

  function removeTriggerByFunction_(functionName) {
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === functionName) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
  }

  return {
    installDailyAutomationTrigger: installDailyAutomationTrigger,
    installDailyDigestTrigger: installDailyDigestTrigger,
    installAll: installAll,
    removeAll: removeAll,
    list: list
  };
})();

function triggersInstallAll() {
  return REOS.Triggers.installAll();
}

function triggersRemoveAll() {
  return REOS.Triggers.removeAll();
}

function triggersList() {
  return REOS.Triggers.list();
}

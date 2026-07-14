/**
 * REOS Enterprise v4.3.0
 * Sprint 7.2 — Scheduled Acquisition Intelligence
 */
var REOS = REOS || {};

REOS.AcquisitionIntelligenceAutomation = (function () {
  var HANDLER =
    'reosAcquisitionIntelligenceDailyRun';

  function run(options) {
    options = Object.assign({
      generateOffers: true,
      minimumScore: 70,
      maxDrafts: 25
    }, options || {});

    if (!REOS.AcquisitionIntelligence) {
      throw new Error(
        'AcquisitionIntelligence.gs is required.'
      );
    }

    var intelligence =
      REOS.AcquisitionIntelligence.analyzeAll(options);

    var offers = {
      ok: true,
      created: 0,
      skipped: 0
    };

    if (
      options.generateOffers &&
      REOS.AcquisitionOfferAutomation
    ) {
      offers =
        REOS.AcquisitionOfferAutomation.generateDrafts({
          minimumScore: options.minimumScore,
          maxDrafts: options.maxDrafts
        });
    }

    return {
      ok: intelligence.ok && offers.ok,
      intelligence: intelligence,
      offers: offers,
      generatedAt: new Date().toISOString()
    };
  }

  function installTrigger(hour) {
    hour = Number(hour == null ? 8 : hour);

    if (isNaN(hour)) hour = 8;

    hour = Math.max(0, Math.min(23, hour));

    removeTrigger();

    ScriptApp.newTrigger(HANDLER)
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .create();

    return {
      ok: true,
      handler: HANDLER,
      hour: hour
    };
  }

  function removeTrigger() {
    var removed = 0;

    ScriptApp.getProjectTriggers().forEach(
      function (trigger) {
        if (
          trigger.getHandlerFunction() === HANDLER
        ) {
          ScriptApp.deleteTrigger(trigger);
          removed++;
        }
      }
    );

    return {
      ok: true,
      removed: removed,
      handler: HANDLER
    };
  }

  function status() {
    var triggers =
      ScriptApp.getProjectTriggers().filter(
        function (trigger) {
          return (
            trigger.getHandlerFunction() === HANDLER
          );
        }
      );

    return {
      ok: true,
      installed: triggers.length > 0,
      triggerCount: triggers.length,
      handler: HANDLER,
      intelligence:
        REOS.AcquisitionIntelligence
          ? REOS.AcquisitionIntelligence.summary(10)
          : null,
      offers:
        REOS.AcquisitionOfferAutomation
          ? REOS.AcquisitionOfferAutomation.summary()
          : null
    };
  }

  return {
    run: run,
    installTrigger: installTrigger,
    removeTrigger: removeTrigger,
    status: status
  };
})();

function reosAcquisitionIntelligenceDailyRun() {
  return REOS.AcquisitionIntelligenceAutomation.run();
}

function reosAcquisitionIntelligenceRunNow(options) {
  return REOS.AcquisitionIntelligenceAutomation.run(
    options
  );
}

function reosAcquisitionIntelligenceInstallTrigger(hour) {
  return REOS.AcquisitionIntelligenceAutomation
    .installTrigger(hour);
}

function reosAcquisitionIntelligenceRemoveTrigger() {
  return REOS.AcquisitionIntelligenceAutomation
    .removeTrigger();
}

function reosAcquisitionIntelligenceAutomationStatus() {
  return REOS.AcquisitionIntelligenceAutomation.status();
}
EOFcat > AcquisitionIntelligenceAutomation.gs <<'EOF'
/**
 * REOS Enterprise v4.3.0
 * Sprint 7.2 — Scheduled Acquisition Intelligence
 */
var REOS = REOS || {};

REOS.AcquisitionIntelligenceAutomation = (function () {
  var HANDLER =
    'reosAcquisitionIntelligenceDailyRun';

  function run(options) {
    options = Object.assign({
      generateOffers: true,
      minimumScore: 70,
      maxDrafts: 25
    }, options || {});

    if (!REOS.AcquisitionIntelligence) {
      throw new Error(
        'AcquisitionIntelligence.gs is required.'
      );
    }

    var intelligence =
      REOS.AcquisitionIntelligence.analyzeAll(options);

    var offers = {
      ok: true,
      created: 0,
      skipped: 0
    };

    if (
      options.generateOffers &&
      REOS.AcquisitionOfferAutomation
    ) {
      offers =
        REOS.AcquisitionOfferAutomation.generateDrafts({
          minimumScore: options.minimumScore,
          maxDrafts: options.maxDrafts
        });
    }

    return {
      ok: intelligence.ok && offers.ok,
      intelligence: intelligence,
      offers: offers,
      generatedAt: new Date().toISOString()
    };
  }

  function installTrigger(hour) {
    hour = Number(hour == null ? 8 : hour);

    if (isNaN(hour)) hour = 8;

    hour = Math.max(0, Math.min(23, hour));

    removeTrigger();

    ScriptApp.newTrigger(HANDLER)
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .create();

    return {
      ok: true,
      handler: HANDLER,
      hour: hour
    };
  }

  function removeTrigger() {
    var removed = 0;

    ScriptApp.getProjectTriggers().forEach(
      function (trigger) {
        if (
          trigger.getHandlerFunction() === HANDLER
        ) {
          ScriptApp.deleteTrigger(trigger);
          removed++;
        }
      }
    );

    return {
      ok: true,
      removed: removed,
      handler: HANDLER
    };
  }

  function status() {
    var triggers =
      ScriptApp.getProjectTriggers().filter(
        function (trigger) {
          return (
            trigger.getHandlerFunction() === HANDLER
          );
        }
      );

    return {
      ok: true,
      installed: triggers.length > 0,
      triggerCount: triggers.length,
      handler: HANDLER,
      intelligence:
        REOS.AcquisitionIntelligence
          ? REOS.AcquisitionIntelligence.summary(10)
          : null,
      offers:
        REOS.AcquisitionOfferAutomation
          ? REOS.AcquisitionOfferAutomation.summary()
          : null
    };
  }

  return {
    run: run,
    installTrigger: installTrigger,
    removeTrigger: removeTrigger,
    status: status
  };
})();

function reosAcquisitionIntelligenceDailyRun() {
  return REOS.AcquisitionIntelligenceAutomation.run();
}

function reosAcquisitionIntelligenceRunNow(options) {
  return REOS.AcquisitionIntelligenceAutomation.run(
    options
  );
}

function reosAcquisitionIntelligenceInstallTrigger(hour) {
  return REOS.AcquisitionIntelligenceAutomation
    .installTrigger(hour);
}

function reosAcquisitionIntelligenceRemoveTrigger() {
  return REOS.AcquisitionIntelligenceAutomation
    .removeTrigger();
}

function reosAcquisitionIntelligenceAutomationStatus() {
  return REOS.AcquisitionIntelligenceAutomation.status();
}
EOFcat > AcquisitionIntelligenceAutomation.gs <<'EOF'
/**
 * REOS Enterprise v4.3.0
 * Sprint 7.2 — Scheduled Acquisition Intelligence
 */
var REOS = REOS || {};

REOS.AcquisitionIntelligenceAutomation = (function () {
  var HANDLER =
    'reosAcquisitionIntelligenceDailyRun';

  function run(options) {
    options = Object.assign({
      generateOffers: true,
      minimumScore: 70,
      maxDrafts: 25
    }, options || {});

    if (!REOS.AcquisitionIntelligence) {
      throw new Error(
        'AcquisitionIntelligence.gs is required.'
      );
    }

    var intelligence =
      REOS.AcquisitionIntelligence.analyzeAll(options);

    var offers = {
      ok: true,
      created: 0,
      skipped: 0
    };

    if (
      options.generateOffers &&
      REOS.AcquisitionOfferAutomation
    ) {
      offers =
        REOS.AcquisitionOfferAutomation.generateDrafts({
          minimumScore: options.minimumScore,
          maxDrafts: options.maxDrafts
        });
    }

    return {
      ok: intelligence.ok && offers.ok,
      intelligence: intelligence,
      offers: offers,
      generatedAt: new Date().toISOString()
    };
  }

  function installTrigger(hour) {
    hour = Number(hour == null ? 8 : hour);

    if (isNaN(hour)) hour = 8;

    hour = Math.max(0, Math.min(23, hour));

    removeTrigger();

    ScriptApp.newTrigger(HANDLER)
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .create();

    return {
      ok: true,
      handler: HANDLER,
      hour: hour
    };
  }

  function removeTrigger() {
    var removed = 0;

    ScriptApp.getProjectTriggers().forEach(
      function (trigger) {
        if (
          trigger.getHandlerFunction() === HANDLER
        ) {
          ScriptApp.deleteTrigger(trigger);
          removed++;
        }
      }
    );

    return {
      ok: true,
      removed: removed,
      handler: HANDLER
    };
  }

  function status() {
    var triggers =
      ScriptApp.getProjectTriggers().filter(
        function (trigger) {
          return (
            trigger.getHandlerFunction() === HANDLER
          );
        }
      );

    return {
      ok: true,
      installed: triggers.length > 0,
      triggerCount: triggers.length,
      handler: HANDLER,
      intelligence:
        REOS.AcquisitionIntelligence
          ? REOS.AcquisitionIntelligence.summary(10)
          : null,
      offers:
        REOS.AcquisitionOfferAutomation
          ? REOS.AcquisitionOfferAutomation.summary()
          : null
    };
  }

  return {
    run: run,
    installTrigger: installTrigger,
    removeTrigger: removeTrigger,
    status: status
  };
})();

function reosAcquisitionIntelligenceDailyRun() {
  return REOS.AcquisitionIntelligenceAutomation.run();
}

function reosAcquisitionIntelligenceRunNow(options) {
  return REOS.AcquisitionIntelligenceAutomation.run(
    options
  );
}

function reosAcquisitionIntelligenceInstallTrigger(hour) {
  return REOS.AcquisitionIntelligenceAutomation
    .installTrigger(hour);
}

function reosAcquisitionIntelligenceRemoveTrigger() {
  return REOS.AcquisitionIntelligenceAutomation
    .removeTrigger();
}

function reosAcquisitionIntelligenceAutomationStatus() {
  return REOS.AcquisitionIntelligenceAutomation.status();
}

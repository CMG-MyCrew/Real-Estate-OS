/**
 * REOS Enterprise v4.5.0
 * Sprint 7.3 Increment 3.3.5 - Autonomous Offer Pipeline
 *
 * Advances the staged live pipeline one stage per execution and automatically
 * runs offer diagnostics as lifecycle IDs become available. Uses a time-driven
 * trigger to avoid Apps Script maximum execution-time failures.
 */
var REOS = REOS || {};

REOS.AutonomousOfferPipeline = (function () {
  var STATE_KEY = 'REOS_AUTONOMOUS_OFFER_PIPELINE_V1';
  var LIVE_STATE_KEY = 'REOS_LIVE_PIPELINE_STATE_V2';
  var TRIGGER_HANDLER = 'reosAutonomousOfferPipelineTick';
  var LOG_SHEET = 'AUTONOMOUS_OFFER_PIPELINE_LOG';

  var LOG_HEADERS = [
    'Autonomous Log ID','Autonomous Run ID','Live Run ID','Event','Status',
    'Completed Stages','Total Stages','Decision ID','Offer Queue ID','Review ID',
    'Offer ID','Execution ID','Diagnostics JSON','Message','Created At','Created By'
  ];

  function ensureSheet() {
    requireDatabase_();
    REOS.Database.ensureTable(LOG_SHEET, LOG_HEADERS);
    return { ok: true, sheet: LOG_SHEET };
  }

  function start(options) {
    ensureSheet();
    options = Object.assign({
      resetLivePipeline: true,
      installTrigger: true,
      triggerMinutes: 1,
      runImmediately: true
    }, options || {});

    stopTriggers_();

    if (!REOS.LivePipelineVerification) {
      throw new Error('LivePipelineVerification.gs is required.');
    }

    if (options.resetLivePipeline) {
      REOS.LivePipelineVerification.reset();
    }

    var live = REOS.LivePipelineVerification.start();
    var state = {
      version: '4.5.0',
      autonomousRunId: 'AOP-' + Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone() || 'America/New_York',
        'yyyyMMdd-HHmmss'
      ) + '-' + Utilities.getUuid().slice(0, 8),
      status: 'Running',
      startedAt: new Date().toISOString(),
      completedAt: '',
      ticks: 0,
      lastCompletedStages: Number(live.completedStages || 0),
      lastDiagnostics: {},
      error: ''
    };

    saveState_(state);
    log_('AUTONOMOUS_STARTED', state, live, {}, 'Autonomous offer pipeline started.');

    if (options.installTrigger) {
      ScriptApp.newTrigger(TRIGGER_HANDLER)
        .timeBased()
        .everyMinutes(Math.max(1, Number(options.triggerMinutes || 1)))
        .create();
    }

    if (options.runImmediately) {
      return tick();
    }

    return status();
  }

  function tick() {
    ensureSheet();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return { ok: false, status: 'Busy', message: 'Another autonomous tick is running.' };
    }

    try {
      var state = loadState_();
      if (!state) {
        return { ok: false, status: 'Not Started', message: 'Run reosAutonomousOfferPipelineStart() first.' };
      }

      if (state.status !== 'Running') {
        return status();
      }

      state.ticks = Number(state.ticks || 0) + 1;

      var before = REOS.LivePipelineVerification.status();
      var after = before;

      if (before.status === 'In Progress') {
        REOS.LivePipelineVerification.runNextStage();
        after = REOS.LivePipelineVerification.status();
      }

      var diagnostics = runDiagnostics_(after);
      state.lastCompletedStages = Number(after.completedStages || 0);
      state.lastDiagnostics = diagnostics;

      if (after.status === 'Verified' || after.status === 'Needs Attention') {
        state.status = after.status === 'Verified' ? 'Completed' : 'Completed With Issues';
        state.completedAt = new Date().toISOString();
        stopTriggers_();
        log_('AUTONOMOUS_COMPLETED', state, after, diagnostics,
          'Live pipeline completed with status: ' + after.status + '.');
      } else {
        log_('AUTONOMOUS_TICK', state, after, diagnostics,
          'Advanced live pipeline to completedStages=' + Number(after.completedStages || 0) + '.');
      }

      saveState_(state);
      return response_(state, after, diagnostics);
    } catch (error) {
      var failedState = loadState_() || {};
      failedState.status = 'Error';
      failedState.error = error.message || String(error);
      failedState.completedAt = new Date().toISOString();
      saveState_(failedState);
      stopTriggers_();
      log_('AUTONOMOUS_ERROR', failedState, safeLiveStatus_(), {}, failedState.error);
      throw error;
    } finally {
      lock.releaseLock();
    }
  }

  function runToCompletion(options) {
    options = Object.assign({ maxTicks: 12 }, options || {});
    var output = status();
    for (var i = 0; i < Number(options.maxTicks || 12); i++) {
      if (output.status !== 'Running') break;
      output = tick();
      Utilities.sleep(250);
    }
    return output;
  }

  function runDiagnostics_(live) {
    var completed = Number(live.completedStages || 0);
    var diagnostics = {};

    if (completed >= 3) {
      diagnostics.instrumentation = invokeSafe_(
        REOS.OfferModuleInstrumentation,
        'inspect',
        [{ runId: live.runId, leadId: live.leadId }]
      );
    }

    if (completed >= 5) {
      diagnostics.correlation = invokeSafe_(
        REOS.OfferRecordCorrelation,
        'run',
        [{ runId: live.runId, leadId: live.leadId }]
      );
    }

    if (completed >= 9 || live.status === 'Verified' || live.status === 'Needs Attention') {
      diagnostics.validation = invokeSafe_(
        REOS.OfferExecutionDataValidation,
        'run',
        [{ runId: live.runId, leadId: live.leadId }]
      );
    }

    return diagnostics;
  }

  function status() {
    var state = loadState_();
    var live = safeLiveStatus_();
    if (!state) {
      return {
        ok: true,
        active: false,
        status: 'Not Started',
        livePipeline: live,
        nextAction: 'Run reosAutonomousOfferPipelineStart().'
      };
    }
    return response_(state, live, state.lastDiagnostics || {});
  }

  function stop() {
    stopTriggers_();
    var state = loadState_() || {};
    state.status = 'Stopped';
    state.completedAt = new Date().toISOString();
    saveState_(state);
    log_('AUTONOMOUS_STOPPED', state, safeLiveStatus_(), state.lastDiagnostics || {},
      'Autonomous offer pipeline stopped manually.');
    return status();
  }

  function reset() {
    stopTriggers_();
    PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
    return { ok: true, status: 'Reset', message: 'Autonomous offer pipeline state cleared.' };
  }

  function response_(state, live, diagnostics) {
    return {
      ok: state.status !== 'Error' && state.status !== 'Completed With Issues',
      active: state.status === 'Running',
      version: state.version || '4.5.0',
      autonomousRunId: state.autonomousRunId || '',
      status: state.status || 'Unknown',
      ticks: Number(state.ticks || 0),
      startedAt: state.startedAt || '',
      completedAt: state.completedAt || '',
      error: state.error || '',
      livePipeline: live,
      diagnostics: diagnostics || {},
      triggerInstalled: hasTrigger_(),
      nextAction: state.status === 'Running'
        ? 'Wait for the next trigger or run reosAutonomousOfferPipelineTick().' 
        : 'Run reosAutonomousOfferPipelineStart() to begin a new autonomous run.'
    };
  }

  function log_(event, state, live, diagnostics, message) {
    try {
      ensureSheet();
      REOS.Database.insert(LOG_SHEET, {
        'Autonomous Run ID': state.autonomousRunId || '',
        'Live Run ID': live.runId || '',
        Event: event,
        Status: state.status || live.status || '',
        'Completed Stages': Number(live.completedStages || 0),
        'Total Stages': Number(live.totalStages || 0),
        'Decision ID': live.decisionId || '',
        'Offer Queue ID': live.offerQueueId || '',
        'Review ID': live.reviewId || '',
        'Offer ID': live.offerId || '',
        'Execution ID': live.executionId || '',
        'Diagnostics JSON': safeJson_(diagnostics || {}),
        Message: message || '',
        'Created At': new Date(),
        'Created By': currentUser_()
      }, { idField: 'Autonomous Log ID', idPrefix: 'AOPLOG' });
    } catch (ignored) {}
  }

  function invokeSafe_(module, method, args) {
    try {
      if (!module || typeof module[method] !== 'function') {
        return { ok: false, skipped: true, reason: 'METHOD_UNAVAILABLE', method: method };
      }
      return module[method].apply(module, args || []);
    } catch (error) {
      return { ok: false, error: error.message || String(error), method: method };
    }
  }

  function safeLiveStatus_() {
    try {
      return REOS.LivePipelineVerification &&
        typeof REOS.LivePipelineVerification.status === 'function'
        ? REOS.LivePipelineVerification.status()
        : { status: 'Unavailable' };
    } catch (error) {
      return { status: 'Error', error: error.message || String(error) };
    }
  }

  function stopTriggers_() {
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === TRIGGER_HANDLER) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
  }

  function hasTrigger_() {
    return ScriptApp.getProjectTriggers().some(function (trigger) {
      return trigger.getHandlerFunction() === TRIGGER_HANDLER;
    });
  }

  function loadState_() {
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveState_(state) {
    PropertiesService.getScriptProperties().setProperty(STATE_KEY, JSON.stringify(state || {}));
  }

  function safeJson_(value) {
    try { return JSON.stringify(value === undefined ? null : value); }
    catch (error) { return JSON.stringify({ error: 'Unable to serialize value.' }); }
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || ''; }
    catch (error) { return ''; }
  }

  function requireDatabase_() {
    if (!REOS.Database) throw new Error('Database.gs is required.');
  }

  return {
    ensureSheet: ensureSheet,
    start: start,
    tick: tick,
    runToCompletion: runToCompletion,
    status: status,
    stop: stop,
    reset: reset
  };
})();

function reosAutonomousOfferPipelineEnsureSheet() {
  return REOS.AutonomousOfferPipeline.ensureSheet();
}

function reosAutonomousOfferPipelineStart(options) {
  return REOS.AutonomousOfferPipeline.start(options);
}

function reosAutonomousOfferPipelineTick() {
  return REOS.AutonomousOfferPipeline.tick();
}

function reosAutonomousOfferPipelineRunToCompletion(options) {
  return REOS.AutonomousOfferPipeline.runToCompletion(options);
}

function reosAutonomousOfferPipelineStatus() {
  return REOS.AutonomousOfferPipeline.status();
}

function reosAutonomousOfferPipelineStop() {
  return REOS.AutonomousOfferPipeline.stop();
}

function reosAutonomousOfferPipelineReset() {
  return REOS.AutonomousOfferPipeline.reset();
}

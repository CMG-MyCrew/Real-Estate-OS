/**
 * REOS Enterprise | Maryland six-hour county scheduler | STAGED ONLY
 *
 * All operations are Maryland-scoped.  Importing this file installs no trigger,
 * makes no remote request and does not change existing Pennsylvania schedulers.
 * SDK.run(dryRun:true) STILL WRITES COUNTY_CONNECTOR_RUNS audit rows; therefore
 * even audited dry runs require an explicit property gate.
 */
var REOS = REOS || {};

REOS.MDSixHourCountyScheduler = (function () {
  var PREFIX = 'REOS_MD_6H_V1_';
  var SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  var PAGE_LIMIT = 100;
  var MAX_PAGES_PER_TICK = 8;
  var MAX_RUNTIME_MS = 180000;
  var DATASET = 'property_assessment';
  var IDS = [
    'MD-ALLEGANY', 'MD-ANNE-ARUNDEL', 'MD-BALTIMORE-CITY',
    'MD-BALTIMORE', 'MD-CALVERT', 'MD-CAROLINE', 'MD-CARROLL',
    'MD-CECIL', 'MD-CHARLES', 'MD-DORCHESTER', 'MD-FREDERICK',
    'MD-GARRETT', 'MD-HARFORD', 'MD-HOWARD', 'MD-KENT',
    'MD-MONTGOMERY', 'MD-PRINCE-GEORGE-S', 'MD-QUEEN-ANNE-S',
    'MD-SOMERSET', 'MD-ST-MARY-S', 'MD-TALBOT', 'MD-WASHINGTON',
    'MD-WICOMICO', 'MD-WORCESTER'
  ];

  function property_(name) {
    return PropertiesService.getScriptProperties().getProperty(name);
  }

  function read_(id) {
    var raw = property_(PREFIX + 'CP_' + id + '_' + DATASET.toUpperCase());
    if (!raw) return null;
    try {
      var value = JSON.parse(raw);
      if (!value || value.connectorId !== id || value.dataset !== DATASET ||
          !/^(ACTIVE|COMPLETE|BLOCKED)$/.test(value.status)) {
        return { connectorId: id, dataset: DATASET, status: 'BLOCKED',
          error: 'Invalid checkpoint format; manual review required.' };
      }
      return value;
    } catch (error) {
      return { connectorId: id, dataset: DATASET, status: 'BLOCKED',
        error: 'Unreadable checkpoint; manual review required.' };
    }
  }

  function save_(id, value) {
    PropertiesService.getScriptProperties().setProperty(
      PREFIX + 'CP_' + id + '_' + DATASET.toUpperCase(),
      JSON.stringify(value)
    );
  }

  function cycle_(date) {
    return new Date(Math.floor(date.getTime() / SIX_HOURS_MS) * SIX_HOURS_MS)
      .toISOString();
  }

  function ensureRegistered_() {
    if (typeof REOS_COUNTY_REGISTER_CONNECTORS_ !== 'function' ||
        !REOS.CountyConnectorSDK ||
        typeof REOS.CountyConnectorSDK.list !== 'function') {
      throw new Error('REOS county SDK/registrars unavailable; Maryland fail-closed.');
    }
    REOS_COUNTY_REGISTER_CONNECTORS_();
    var all = REOS.CountyConnectorSDK.list();
    var md = all.filter(function (x) { return x.state === 'MD'; });
    var actual = md.map(function (x) { return x.id; }).sort();
    var expected = IDS.slice().sort();
    if (actual.length !== 24 || actual.join('|') !== expected.join('|')) {
      throw new Error('Maryland registration coverage mismatch: expected 24 exact IDs.');
    }
    IDS.forEach(function (id) {
      var item = REOS.CountyConnectorSDK.get(id);
      if (!item || item.id !== id || item.state !== 'MD' ||
          item.enabled === false || !Array.isArray(item.datasets) ||
          item.datasets.indexOf(DATASET) === -1) {
        throw new Error('Maryland connector unavailable/disabled: ' + id);
      }
    });
  }

  function mode_() {
    if (property_(PREFIX + 'ENABLED') !== 'YES' ||
        property_(PREFIX + 'EXECUTION_APPROVED') !== 'YES') {
      return 'DISABLED';
    }
    var desired = property_(PREFIX + 'MODE');
    if (desired === 'AUDITED_DRY_RUN') {
      return property_(PREFIX + 'AUDIT_WRITE_APPROVED') === 'YES'
        ? 'AUDITED_DRY_RUN' : 'DISABLED';
    }
    if (desired === 'LIVE') {
      return property_(PREFIX + 'LIVE_PERSISTENCE_APPROVED') === 'YES' &&
        property_(PREFIX + 'SOURCE_IDENTITY_CERTIFIED') === 'YES' &&
        property_(PREFIX + 'AUDIT_WRITE_APPROVED') === 'YES'
          ? 'LIVE' : 'DISABLED';
    }
    return 'DISABLED';
  }

  function status(now) {
    var instant = now || new Date();
    return {
      handler: 'REOS_MD_SIX_HOUR_TICK',
      state: 'MD',
      schedule: 'six-hour UTC cycles with 15-minute backlog resume',
      currentCycle: cycle_(instant),
      executionMode: mode_(),
      expectedConnectors: IDS.length,
      perTickMaxPages: MAX_PAGES_PER_TICK,
      pageLimit: PAGE_LIMIT,
      jobs: IDS.map(function (id) {
        var cp = read_(id);
        return {
          connectorId: id,
          dataset: DATASET,
          status: cp ? cp.status : 'NOT_STARTED',
          cycle: cp ? cp.cycle : '',
          cursor: cp ? cp.cursor : '',
          lastSuccessAt: cp ? (cp.lastSuccessAt || '') : '',
          lastCompletedAt: cp ? (cp.lastCompletedAt || '') : '',
          error: cp ? (cp.error || '') : ''
        };
      })
    };
  }

  function certifiedResult_(r, id, requestedCursor) {
    if (!r || r.ok !== true || r.connectorId !== id ||
        r.dataset !== DATASET || !r.stats) {
      throw new Error('SDK response identity or success mismatch.');
    }
    var fetched = Number(r.stats.fetched);
    var valid = Number(r.stats.valid);
    var failed = Number(r.stats.failed || 0);
    if (!isFinite(fetched) || fetched < 0 || fetched > PAGE_LIMIT ||
        !isFinite(valid) || valid !== fetched || failed !== 0) {
      throw new Error('Incomplete page identity/validation coverage; checkpoint held.');
    }
    // SDK.run currently replaces empty nextCursor with the requested cursor.
    // Use count to detect the final page; require strictly advancing offsets on
    // full pages to avoid silently skipping or indefinitely replaying a page.
    var nextCursor = '';
    if (fetched === 0 && !String(requestedCursor || '')) {
      throw new Error('Empty first page; Maryland source coverage not verified.');
    }
    if (fetched === PAGE_LIMIT) {
      nextCursor = String(r.nextCursor || '');
      if (!/^\d+$/.test(nextCursor) ||
          Number(nextCursor) !== Number(requestedCursor || 0) + fetched) {
        throw new Error('Non-advancing/inconsistent ArcGIS cursor; checkpoint held.');
      }
    }
    return { fetched: fetched, nextCursor: nextCursor };
  }

  function tick(now) {
    var instant = now || new Date();
    var executionMode = mode_();
    if (executionMode === 'DISABLED') {
      return { ok: false, status: 'DISABLED_NO_WRITES', mode: executionMode };
    }
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) {
      return { ok: false, status: 'LOCKED_NO_WRITES' };
    }
    try {
      ensureRegistered_();  // Verify all 24 before any SDK audit or lead write.
      var start = Date.now();
      var cycle = cycle_(instant);
      var index = Number(property_(PREFIX + 'ROUND_ROBIN') || 0) % IDS.length;
      if (!isFinite(index) || index < 0 || Math.floor(index) !== index) index = 0;
      var count = 0;
      var processed = [];
      var attempts = 0;
      while (attempts < IDS.length && count < MAX_PAGES_PER_TICK &&
             Date.now() - start < MAX_RUNTIME_MS) {
        var id = IDS[(index + attempts) % IDS.length];
        attempts++;
        var prior = read_(id);
        if (prior && prior.status === 'BLOCKED') continue;
        if (prior && prior.status === 'COMPLETE' && prior.cycle === cycle) continue;
        var cp = prior && prior.status === 'ACTIVE' ? prior : {
          connectorId: id, dataset: DATASET, cycle: cycle,
          status: 'ACTIVE', cursor: '', pages: 0, records: 0
        };
        // Preserve an unfinished older cycle rather than resetting its cursor.
        var cursor = String(cp.cursor || '');
        try {
          var opts = { dataset: DATASET, limit: PAGE_LIMIT, cursor: cursor,
            dryRun: true };
          var preflight = REOS.CountyConnectorSDK.run(id, opts);
          var checked = certifiedResult_(preflight, id, cursor);
          var finalResult = preflight;
          if (executionMode === 'LIVE') {
            finalResult = REOS.CountyConnectorSDK.run(id, {
              dataset: DATASET, limit: PAGE_LIMIT, cursor: cursor, dryRun: false
            });
            var committed = certifiedResult_(finalResult, id, cursor);
            if (committed.fetched !== checked.fetched ||
                committed.nextCursor !== checked.nextCursor) {
              throw new Error('Preflight/live source page drift; checkpoint held.');
            }
          }
          cp.cursor = checked.nextCursor;
          cp.pages = Number(cp.pages || 0) + 1;
          cp.records = Number(cp.records || 0) + checked.fetched;
          cp.lastSuccessAt = instant.toISOString();
          cp.lastRunId = finalResult.runId || '';
          cp.error = '';
          if (!checked.nextCursor) {
            cp.status = 'COMPLETE';
            cp.lastCompletedAt = instant.toISOString();
          }
          save_(id, cp); // Commit checkpoint only after SDK & quality gates.
          processed.push({ id: id, status: cp.status, fetched: checked.fetched,
            cursor: cp.cursor });
        } catch (error) {
          cp.status = 'BLOCKED';
          cp.error = String(error && error.message || error).slice(0, 700);
          cp.failedAt = instant.toISOString();
          save_(id, cp); // Preserve cursor for independent review / replay.
          processed.push({ id: id, status: cp.status, cursor: cp.cursor,
            error: cp.error });
        }
        count++;
      }
      PropertiesService.getScriptProperties().setProperty(
        PREFIX + 'ROUND_ROBIN', String((index + attempts) % IDS.length)
      );
      return { ok: true, state: 'MD', mode: executionMode, cycle: cycle,
        processed: processed, pagesAttempted: count, scope: 'MARYLAND_ONLY' };
    } finally {
      lock.releaseLock();
    }
  }

  function installTriggers() {
    // This function is never invoked automatically.  ScriptApp writes require
    // a separate explicit approval (not implied by deployment of staged code).
    if (property_(PREFIX + 'TRIGGER_INSTALL_APPROVED') !== 'YES' ||
        property_(PREFIX + 'EXECUTION_APPROVED') !== 'YES' ||
        mode_() === 'DISABLED') {
      return { ok: false, status: 'TRIGGER_INSTALL_NOT_AUTHORIZED' };
    }
    var specifications = [
      { handler: 'REOS_MD_SIX_HOUR_TICK', hours: 6 },
      { handler: 'REOS_MD_SIX_HOUR_RESUME', minutes: 15 }
    ];
    var existing = ScriptApp.getProjectTriggers().map(function (trigger) {
      return trigger.getHandlerFunction();
    });
    var installed = [];
    specifications.forEach(function (spec) {
      if (existing.indexOf(spec.handler) !== -1) return;
      var builder = ScriptApp.newTrigger(spec.handler).timeBased();
      var trigger = spec.hours
        ? builder.everyHours(spec.hours).create()
        : builder.everyMinutes(spec.minutes).create();
      installed.push({ handler: spec.handler, id: trigger.getUniqueId() });
    });
    return { ok: true, installed: installed, scope: 'MARYLAND_ONLY' };
  }

  return { status: status, tick: tick, installTriggers: installTriggers };
})();

function REOS_MD_SIX_HOUR_STATUS() {
  return REOS.MDSixHourCountyScheduler.status();
}
function REOS_MD_SIX_HOUR_TICK() {
  return REOS.MDSixHourCountyScheduler.tick();
}
function REOS_MD_SIX_HOUR_RESUME() {
  return REOS.MDSixHourCountyScheduler.tick();
}
function REOS_MD_SIX_HOUR_INSTALL_TRIGGERS() {
  return REOS.MDSixHourCountyScheduler.installTriggers();
}

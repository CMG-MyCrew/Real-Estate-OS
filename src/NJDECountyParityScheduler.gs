/**
 * REOS Enterprise — NJ / DE County Scheduler, Philadelphia-Parity Shadow V1
 *
 * PURPOSE: construct the same five-feed, cursor/checkpoint, state-separated
 * scheduling contract used by the PA Philadelphia acquisition workflow.
 *
 * SAFETY: DO NOT deploy/merge as an authorization to install triggers.
 * All production entry points below are plan-only / deny-only.
 * The only page executor is an injected IN-MEMORY OFFLINE REHEARSAL.
 *
 * No calls to ScriptApp, PropertiesService, UrlFetchApp, REOS.Database,
 * CountyConnectorSDK.run(), or any other production writer.
 * NJ property assessments and DE parcel inventory are NOT distress feeds.
 */
var REOS = REOS || {};

REOS.NJDECountyParityScheduler = (function () {
  'use strict';

  var SCHEMA = 'REOS_NJ_DE_PA_PARITY_SHADOW_V1';
  var FEEDS = Object.freeze([
    'code_violations',
    'vacant_properties',
    'sheriff_tax_sales',
    'sheriff_mortgage_sales',
    'probate'
  ]);
  var NJ = Object.freeze([
    'ATLANTIC', 'BERGEN', 'BURLINGTON', 'CAMDEN', 'CAPE-MAY',
    'CUMBERLAND', 'ESSEX', 'GLOUCESTER', 'HUDSON', 'HUNTERDON',
    'MERCER', 'MIDDLESEX', 'MONMOUTH', 'MORRIS', 'OCEAN',
    'PASSAIC', 'SALEM', 'SOMERSET', 'SUSSEX', 'UNION', 'WARREN'
  ]);
  var DE = Object.freeze(['KENT', 'NEW-CASTLE', 'SUSSEX']);
  var STATES = Object.freeze({
    NJ: Object.freeze({
      counties: NJ,
      proposedHourLocal: 5,
      entrypoint: 'REOS_NJ_COUNTY_SCHEDULED_RUN',
      checkpoint: 'REOS_NJ_COUNTY_PARITY_SHADOW_CHECKPOINT_V1',
      audit: 'REOS_NJ_COUNTY_PARITY_SHADOW_AUDIT_V1',
      inventoryOnlyDataset: 'property_assessment'
    }),
    DE: Object.freeze({
      counties: DE,
      proposedHourLocal: 6,
      entrypoint: 'REOS_DE_COUNTY_SCHEDULED_RUN',
      checkpoint: 'REOS_DE_COUNTY_PARITY_SHADOW_CHECKPOINT_V1',
      audit: 'REOS_DE_COUNTY_PARITY_SHADOW_AUDIT_V1',
      inventoryOnlyDataset: 'parcel_inventory'
    })
  });
  var MAX_PAGE_SIZE = 100;
  var MAX_RETRIES = 3;
  var NO_CERT = 'HOLD_NO_CERTIFIED_DISTRESS_SOURCE';

  function state_(state) {
    var key = String(state || '').trim().toUpperCase();
    if (key !== 'NJ' && key !== 'DE') {
      throw new Error('NJ_DE_PARITY_INVALID_STATE');
    }
    return key;
  }

  function conf_(state) {
    return STATES[state_(state)];
  }

  function safeClone_(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function taskKey_(task) {
    return [task.state, task.countyId, task.feed].join('|');
  }

  function tasks_(state) {
    var st = state_(state);
    var result = [];
    conf_(st).counties.forEach(function (county) {
      FEEDS.forEach(function (feed) {
        result.push({
          state: st,
          countyId: st + '-' + county,
          feed: feed,
          sourceCertified: false,
          ingestionAuthorized: false,
          status: NO_CERT,
          destination: 'NO_PRODUCTION_DESTINATION'
        });
      });
    });
    return result;
  }

  function plan(state) {
    var st = state_(state);
    var cfg = conf_(st);
    return {
      schemaVersion: SCHEMA,
      state: st,
      countyCount: cfg.counties.length,
      feedCountPerCounty: FEEDS.length,
      plannedFeedSlots: cfg.counties.length * FEEDS.length,
      feedOrder: FEEDS.slice(),
      checkpointNamespace: cfg.checkpoint,
      auditNamespace: cfg.audit,
      schedulerHandler: cfg.entrypoint,
      suggestedTrigger: {
        timezone: 'America/New_York',
        cadence: 'DAILY',
        proposedHourLocal: cfg.proposedHourLocal,
        installed: false,
        authorizedToInstall: false
      },
      availableInventoryDataset: cfg.inventoryOnlyDataset,
      distressSourceCertification: 'MISSING_FOR_ALL_FIVE_FEEDS',
      countyScopeApproval: 'NOT_ATTESTED',
      ingestionDestinationApproval: 'NOT_ATTESTED',
      acquisitionOfferAuthority: 'BLOCKED',
      paCheckpointTouched: false,
      prodMutationAttempted: false,
      status: 'HOLD_NO_TRIGGER_NO_LIVE_INGESTION',
      tasks: tasks_(st)
    };
  }

  function scheduled(state) {
    var p = plan(state);
    // Even if a user accidentally creates a trigger targeting this handler,
    // it does not register connectors, contact sources, or touch script props.
    return {
      schemaVersion: SCHEMA,
      state: p.state,
      executed: false,
      sourceRequests: 0,
      checkpointWrites: 0,
      auditWrites: 0,
      liveIngestion: false,
      status: 'HOLD_NJ_DE_ACTIVATION_NOT_AUTHORIZED',
      reason: 'No certified distress feeds, signed NJ/DE authorization, or protected execution endpoints',
      nextStep: 'Independent source and approval certification',
      scheduledHandler: p.schedulerHandler
    };
  }

  function initialCheckpoint_(state) {
    return {
      schemaVersion: SCHEMA,
      state: state,
      cycle: 'OFFLINE_REHEARSAL_ONLY',
      taskIndex: 0,
      cursor: '',
      pagesProcessed: 0,
      attempts: 0,
      completed: false,
      lastStatus: 'NOT_STARTED'
    };
  }

  function validateCheckpoint_(state, raw, count) {
    if (raw === null || typeof raw === 'undefined') {
      return initialCheckpoint_(state);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('NJ_DE_CHECKPOINT_MALFORMED');
    }
    var cp = safeClone_(raw);
    if (cp.schemaVersion !== SCHEMA || cp.state !== state ||
        cp.cycle !== 'OFFLINE_REHEARSAL_ONLY' ||
        !Number.isInteger(cp.taskIndex) || cp.taskIndex < 0 ||
        cp.taskIndex > count ||
        typeof cp.cursor !== 'string' || cp.cursor.length > 512 ||
        !Number.isInteger(cp.pagesProcessed) || cp.pagesProcessed < 0 ||
        !Number.isInteger(cp.attempts) || cp.attempts < 0 ||
        cp.attempts > MAX_RETRIES || typeof cp.completed !== 'boolean') {
      throw new Error('NJ_DE_CHECKPOINT_STATE_OR_SCHEMA_MISMATCH');
    }
    if (cp.completed !== (cp.taskIndex === count)) {
      throw new Error('NJ_DE_CHECKPOINT_COMPLETION_INCONSISTENT');
    }
    return cp;
  }

  function rehearsalIo_(io, state) {
    // The test harness is deliberately not wired to production services.
    if (!io || io.mockMode !== 'REOS_OFFLINE_IN_MEMORY_TEST_ONLY' ||
        io.state !== state || typeof io.load !== 'function' ||
        typeof io.save !== 'function' || typeof io.fetchMockPage !== 'function' ||
        typeof io.auditMock !== 'function' ||
        io.isolatedFromGoogle !== true) {
      throw new Error('NJ_DE_REHEARSAL_REQUIRES_ISOLATED_MOCK_IO');
    }
  }

  function requireMockSource_(task, io) {
    // This is NOT a certification or an activation path; it accepts only a
    // synthetic fixture flag, never an Apps Script source or live connector.
    if (!io.syntheticSourceKeys ||
        io.syntheticSourceKeys[taskKey_(task)] !== 'MOCK_FIXTURE_ONLY') {
      return false;
    }
    return true;
  }

  function rehearsalTick(state, io, options) {
    var st = state_(state);
    options = options || {};
    if (options.mode !== 'OFFLINE_TEST' || options.noRemoteServices !== true) {
      throw new Error('NJ_DE_PARITY_LIVE_RUN_PROHIBITED');
    }
    rehearsalIo_(io, st);
    var all = tasks_(st);
    var cp = validateCheckpoint_(st, io.load(conf_(st).checkpoint), all.length);
    if (cp.completed) {
      return {
        ok: true, state: st, status: 'MOCK_CYCLE_COMPLETE',
        checkpoint: safeClone_(cp), recordsPersisted: 0
      };
    }
    var task = all[cp.taskIndex];
    var taskKey = taskKey_(task);
    if (!requireMockSource_(task, io)) {
      return {
        ok: false, state: st, status: NO_CERT,
        taskKey: taskKey, checkpoint: safeClone_(cp), recordsPersisted: 0
      };
    }
    var before = safeClone_(cp);
    var page;
    try {
      page = io.fetchMockPage({
        mock: true,
        state: st,
        countyId: task.countyId,
        feed: task.feed,
        cursor: cp.cursor,
        limit: MAX_PAGE_SIZE
      });
      if (!page || !Array.isArray(page.records) ||
          page.records.length > MAX_PAGE_SIZE ||
          typeof page.nextCursor !== 'string' || page.nextCursor.length > 512 ||
          typeof page.more !== 'boolean') {
        throw new Error('MOCK_PAGE_INVALID_SCHEMA');
      }
      if (page.more && (!page.nextCursor || page.nextCursor === cp.cursor)) {
        throw new Error('MOCK_PAGE_STALLED_CURSOR');
      }
      var seen = {};
      page.records.forEach(function (record) {
        if (!record || record.state !== st ||
            record.countyId !== task.countyId ||
            record.feed !== task.feed ||
            typeof record.sourceRecordId !== 'string' ||
            !record.sourceRecordId.trim() ||
            record.sourceRecordId.length > 128) {
          throw new Error('MOCK_RECORD_IDENTITY_OR_SCOPE_INVALID');
        }
        var key = taskKey + '|' + record.sourceRecordId;
        if (seen[key]) {
          throw new Error('MOCK_DUPLICATE_SOURCE_ID_IN_PAGE');
        }
        seen[key] = true;
      });
      var next = safeClone_(cp);
      next.pagesProcessed += 1;
      next.attempts = 0;
      next.lastStatus = 'MOCK_PAGE_VERIFIED_NO_INGESTION';
      if (page.more) {
        next.cursor = page.nextCursor;
      } else {
        next.taskIndex += 1;
        next.cursor = '';
        if (next.taskIndex === all.length) {
          next.completed = true;
        }
      }
      // Both methods are supplied by offline tests, never ScriptProperties
      // or a production Sheets table. There is no record persistence here.
      io.save(conf_(st).checkpoint, safeClone_(next));
      io.auditMock(conf_(st).audit, {
        schemaVersion: SCHEMA,
        state: st,
        countyId: task.countyId,
        feed: task.feed,
        status: next.lastStatus,
        recordsReviewed: page.records.length,
        recordsPersisted: 0,
        nextCursor: next.cursor,
        taskIndex: next.taskIndex
      });
      return {
        ok: true, state: st,
        status: next.completed ? 'MOCK_CYCLE_COMPLETE' : 'MOCK_PAGE_VERIFIED',
        taskKey: taskKey,
        recordsReviewed: page.records.length,
        recordsPersisted: 0,
        checkpoint: safeClone_(next)
      };
    } catch (error) {
      // A failed page cannot silently advance the active cursor. Retain
      // source/page order, apply bounded retry, and quarantine on exhaustion.
      var failed = safeClone_(before);
      failed.attempts = Math.min(MAX_RETRIES, failed.attempts + 1);
      failed.lastStatus = failed.attempts >= MAX_RETRIES
        ? 'MOCK_QUARANTINED_RETRY_LIMIT'
        : 'MOCK_RETRY_PENDING';
      io.save(conf_(st).checkpoint, safeClone_(failed));
      io.auditMock(conf_(st).audit, {
        schemaVersion: SCHEMA,
        state: st,
        countyId: task.countyId,
        feed: task.feed,
        status: failed.lastStatus,
        recordsPersisted: 0,
        errorCode: (error && error.message) || 'MOCK_ERROR'
      });
      return {
        ok: false, state: st, status: failed.lastStatus,
        taskKey: taskKey, recordsPersisted: 0,
        checkpoint: safeClone_(failed)
      };
    }
  }

  return Object.freeze({
    schemaVersion: SCHEMA,
    feedOrder: FEEDS.slice(),
    plan: plan,
    scheduled: scheduled,
    rehearsalTick: rehearsalTick,
    checkpointKey: function (state) { return conf_(state).checkpoint; },
    auditKey: function (state) { return conf_(state).audit; }
  });
})();

// Public Apps Script handlers are deliberately inert. No ScriptApp triggers
// are installed by this source. Do not wire these handlers in production until
// a separate, signed enablement release is independently reviewed.
function REOS_NJ_COUNTY_SCHEDULED_RUN() {
  return REOS.NJDECountyParityScheduler.scheduled('NJ');
}
function REOS_DE_COUNTY_SCHEDULED_RUN() {
  return REOS.NJDECountyParityScheduler.scheduled('DE');
}
function REOS_NJ_COUNTY_SCHEDULE_PREVIEW() {
  return REOS.NJDECountyParityScheduler.plan('NJ');
}
function REOS_DE_COUNTY_SCHEDULE_PREVIEW() {
  return REOS.NJDECountyParityScheduler.plan('DE');
}

// Explicitly refuse premature trigger installation, even if called manually.
function REOS_NJ_COUNTY_INSTALL_TRIGGER() {
  throw new Error('NJ_DE_TRIGGER_INSTALLATION_NOT_AUTHORIZED');
}
function REOS_DE_COUNTY_INSTALL_TRIGGER() {
  throw new Error('NJ_DE_TRIGGER_INSTALLATION_NOT_AUTHORIZED');
}

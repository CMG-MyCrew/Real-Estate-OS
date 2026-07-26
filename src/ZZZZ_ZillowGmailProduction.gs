/**
 * REOS Enterprise v4.5.1 - Zillow Gmail Production Runtime
 *
 * Adds bounded execution, one-read deduplication indexes, resumable Gmail batches,
 * health telemetry, downstream queueing, and production trigger management.
 */
var REOS = REOS || {};

REOS.ZillowGmailProduction = (function () {
  var KEY = 'zillow_gmail_leads';
  var IMPORTS = 'ZILLOW_GMAIL_IMPORTS';
  var ERRORS = 'ZILLOW_GMAIL_ERRORS';
  var RUNS = 'ZILLOW_GMAIL_PRODUCTION_RUNS';
  var QUEUE = 'ZILLOW_GMAIL_DOWNSTREAM_QUEUE';
  var STATE_KEY = 'REOS_ZILLOW_GMAIL_PRODUCTION_STATE';
  var VERSION = '4.5.1';

  var RUN_HEADERS = [
    'Production Run ID','Status','Started At','Completed At','Duration Ms','Labels Scanned',
    'Threads Scanned','Messages Found','Messages Imported','Messages Duplicate','Messages Failed',
    'Messages Deferred','Deadline Reached','Downstream Queued','Details JSON','Executed By'
  ];
  var QUEUE_HEADERS = [
    'Queue ID','Distress Lead ID','Status','Attempts','Available At','Last Attempt At',
    'Completed At','Last Error','Created At','Updated At'
  ];

  var DEFAULTS = {
    labels: ['Zillow/New Leads','Zillow/Buyer Leads','Zillow/Seller Leads','Zillow/Rental Leads'],
    importedLabel: 'Zillow/Imported',
    errorLabel: 'Zillow/Errors',
    maxThreadsPerLabel: 15,
    maxMessagesPerRun: 40,
    lookbackDays: 30,
    executionBudgetMs: 260000,
    markRead: false,
    archiveAfterImport: false,
    queueDownstream: true,
    downstreamBatchSize: 20,
    maxDownstreamAttempts: 3,
    defaultCity: '',
    defaultState: '',
    defaultAssignedTo: ''
  };

  function ensureSheets() {
    require_('Database');
    if (REOS.ZillowGmailConnector && REOS.ZillowGmailConnector.ensureSheets) {
      REOS.ZillowGmailConnector.ensureSheets();
    }
    REOS.Database.ensureTable(RUNS, RUN_HEADERS);
    REOS.Database.ensureTable(QUEUE, QUEUE_HEADERS);
    return { ok: true, runs: RUNS, queue: QUEUE };
  }

  function configure(config) {
    ensureSheets();
    require_('ConnectorRegistry');
    var normalized = normalizeConfig_(config || {});
    ensureLabels_(normalized);
    var existing = REOS.ConnectorRegistry.get(KEY);
    if (!existing) REOS.ConnectorRegistry.seedDefaults();
    return REOS.ConnectorRegistry.update(KEY, {
      Enabled: true,
      Schedule: 'Every 5 minutes',
      'Handler Function': 'reosConnectorHandleZillowGmail',
      'Config JSON': JSON.stringify(normalized),
      'Last Message': 'Production runtime configured (' + VERSION + ')'
    });
  }

  function sync(context) {
    ensureSheets();
    context = context || {};
    var config = normalizeConfig_(context.config || {});
    var options = context.options || {};
    if (options.labels && options.labels.length) config.labels = options.labels;
    if (options.maxMessagesPerRun) config.maxMessagesPerRun = Number(options.maxMessagesPerRun);
    if (options.maxThreadsPerLabel) config.maxThreadsPerLabel = Number(options.maxThreadsPerLabel);

    ensureLabels_(config);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return busyResult_();

    var started = new Date();
    var deadline = started.getTime() + config.executionBudgetMs;
    var run = {
      version: VERSION,
      status: 'Complete',
      labelsScanned: 0,
      threadsScanned: 0,
      recordsFound: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      recordsDeferred: 0,
      duplicates: 0,
      downstreamQueued: 0,
      deadlineReached: false,
      byLabel: [],
      errors: []
    };

    try {
      var indexes = buildIndexes_();
      for (var i = 0; i < config.labels.length; i += 1) {
        if (shouldStop_(run, config, deadline)) break;
        var item = syncLabel_(config.labels[i], config, deadline, run, indexes);
        run.labelsScanned += 1;
        run.threadsScanned += item.threadsScanned;
        run.recordsFound += item.recordsFound;
        run.recordsImported += item.recordsImported;
        run.recordsSkipped += item.recordsSkipped;
        run.recordsFailed += item.recordsFailed;
        run.recordsDeferred += item.recordsDeferred;
        run.duplicates += item.duplicates;
        run.downstreamQueued += item.downstreamQueued;
        run.byLabel.push(item);
        run.errors = run.errors.concat(item.errors);
      }

      if (new Date().getTime() >= deadline || run.recordsFound >= config.maxMessagesPerRun) {
        run.deadlineReached = new Date().getTime() >= deadline;
        run.status = run.recordsFailed ? 'Completed With Errors' : 'Partial';
      } else if (run.recordsFailed) {
        run.status = run.recordsImported ? 'Completed With Errors' : 'Failed';
      }

      run.ok = run.status !== 'Failed';
      run.message = buildMessage_(run);
      saveState_(run, started);
      recordRun_(run, started);
      publish_('acquisition.zillow.gmail.production.completed', run);
      return run;
    } catch (error) {
      run.ok = false;
      run.status = 'Failed';
      run.message = error.message || String(error);
      run.errors.push({ error: run.message });
      saveState_(run, started);
      recordRun_(run, started);
      throw error;
    } finally {
      lock.releaseLock();
    }
  }

  function syncLabel_(labelName, config, deadline, run, indexes) {
    var result = {
      label: labelName,
      threadsScanned: 0,
      recordsFound: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      recordsDeferred: 0,
      duplicates: 0,
      downstreamQueued: 0,
      errors: []
    };
    var query = [
      'label:"' + escapeQuery_(labelName) + '"',
      '-label:"' + escapeQuery_(config.importedLabel) + '"',
      '-label:"' + escapeQuery_(config.errorLabel) + '"',
      'newer_than:' + config.lookbackDays + 'd'
    ].join(' ');
    var threads = GmailApp.search(query, 0, config.maxThreadsPerLabel);

    for (var t = 0; t < threads.length; t += 1) {
      if (shouldStop_(run, config, deadline)) {
        result.recordsDeferred += threads.length - t;
        break;
      }
      result.threadsScanned += 1;
      var messages = threads[t].getMessages();
      for (var m = 0; m < messages.length; m += 1) {
        if (shouldStop_(run, config, deadline)) {
          result.recordsDeferred += messages.length - m;
          break;
        }
        var message = messages[m];
        result.recordsFound += 1;
        run.recordsFound += 1;
        try {
          var messageId = String(message.getId());
          if (indexes.messageIds[messageId]) {
            result.recordsSkipped += 1;
            continue;
          }

          var parsed = REOS.ZillowGmailConnector.parseMessage_(message, labelName, config);
          var duplicateLeadId = indexes.naturalKeys[parsed.naturalKey] || '';
          if (duplicateLeadId) {
            recordImport_(message, labelName, parsed, duplicateLeadId, 'Duplicate');
            indexes.messageIds[messageId] = true;
            finalizeMessage_(message, config, true);
            result.recordsSkipped += 1;
            result.duplicates += 1;
            continue;
          }

          var lead = insertLead_(parsed, config);
          var leadId = String(lead['Distress Lead ID'] || '');
          recordImport_(message, labelName, parsed, leadId, 'Imported');
          indexes.messageIds[messageId] = true;
          if (parsed.naturalKey) indexes.naturalKeys[parsed.naturalKey] = leadId;
          finalizeMessage_(message, config, true);
          result.recordsImported += 1;
          if (config.queueDownstream && leadId) {
            queueLead_(leadId);
            result.downstreamQueued += 1;
          }
        } catch (error) {
          result.recordsFailed += 1;
          result.errors.push({
            messageId: safeCall_(function () { return String(message.getId()); }, ''),
            error: error.message || String(error)
          });
          recordError_(message, labelName, error);
          finalizeMessage_(message, config, false);
        }
      }
    }
    return result;
  }

  function processDownstream(options) {
    ensureSheets();
    options = Object.assign({ batchSize: 20, maxAttempts: 3 }, options || {});
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return { ok: false, status: 'Busy', processed: 0 };
    try {
      var now = new Date();
      var rows = REOS.Database.getAll(QUEUE).filter(function (row) {
        var status = String(row.Status || 'Pending');
        var available = row['Available At'] ? new Date(row['Available At']) : now;
        return (status === 'Pending' || status === 'Retry') &&
          Number(row.Attempts || 0) < Number(options.maxAttempts || 3) && available.getTime() <= now.getTime();
      }).slice(0, Number(options.batchSize || 20));

      if (!rows.length) return { ok: true, status: 'Complete', processed: 0, message: 'No downstream work queued.' };
      if (!REOS.AcquisitionIngestionOrchestrator || typeof REOS.AcquisitionIngestionOrchestrator.run !== 'function') {
        throw new Error('AcquisitionIngestionOrchestrator.gs is required for downstream processing.');
      }

      var outcome;
      try {
        outcome = REOS.AcquisitionIngestionOrchestrator.run({
          runConnectors: false,
          scanDuplicates: true,
          scoreLeads: true,
          autoPromote: false
        });
      } catch (error) {
        rows.forEach(function (row) { markQueueFailure_(row, error, options.maxAttempts); });
        throw error;
      }

      rows.forEach(function (row) {
        REOS.Database.update(QUEUE, 'Queue ID', row['Queue ID'], {
          Status: 'Complete',
          'Last Attempt At': now,
          'Completed At': new Date(),
          'Last Error': '',
          'Updated At': new Date()
        });
      });
      return { ok: true, status: 'Complete', processed: rows.length, outcome: outcome };
    } finally {
      lock.releaseLock();
    }
  }

  function status() {
    ensureSheets();
    var state = loadState_();
    var connector = REOS.ConnectorRegistry ? REOS.ConnectorRegistry.get(KEY) : null;
    var pending = REOS.Database.getAll(QUEUE).filter(function (row) {
      return ['Pending','Retry'].indexOf(String(row.Status || 'Pending')) !== -1;
    }).length;
    var failed = REOS.Database.getAll(ERRORS).filter(function (row) {
      var resolved = row.Resolved === true || String(row.Resolved).toLowerCase() === 'true';
      return !resolved;
    }).length;
    return {
      ok: !!connector,
      version: VERSION,
      enabled: connector ? REOS.ConnectorRegistry.isEnabled(connector) : false,
      lastRun: state,
      downstreamPending: pending,
      unresolvedErrors: failed,
      triggerStatus: triggerStatus_()
    };
  }

  function installTriggers() {
    removeTriggers();
    ScriptApp.newTrigger('reosZillowGmailScheduledSync').timeBased().everyMinutes(5).create();
    ScriptApp.newTrigger('reosZillowGmailProductionDownstreamScheduled').timeBased().everyMinutes(15).create();
    return { ok: true, ingestion: 'Every 5 minutes', downstream: 'Every 15 minutes' };
  }

  function removeTriggers() {
    var names = {
      reosZillowGmailScheduledSync: true,
      reosZillowGmailProductionDownstreamScheduled: true
    };
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (names[trigger.getHandlerFunction()]) {
        ScriptApp.deleteTrigger(trigger);
        removed += 1;
      }
    });
    return { ok: true, removed: removed };
  }

  function buildIndexes_() {
    var messageIds = {};
    var naturalKeys = {};
    REOS.Database.getAll(IMPORTS).forEach(function (row) {
      var messageId = String(row['Gmail Message ID'] || '');
      var naturalKey = String(row['Natural Key'] || '');
      var status = String(row.Status || '');
      if (messageId) messageIds[messageId] = true;
      if (naturalKey && status !== 'Failed') naturalKeys[naturalKey] = String(row['Distress Lead ID'] || '');
    });
    return { messageIds: messageIds, naturalKeys: naturalKeys };
  }

  function insertLead_(parsed, config) {
    var now = new Date();
    return REOS.Database.insert('DISTRESS_LEADS', {
      Address: parsed.propertyAddress,
      City: parsed.city,
      State: parsed.state,
      Zip: parsed.zip,
      'Owner Name': parsed.contactName,
      Phone: parsed.phone,
      Email: parsed.email,
      'Distress Type': mapDistressType_(parsed.leadType),
      Source: 'Zillow Gmail',
      'Source URL': parsed.propertyUrl,
      'External Lead ID': parsed.externalLeadId,
      'Lead Type': parsed.leadType,
      'Assigned To': config.defaultAssignedTo || '',
      Status: 'New',
      Notes: buildNotes_(parsed),
      'Created At': parsed.receivedAt || now,
      'Updated At': now
    }, { idField: 'Distress Lead ID', idPrefix: 'ZIL' });
  }

  function recordImport_(message, labelName, parsed, leadId, status) {
    return REOS.Database.insert(IMPORTS, {
      'Gmail Message ID': String(message.getId()),
      'Gmail Thread ID': String(message.getThread().getId()),
      'Source Label': labelName,
      'External Lead ID': parsed.externalLeadId,
      'Natural Key': parsed.naturalKey,
      'Contact Name': parsed.contactName,
      Email: parsed.email,
      Phone: parsed.phone,
      'Property Address': parsed.propertyAddress,
      'Property URL': parsed.propertyUrl,
      'Lead Type': parsed.leadType,
      'Distress Lead ID': leadId,
      Status: status,
      'Imported At': new Date(),
      'Details JSON': JSON.stringify({ subject: parsed.subject, inquiry: parsed.inquiry, runtime: VERSION })
    }, { idField: 'Import ID', idPrefix: 'ZGMI' });
  }

  function recordError_(message, labelName, error) {
    var body = safeCall_(function () { return message.getPlainBody(); }, '');
    return REOS.Database.insert(ERRORS, {
      'Gmail Message ID': safeCall_(function () { return String(message.getId()); }, ''),
      'Source Label': labelName,
      Subject: safeCall_(function () { return message.getSubject(); }, ''),
      Error: error.message || String(error),
      'Payload Snippet': String(body || '').substring(0, 1000),
      'Occurred At': new Date(),
      Retryable: true,
      Resolved: false,
      'Details JSON': JSON.stringify({ stack: error.stack || '', runtime: VERSION })
    }, { idField: 'Error ID', idPrefix: 'ZGME' });
  }

  function queueLead_(leadId) {
    var existing = REOS.Database.getAll(QUEUE).some(function (row) {
      return String(row['Distress Lead ID'] || '') === String(leadId) && String(row.Status || '') !== 'Failed';
    });
    if (existing) return null;
    var now = new Date();
    return REOS.Database.insert(QUEUE, {
      'Distress Lead ID': leadId,
      Status: 'Pending',
      Attempts: 0,
      'Available At': now,
      'Last Attempt At': '',
      'Completed At': '',
      'Last Error': '',
      'Created At': now,
      'Updated At': now
    }, { idField: 'Queue ID', idPrefix: 'ZGDQ' });
  }

  function markQueueFailure_(row, error, maxAttempts) {
    var attempts = Number(row.Attempts || 0) + 1;
    var failed = attempts >= Number(maxAttempts || 3);
    REOS.Database.update(QUEUE, 'Queue ID', row['Queue ID'], {
      Status: failed ? 'Failed' : 'Retry',
      Attempts: attempts,
      'Available At': new Date(new Date().getTime() + Math.pow(2, attempts) * 15 * 60000),
      'Last Attempt At': new Date(),
      'Last Error': error.message || String(error),
      'Updated At': new Date()
    });
  }

  function finalizeMessage_(message, config, success) {
    var target = GmailApp.getUserLabelByName(success ? config.importedLabel : config.errorLabel);
    if (target) message.getThread().addLabel(target);
    if (success && config.markRead) message.markRead();
    if (success && config.archiveAfterImport) message.getThread().moveToArchive();
  }

  function normalizeConfig_(config) {
    var merged = Object.assign({}, DEFAULTS, config || {});
    merged.labels = Array.isArray(merged.labels) ? merged.labels : String(merged.labels || '').split(',');
    merged.labels = merged.labels.map(function (value) { return String(value || '').trim(); }).filter(Boolean);
    merged.maxThreadsPerLabel = clamp_(merged.maxThreadsPerLabel, 1, 100, 15);
    merged.maxMessagesPerRun = clamp_(merged.maxMessagesPerRun, 1, 200, 40);
    merged.lookbackDays = clamp_(merged.lookbackDays, 1, 365, 30);
    merged.executionBudgetMs = clamp_(merged.executionBudgetMs, 60000, 280000, 260000);
    merged.downstreamBatchSize = clamp_(merged.downstreamBatchSize, 1, 100, 20);
    merged.maxDownstreamAttempts = clamp_(merged.maxDownstreamAttempts, 1, 10, 3);
    return merged;
  }

  function ensureLabels_(config) {
    config.labels.concat([config.importedLabel, config.errorLabel]).forEach(function (name) {
      if (name && !GmailApp.getUserLabelByName(name)) GmailApp.createLabel(name);
    });
  }

  function shouldStop_(run, config, deadline) {
    return new Date().getTime() >= deadline || run.recordsFound >= config.maxMessagesPerRun;
  }

  function recordRun_(run, started) {
    var completed = new Date();
    REOS.Database.insert(RUNS, {
      Status: run.status,
      'Started At': started,
      'Completed At': completed,
      'Duration Ms': completed.getTime() - started.getTime(),
      'Labels Scanned': run.labelsScanned,
      'Threads Scanned': run.threadsScanned,
      'Messages Found': run.recordsFound,
      'Messages Imported': run.recordsImported,
      'Messages Duplicate': run.duplicates,
      'Messages Failed': run.recordsFailed,
      'Messages Deferred': run.recordsDeferred,
      'Deadline Reached': run.deadlineReached,
      'Downstream Queued': run.downstreamQueued,
      'Details JSON': JSON.stringify(run),
      'Executed By': currentUser_()
    }, { idField: 'Production Run ID', idPrefix: 'ZGPR' });
  }

  function saveState_(run, started) {
    PropertiesService.getScriptProperties().setProperty(STATE_KEY, JSON.stringify({
      version: VERSION,
      status: run.status,
      startedAt: started.toISOString(),
      completedAt: new Date().toISOString(),
      recordsFound: run.recordsFound,
      recordsImported: run.recordsImported,
      recordsSkipped: run.recordsSkipped,
      recordsFailed: run.recordsFailed,
      recordsDeferred: run.recordsDeferred,
      message: run.message || ''
    }));
  }

  function loadState_() {
    try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(STATE_KEY) || '{}'); }
    catch (error) { return {}; }
  }

  function triggerStatus_() {
    var handlers = ScriptApp.getProjectTriggers().map(function (trigger) { return trigger.getHandlerFunction(); });
    return {
      ingestion: handlers.indexOf('reosZillowGmailScheduledSync') !== -1,
      downstream: handlers.indexOf('reosZillowGmailProductionDownstreamScheduled') !== -1
    };
  }

  function buildMessage_(run) {
    return 'Zillow Gmail production sync: imported ' + run.recordsImported +
      ', duplicates ' + run.duplicates + ', failed ' + run.recordsFailed +
      ', deferred ' + run.recordsDeferred + '.';
  }

  function mapDistressType_(leadType) {
    if (leadType === 'Seller') return 'Seller Lead';
    if (leadType === 'Rental') return 'Rental Inquiry';
    if (leadType === 'Buyer') return 'Buyer Inquiry';
    return 'Listing Inquiry';
  }

  function buildNotes_(parsed) {
    return [
      'Imported from Gmail label: ' + parsed.sourceLabel,
      parsed.externalLeadId ? 'Zillow lead ID: ' + parsed.externalLeadId : '',
      parsed.propertyUrl ? 'Property URL: ' + parsed.propertyUrl : '',
      parsed.inquiry ? 'Inquiry: ' + parsed.inquiry : ''
    ].filter(Boolean).join('\n');
  }

  function busyResult_() {
    return { ok: false, status: 'Busy', message: 'Zillow Gmail sync is already running.', recordsFound: 0, recordsImported: 0, recordsSkipped: 0 };
  }

  function clamp_(value, min, max, fallback) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    return Math.max(min, Math.min(max, number));
  }

  function escapeQuery_(value) { return String(value || '').replace(/"/g, '\\"'); }
  function safeCall_(fn, fallback) { try { return fn(); } catch (error) { return fallback; } }
  function currentUser_() { try { return Session.getActiveUser().getEmail() || ''; } catch (error) { return ''; } }
  function require_(name) { if (!REOS[name]) throw new Error(name + '.gs is required.'); }
  function publish_(topic, payload) {
    try {
      if (REOS.PluginEventBus && typeof REOS.PluginEventBus.publish === 'function') {
        REOS.PluginEventBus.publish(topic, payload, 'zillow-gmail-production');
      }
    } catch (error) {}
  }

  return {
    version: VERSION,
    ensureSheets: ensureSheets,
    configure: configure,
    sync: sync,
    processDownstream: processDownstream,
    status: status,
    installTriggers: installTriggers,
    removeTriggers: removeTriggers
  };
})();

// Preserve the existing public connector contract while replacing only its runtime.
if (REOS.ZillowGmailConnector) {
  REOS.ZillowGmailConnector.sync = function (context) {
    return REOS.ZillowGmailProduction.sync(context || {});
  };
}

function reosZillowGmailConfigureProduction() {
  return REOS.ZillowGmailProduction.configure({
    labels: ['Zillow/New Leads','Zillow/Buyer Leads','Zillow/Seller Leads','Zillow/Rental Leads'],
    importedLabel: 'Zillow/Imported',
    errorLabel: 'Zillow/Errors',
    maxThreadsPerLabel: 15,
    maxMessagesPerRun: 40,
    lookbackDays: 30,
    executionBudgetMs: 260000,
    markRead: false,
    archiveAfterImport: false,
    queueDownstream: true,
    downstreamBatchSize: 20,
    maxDownstreamAttempts: 3,
    defaultCity: '',
    defaultState: '',
    defaultAssignedTo: ''
  });
}

function reosZillowGmailProductionEnsureSheets() {
  return REOS.ZillowGmailProduction.ensureSheets();
}

function reosZillowGmailProductionStatus() {
  return REOS.ZillowGmailProduction.status();
}

function reosZillowGmailProductionProcessDownstream(options) {
  return REOS.ZillowGmailProduction.processDownstream(options || {});
}

function reosZillowGmailProductionDownstreamScheduled() {
  return REOS.ZillowGmailProduction.processDownstream({ batchSize: 20, maxAttempts: 3 });
}

function reosZillowGmailInstallProductionTriggers() {
  return REOS.ZillowGmailProduction.installTriggers();
}

function reosZillowGmailRemoveProductionTriggers() {
  return REOS.ZillowGmailProduction.removeTriggers();
}

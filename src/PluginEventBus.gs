/**
 * REOS Enterprise v3.3.5 - Plugin Event Bus & Hooks
 * Sprint 4 Increment 6
 *
 * Provides publish/subscribe plugin events, hook registry, delivery log,
 * and lightweight event processing for REOS plugins.
 */

var REOS = REOS || {};

REOS.PluginEventBus = (function () {
  var EVENTS = 'PLUGIN_EVENTS';
  var SUBS = 'PLUGIN_EVENT_SUBSCRIPTIONS';
  var HOOKS = 'PLUGIN_HOOKS';
  var LOG = 'PLUGIN_EVENT_LOG';

  var EH = ['Event ID', 'Topic', 'Source Plugin', 'Payload JSON', 'Status', 'Created At', 'Processed At'];
  var SH = ['Subscription ID', 'Topic', 'Plugin Key', 'Handler', 'Active', 'Created At', 'Updated At'];
  var HH = ['Hook ID', 'Plugin Key', 'Hook Name', 'Handler', 'Active', 'Created At', 'Updated At'];
  var LH = ['Log ID', 'Event ID', 'Topic', 'Plugin Key', 'Handler', 'Status', 'Message', 'Details JSON', 'Created At'];

  function ensureSheets() {
    REOS.Database.ensureTable(EVENTS, EH);
    REOS.Database.ensureTable(SUBS, SH);
    REOS.Database.ensureTable(HOOKS, HH);
    REOS.Database.ensureTable(LOG, LH);
  }

  function seedDefaults() {
    ensureSheets();
    subscribe('diagnostics.completed', 'operations', 'reosPluginEventDefaultHandler');
    subscribe('error.created', 'operations', 'reosPluginEventDefaultHandler');
    subscribe('integration.warning', 'operations', 'reosPluginEventDefaultHandler');
    subscribe('plugin.activated', 'foundation', 'reosPluginEventDefaultHandler');
    subscribe('plugin.validated', 'foundation', 'reosPluginEventDefaultHandler');
    registerHook('operations', 'afterDiagnostics', 'reosPluginEventDefaultHandler');
    registerHook('foundation', 'afterPluginSync', 'reosPluginEventDefaultHandler');
    return summary();
  }

  function publish(topic, payload, sourcePlugin) {
    ensureSheets();
    var row = REOS.Database.insert(EVENTS, {
      Topic: topic,
      'Source Plugin': sourcePlugin || 'system',
      'Payload JSON': REOS.toJson_(payload || {}),
      Status: 'Pending',
      'Created At': new Date(),
      'Processed At': ''
    }, { idField: 'Event ID', idPrefix: 'PEVT' });
    return row;
  }

  function subscribe(topic, pluginKey, handler) {
    ensureSheets();
    var exists = REOS.Database.getAll(SUBS).some(function (row) {
      return row.Topic === topic && row['Plugin Key'] === pluginKey && row.Handler === handler;
    });
    if (exists) return { ok: true, topic: topic, pluginKey: pluginKey, handler: handler, existing: true };
    return REOS.Database.insert(SUBS, { Topic: topic, 'Plugin Key': pluginKey, Handler: handler, Active: true, 'Created At': new Date(), 'Updated At': new Date() }, { idField: 'Subscription ID', idPrefix: 'PSUB' });
  }

  function registerHook(pluginKey, hookName, handler) {
    ensureSheets();
    var exists = REOS.Database.getAll(HOOKS).some(function (row) {
      return row['Plugin Key'] === pluginKey && row['Hook Name'] === hookName && row.Handler === handler;
    });
    if (exists) return { ok: true, pluginKey: pluginKey, hookName: hookName, handler: handler, existing: true };
    return REOS.Database.insert(HOOKS, { 'Plugin Key': pluginKey, 'Hook Name': hookName, Handler: handler, Active: true, 'Created At': new Date(), 'Updated At': new Date() }, { idField: 'Hook ID', idPrefix: 'PHOOK' });
  }

  function processPending(limit) {
    ensureSheets();
    limit = limit || 25;
    var events = REOS.Database.getAll(EVENTS).filter(function (row) { return row.Status === 'Pending'; }).slice(0, limit);
    var results = events.map(processEvent_);
    return { ok: true, processed: results.length, results: results };
  }

  function processEvent_(eventRow) {
    var subs = REOS.Database.getAll(SUBS).filter(function (row) {
      return row.Topic === eventRow.Topic && isTrue_(row.Active);
    });
    var deliveries = subs.map(function (sub) { return deliver_(eventRow, sub); });
    REOS.Database.update(EVENTS, 'Event ID', eventRow['Event ID'], { Status: 'Processed', 'Processed At': new Date() });
    return { eventId: eventRow['Event ID'], topic: eventRow.Topic, deliveries: deliveries.length };
  }

  function deliver_(eventRow, sub) {
    var status = 'Delivered';
    var message = 'Handler recorded.';
    var details = { eventId: eventRow['Event ID'], topic: eventRow.Topic, handler: sub.Handler };
    try {
      if (typeof globalThis[sub.Handler] === 'function') {
        globalThis[sub.Handler](eventRow, sub);
        message = 'Handler executed.';
      }
    } catch (error) {
      status = 'Failed';
      message = error.message;
      details.stack = error.stack || '';
      if (REOS.ErrorCenter && REOS.ErrorCenter.capture) REOS.ErrorCenter.capture(error, { module: 'PluginEventBus', functionName: sub.Handler, eventId: eventRow['Event ID'] });
    }
    return REOS.Database.insert(LOG, { 'Event ID': eventRow['Event ID'], Topic: eventRow.Topic, 'Plugin Key': sub['Plugin Key'], Handler: sub.Handler, Status: status, Message: message, 'Details JSON': REOS.toJson_(details), 'Created At': new Date() }, { idField: 'Log ID', idPrefix: 'PELOG' });
  }

  function emitHook(hookName, payload) {
    ensureSheets();
    var hooks = REOS.Database.getAll(HOOKS).filter(function (row) { return row['Hook Name'] === hookName && isTrue_(row.Active); });
    var results = hooks.map(function (hook) {
      return deliver_({ 'Event ID': 'HOOK-' + hookName + '-' + Date.now(), Topic: 'hook.' + hookName, 'Payload JSON': REOS.toJson_(payload || {}) }, { 'Plugin Key': hook['Plugin Key'], Handler: hook.Handler });
    });
    return { ok: true, hookName: hookName, delivered: results.length, results: results };
  }

  function summary() {
    ensureSheets();
    var events = REOS.Database.getAll(EVENTS);
    var subs = REOS.Database.getAll(SUBS);
    var hooks = REOS.Database.getAll(HOOKS);
    var logs = REOS.Database.getAll(LOG);
    return { ok: true, generatedAt: new Date().toISOString(), events: events.length, pending: events.filter(function (e) { return e.Status === 'Pending'; }).length, subscriptions: subs.length, hooks: hooks.length, logs: logs.length };
  }

  function isTrue_(value) { return value === true || String(value).toLowerCase() === 'true'; }

  return { ensureSheets: ensureSheets, seedDefaults: seedDefaults, publish: publish, subscribe: subscribe, registerHook: registerHook, processPending: processPending, emitHook: emitHook, summary: summary };
})();

function reosPluginEventDefaultHandler(eventRow, subscription) { return { ok: true, eventId: eventRow['Event ID'], pluginKey: subscription['Plugin Key'] }; }
function reosPluginEventSeedDefaults() { var result = REOS.PluginEventBus.seedDefaults(); SpreadsheetApp.getUi().alert('REOS Plugin Event Seed', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }
function reosPluginEventPublishTest() { var event = REOS.PluginEventBus.publish('plugin.activated', { test: true, source: 'manual' }, 'foundation'); SpreadsheetApp.getUi().alert('REOS Plugin Event Published', JSON.stringify(event, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return event; }
function reosPluginEventProcessPending() { var result = REOS.PluginEventBus.processPending(25); SpreadsheetApp.getUi().alert('REOS Plugin Event Processing', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }
function reosPluginEventSummary() { var result = REOS.PluginEventBus.summary(); SpreadsheetApp.getUi().alert('REOS Plugin Event Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }

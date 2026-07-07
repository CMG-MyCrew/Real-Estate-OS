/**
 * REOS Enterprise v3.3.3 - Plugin Lifecycle Core
 */

var REOS = REOS || {};

REOS.PluginLifecycle = (function () {
  var EVENTS = 'PLUGIN_LIFECYCLE_EVENTS';
  var STATE = 'PLUGIN_STATE';
  var EH = ['Lifecycle Event ID', 'Plugin Key', 'Action', 'Status', 'Message', 'Details JSON', 'Created At'];
  var SH = ['Plugin Key', 'Installed', 'Enabled', 'Version', 'Last Action', 'Last Status', 'Last Message', 'Updated At'];

  function ensureSheets() {
    REOS.Database.ensureTable(EVENTS, EH);
    REOS.Database.ensureTable(STATE, SH);
  }

  function activateAll() {
    ensureSheets();
    var plugins = getPlugins_();
    return plugins.map(function (plugin) {
      return setPluginState_(plugin, true, plugin.enabled !== false, 'activate', 'Ready', 'Plugin activated.');
    });
  }

  function validateAll() {
    ensureSheets();
    return getPlugins_().map(function (plugin) { return validatePlugin(plugin.key); });
  }

  function validatePlugin(pluginKey) {
    ensureSheets();
    var plugin = getPlugin_(pluginKey);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var missingSheets = (plugin.sheets || []).filter(function (sheetName) { return !ss.getSheetByName(sheetName); });
    var ok = missingSheets.length === 0;
    var details = { pluginKey: plugin.key, ok: ok, missingSheets: missingSheets, capabilityCount: countCapabilities_(plugin) };
    setPluginState_(plugin, true, plugin.enabled !== false, 'validate', ok ? 'Valid' : 'Warning', ok ? 'Plugin validation passed.' : 'Missing sheets detected.');
    logEvent_(plugin.key, 'validate', ok ? 'Success' : 'Warning', ok ? 'Plugin validation passed.' : 'Missing sheets detected.', details);
    return details;
  }

  function refreshAll() {
    ensureSheets();
    if (REOS.PluginManager && REOS.PluginManager.sync) REOS.PluginManager.sync();
    return getPlugins_().map(function (plugin) {
      return setPluginState_(plugin, true, plugin.enabled !== false, 'refresh', 'Refreshed', 'Plugin metadata refreshed.');
    });
  }

  function summary() {
    ensureSheets();
    var states = REOS.Database.getAll(STATE);
    var events = REOS.Database.getAll(EVENTS);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      plugins: states.length,
      active: states.filter(function (s) { return isTrue_(s.Enabled); }).length,
      events: events.length,
      state: states
    };
  }

  function setPluginState_(plugin, installed, enabled, action, status, message) {
    var current = REOS.Database.getAll(STATE).filter(function (row) { return row['Plugin Key'] === plugin.key; })[0];
    var record = { 'Plugin Key': plugin.key, Installed: installed, Enabled: enabled, Version: plugin.version, 'Last Action': action, 'Last Status': status, 'Last Message': message, 'Updated At': new Date() };
    var result = current ? REOS.Database.update(STATE, 'Plugin Key', plugin.key, record) : REOS.Database.insert(STATE, record, {});
    logEvent_(plugin.key, action, status, message, { version: plugin.version });
    return result;
  }

  function logEvent_(pluginKey, action, status, message, details) {
    return REOS.Database.insert(EVENTS, { 'Plugin Key': pluginKey, Action: action, Status: status, Message: message, 'Details JSON': REOS.toJson_(details || {}), 'Created At': new Date() }, { idField: 'Lifecycle Event ID', idPrefix: 'PLCE' });
  }

  function getPlugins_() {
    if (!(REOS.PluginManager && REOS.PluginManager.summary)) throw new Error('PluginManager is not available.');
    REOS.PluginManager.registerDefaults();
    return REOS.PluginManager.summary().plugins || [];
  }

  function getPlugin_(pluginKey) {
    if (!(REOS.PluginManager && REOS.PluginManager.get)) throw new Error('PluginManager is not available.');
    REOS.PluginManager.registerDefaults();
    var plugin = REOS.PluginManager.get(pluginKey);
    if (!plugin) throw new Error('Unknown plugin: ' + pluginKey);
    return plugin;
  }

  function countCapabilities_(plugin) {
    return ['diagnostics', 'repairs', 'routes', 'jobs', 'permissions', 'dashboards', 'sheets', 'integrations'].reduce(function (sum, key) { return sum + ((plugin[key] || []).length); }, plugin.menuGroup ? 1 : 0);
  }

  function isTrue_(value) { return value === true || String(value).toLowerCase() === 'true'; }

  return { ensureSheets: ensureSheets, activateAll: activateAll, validateAll: validateAll, validatePlugin: validatePlugin, refreshAll: refreshAll, summary: summary };
})();

function reosPluginLifecycleActivateAll() { var result = REOS.PluginLifecycle.activateAll(); SpreadsheetApp.getUi().alert('REOS Plugin Lifecycle Activate', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }
function reosPluginLifecycleValidateAll() { var result = REOS.PluginLifecycle.validateAll(); SpreadsheetApp.getUi().alert('REOS Plugin Lifecycle Validate', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }
function reosPluginLifecycleRefreshAll() { var result = REOS.PluginLifecycle.refreshAll(); SpreadsheetApp.getUi().alert('REOS Plugin Lifecycle Refresh', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }
function reosPluginLifecycleSummary() { var result = REOS.PluginLifecycle.summary(); SpreadsheetApp.getUi().alert('REOS Plugin Lifecycle Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }

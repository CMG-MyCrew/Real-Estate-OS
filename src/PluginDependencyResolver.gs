/**
 * REOS Enterprise v3.3.4 - Plugin Dependency Resolver
 * Sprint 4 Increment 5
 *
 * Resolves plugin load order, required plugin relationships, missing sheets,
 * missing integrations, and capability dependencies.
 */

var REOS = REOS || {};

REOS.PluginDependencyResolver = (function () {
  var GRAPH = 'PLUGIN_DEPENDENCY_GRAPH';
  var RESULTS = 'PLUGIN_DEPENDENCY_RESULTS';
  var GH = ['Dependency ID', 'Plugin Key', 'Depends On', 'Dependency Type', 'Required', 'Status', 'Message', 'Created At'];
  var RH = ['Resolution ID', 'Plugin Key', 'Status', 'Load Order', 'Missing Dependencies', 'Warnings', 'Details JSON', 'Checked At'];

  var DEFAULT_DEPENDENCIES = {
    operations: [],
    foundation: [],
    finance: ['foundation', 'operations'],
    portals: ['foundation', 'operations'],
    applications: ['foundation', 'operations']
  };

  function ensureSheets() {
    REOS.Database.ensureTable(GRAPH, GH);
    REOS.Database.ensureTable(RESULTS, RH);
  }

  function syncGraph() {
    ensureSheets();
    clearBody_(GRAPH);
    getPlugins_().forEach(function (plugin) {
      var dependencies = DEFAULT_DEPENDENCIES[plugin.key] || plugin.dependencies || [];
      if (!dependencies.length) {
        writeGraph_(plugin.key, '', 'root', false, 'Ready', 'No plugin dependencies.');
      }
      dependencies.forEach(function (dep) {
        writeGraph_(plugin.key, dep, 'plugin', true, 'Pending', 'Dependency registered.');
      });
      (plugin.sheets || []).forEach(function (sheetName) {
        writeGraph_(plugin.key, sheetName, 'sheet', true, 'Pending', 'Required sheet registered.');
      });
      (plugin.integrations || []).forEach(function (integration) {
        writeGraph_(plugin.key, integration, 'integration', false, 'Pending', 'Integration dependency registered.');
      });
    });
    return REOS.Database.getAll(GRAPH);
  }

  function resolveAll() {
    ensureSheets();
    var plugins = getPlugins_();
    var order = resolveLoadOrder_(plugins);
    var results = plugins.map(function (plugin) { return resolvePlugin_(plugin, order.indexOf(plugin.key) + 1); });
    clearBody_(RESULTS);
    results.forEach(function (result) {
      REOS.Database.insert(RESULTS, {
        'Plugin Key': result.pluginKey,
        Status: result.status,
        'Load Order': result.loadOrder,
        'Missing Dependencies': result.missingDependencies.join(', '),
        Warnings: result.warnings.join(', '),
        'Details JSON': REOS.toJson_(result),
        'Checked At': new Date()
      }, { idField: 'Resolution ID', idPrefix: 'PDEP' });
    });
    return summaryFromResults_(results, order);
  }

  function resolvePlugin_(plugin, loadOrder) {
    var pluginKeys = getPlugins_().map(function (p) { return p.key; });
    var dependencies = DEFAULT_DEPENDENCIES[plugin.key] || plugin.dependencies || [];
    var missing = [];
    var warnings = [];
    dependencies.forEach(function (dep) { if (pluginKeys.indexOf(dep) === -1) missing.push('plugin:' + dep); });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    (plugin.sheets || []).forEach(function (sheetName) { if (!ss.getSheetByName(sheetName)) missing.push('sheet:' + sheetName); });
    (plugin.integrations || []).forEach(function (integration) { warnings.push('integration:' + integration); });
    return {
      pluginKey: plugin.key,
      status: missing.length ? 'Blocked' : warnings.length ? 'ReadyWithWarnings' : 'Ready',
      loadOrder: loadOrder,
      missingDependencies: missing,
      warnings: warnings,
      dependencies: dependencies,
      capabilityCount: countCapabilities_(plugin)
    };
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(RESULTS);
    return {
      ok: rows.filter(function (row) { return row.Status === 'Blocked'; }).length === 0,
      generatedAt: new Date().toISOString(),
      total: rows.length,
      ready: rows.filter(function (row) { return row.Status === 'Ready'; }).length,
      warning: rows.filter(function (row) { return row.Status === 'ReadyWithWarnings'; }).length,
      blocked: rows.filter(function (row) { return row.Status === 'Blocked'; }).length,
      results: rows
    };
  }

  function summaryFromResults_(results, order) {
    return {
      ok: results.filter(function (r) { return r.status === 'Blocked'; }).length === 0,
      generatedAt: new Date().toISOString(),
      loadOrder: order,
      total: results.length,
      ready: results.filter(function (r) { return r.status === 'Ready'; }).length,
      warning: results.filter(function (r) { return r.status === 'ReadyWithWarnings'; }).length,
      blocked: results.filter(function (r) { return r.status === 'Blocked'; }).length,
      results: results
    };
  }

  function resolveLoadOrder_(plugins) {
    var keys = plugins.map(function (p) { return p.key; });
    var visited = {};
    var output = [];
    function visit(key) {
      if (visited[key]) return;
      visited[key] = true;
      (DEFAULT_DEPENDENCIES[key] || []).forEach(function (dep) { if (keys.indexOf(dep) !== -1) visit(dep); });
      output.push(key);
    }
    keys.forEach(visit);
    return output;
  }

  function writeGraph_(pluginKey, dependsOn, type, required, status, message) {
    return REOS.Database.insert(GRAPH, {
      'Plugin Key': pluginKey,
      'Depends On': dependsOn,
      'Dependency Type': type,
      Required: required,
      Status: status,
      Message: message,
      'Created At': new Date()
    }, { idField: 'Dependency ID', idPrefix: 'PDG' });
  }

  function getPlugins_() {
    if (!(REOS.PluginManager && REOS.PluginManager.summary)) throw new Error('PluginManager is not available.');
    REOS.PluginManager.registerDefaults();
    return REOS.PluginManager.summary().plugins || [];
  }

  function countCapabilities_(plugin) {
    return ['diagnostics', 'repairs', 'routes', 'jobs', 'permissions', 'dashboards', 'sheets', 'integrations'].reduce(function (sum, key) { return sum + ((plugin[key] || []).length); }, plugin.menuGroup ? 1 : 0);
  }

  function clearBody_(sheetName) {
    var sheet = REOS.Database.getSheet(sheetName);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  return { ensureSheets: ensureSheets, syncGraph: syncGraph, resolveAll: resolveAll, summary: summary };
})();

function reosPluginDependencySyncGraph() { var result = REOS.PluginDependencyResolver.syncGraph(); SpreadsheetApp.getUi().alert('REOS Plugin Dependency Graph', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }
function reosPluginDependencyResolveAll() { var result = REOS.PluginDependencyResolver.resolveAll(); SpreadsheetApp.getUi().alert('REOS Plugin Dependency Resolver', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }
function reosPluginDependencySummary() { var result = REOS.PluginDependencyResolver.summary(); SpreadsheetApp.getUi().alert('REOS Plugin Dependency Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK); return result; }

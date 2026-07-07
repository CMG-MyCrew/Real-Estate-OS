/**
 * REOS Enterprise v3.3.0 - Plugin Architecture Foundation
 * Sprint 4 Increment 1
 *
 * Central registry for plugin manifests, lifecycle hooks, menu contributions,
 * diagnostics, self-healing hooks, and capability discovery.
 */

var REOS = REOS || {};

REOS.PluginManager = (function () {
  var PLUGINS_SHEET = 'PLUGIN_REGISTRY';
  var CAPABILITIES_SHEET = 'PLUGIN_CAPABILITIES';
  var HEALTH_SHEET = 'PLUGIN_HEALTH';

  var PLUGIN_HEADERS = ['Plugin Key', 'Name', 'Version', 'Module', 'Enabled', 'Status', 'Load Order', 'Description', 'Manifest JSON', 'Updated At'];
  var CAPABILITY_HEADERS = ['Capability ID', 'Plugin Key', 'Type', 'Name', 'Handler', 'Enabled', 'Details JSON', 'Created At'];
  var HEALTH_HEADERS = ['Health ID', 'Plugin Key', 'Status', 'Message', 'Details JSON', 'Checked At'];

  var manifests = {};

  function ensureSheets() {
    REOS.Database.ensureTable(PLUGINS_SHEET, PLUGIN_HEADERS);
    REOS.Database.ensureTable(CAPABILITIES_SHEET, CAPABILITY_HEADERS);
    REOS.Database.ensureTable(HEALTH_SHEET, HEALTH_HEADERS);
  }

  function register(manifest) {
    if (!manifest || !manifest.key) throw new Error('Plugin manifest requires a key.');
    manifests[manifest.key] = normalizeManifest_(manifest);
    return manifests[manifest.key];
  }

  function registerDefaults() {
    register({ key: 'operations', name: 'Operations Console', version: '3.3.0', module: 'Core', enabled: true, order: 10, description: 'Diagnostics, self-healing, environment, integration, performance, and error center tools.', menuGroup: 'operations' });
    register({ key: 'foundation', name: 'Foundation Tools', version: '3.3.0', module: 'Core', enabled: true, order: 20, description: 'Upgrade, core diagnostics, and module initialization tools.', menuGroup: 'foundation' });
    register({ key: 'finance', name: 'Finance Suite', version: '3.1.x', module: 'Finance', enabled: true, order: 30, description: 'Finance manager, dashboards, and QuickBooks connector.', menuGroup: 'finance' });
    register({ key: 'portals', name: 'Portal Suite', version: '3.2.x', module: 'Portal', enabled: true, order: 40, description: 'Investor, vendor, client, and lender portals.', menuGroup: 'portal' });
    register({ key: 'applications', name: 'Core Applications', version: '3.x', module: 'Apps', enabled: true, order: 50, description: 'Dashboard, CRM, documents, automation, AI, and admin tools.', menuGroup: 'apps' });
    return list();
  }

  function sync() {
    ensureSheets();
    registerDefaults();
    var existing = REOS.Database.getAll(PLUGINS_SHEET).reduce(function (map, row) {
      map[row['Plugin Key']] = row;
      return map;
    }, {});
    Object.keys(manifests).forEach(function (key) {
      var manifest = manifests[key];
      var record = {
        'Plugin Key': manifest.key,
        Name: manifest.name,
        Version: manifest.version,
        Module: manifest.module,
        Enabled: manifest.enabled,
        Status: manifest.enabled ? 'Enabled' : 'Disabled',
        'Load Order': manifest.order,
        Description: manifest.description,
        'Manifest JSON': REOS.toJson_(manifest),
        'Updated At': new Date()
      };
      if (existing[key]) REOS.Database.update(PLUGINS_SHEET, 'Plugin Key', key, record);
      else REOS.Database.insert(PLUGINS_SHEET, record, {});
    });
    syncCapabilities_();
    return list();
  }

  function list() {
    return Object.keys(manifests).map(function (key) { return manifests[key]; }).sort(function (a, b) { return a.order - b.order; });
  }

  function get(key) {
    return manifests[key] || null;
  }

  function isEnabled(key) {
    var manifest = get(key);
    return !!(manifest && manifest.enabled);
  }

  function setEnabled(key, enabled) {
    ensureSheets();
    if (!manifests[key]) registerDefaults();
    if (!manifests[key]) throw new Error('Unknown plugin: ' + key);
    manifests[key].enabled = !!enabled;
    return sync();
  }

  function applyMenuContributions() {
    if (!(REOS.MenuRegistry && typeof REOS.MenuRegistry.registerGroup === 'function')) return [];
    registerDefaults();
    return list().filter(function (plugin) { return plugin.enabled && plugin.menuGroup; }).map(function (plugin) {
      return { plugin: plugin.key, menuGroup: plugin.menuGroup, status: 'Registered' };
    });
  }

  function healthReport() {
    ensureSheets();
    registerDefaults();
    clearBody_(HEALTH_SHEET);
    var rows = list().map(function (plugin) {
      var status = plugin.enabled ? 'Ready' : 'Disabled';
      var message = plugin.enabled ? 'Plugin enabled and registered.' : 'Plugin disabled.';
      return REOS.Database.insert(HEALTH_SHEET, {
        'Plugin Key': plugin.key,
        Status: status,
        Message: message,
        'Details JSON': REOS.toJson_(plugin),
        'Checked At': new Date()
      }, { idField: 'Health ID', idPrefix: 'PHLT' });
    });
    return { ok: true, generatedAt: new Date().toISOString(), plugins: rows };
  }

  function summary() {
    registerDefaults();
    var plugins = list();
    return { ok: true, total: plugins.length, enabled: plugins.filter(function (p) { return p.enabled; }).length, disabled: plugins.filter(function (p) { return !p.enabled; }).length, plugins: plugins };
  }

  function syncCapabilities_() {
    clearBody_(CAPABILITIES_SHEET);
    list().forEach(function (plugin) {
      if (plugin.menuGroup) {
        REOS.Database.insert(CAPABILITIES_SHEET, {
          'Plugin Key': plugin.key,
          Type: 'menu',
          Name: plugin.menuGroup,
          Handler: 'REOS.MenuRegistry',
          Enabled: plugin.enabled,
          'Details JSON': REOS.toJson_({ menuGroup: plugin.menuGroup }),
          'Created At': new Date()
        }, { idField: 'Capability ID', idPrefix: 'PCAP' });
      }
    });
  }

  function normalizeManifest_(manifest) {
    return {
      key: manifest.key,
      name: manifest.name || manifest.key,
      version: manifest.version || '1.0.0',
      module: manifest.module || manifest.key,
      enabled: manifest.enabled !== false,
      order: Number(manifest.order || 1000),
      description: manifest.description || '',
      menuGroup: manifest.menuGroup || '',
      diagnostics: manifest.diagnostics || [],
      repairs: manifest.repairs || [],
      routes: manifest.routes || [],
      jobs: manifest.jobs || [],
      permissions: manifest.permissions || []
    };
  }

  function clearBody_(sheetName) {
    var sheet = REOS.Database.getSheet(sheetName);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  return { ensureSheets: ensureSheets, register: register, registerDefaults: registerDefaults, sync: sync, list: list, get: get, isEnabled: isEnabled, setEnabled: setEnabled, applyMenuContributions: applyMenuContributions, healthReport: healthReport, summary: summary };
})();

function reosPluginSync() {
  var result = REOS.PluginManager.sync();
  SpreadsheetApp.getUi().alert('REOS Plugin Sync', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosPluginSummary() {
  var result = REOS.PluginManager.summary();
  SpreadsheetApp.getUi().alert('REOS Plugin Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosPluginHealthReport() {
  var result = REOS.PluginManager.healthReport();
  SpreadsheetApp.getUi().alert('REOS Plugin Health', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

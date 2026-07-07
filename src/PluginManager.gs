/**
 * REOS Enterprise v3.3.1 - Plugin Capabilities
 * Sprint 4 Increment 2
 *
 * Expands plugin manifests with declared diagnostics, repairs, routes,
 * scheduled jobs, permissions, menus, dashboards, sheets, and integrations.
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
    register({
      key: 'operations', name: 'Operations Console', version: '3.3.1', module: 'Core', enabled: true, order: 10,
      description: 'Diagnostics, self-healing, environment, integration, performance, and error center tools.', menuGroup: 'operations',
      diagnostics: ['reosRunDiagnostics', 'reosRunEnvironmentValidation', 'reosRunIntegrationMonitor', 'reosRunPerformanceMonitor', 'reosRunErrorScan'],
      repairs: ['reosRunSelfHealing'],
      routes: ['operations.health', 'operations.errors', 'operations.performance'],
      jobs: ['dailyOperationsAudit', 'weeklyErrorReview'],
      permissions: ['Admin', 'Owner'],
      dashboards: ['ErrorDashboard'],
      sheets: ['DIAGNOSTIC_RUNS', 'DIAGNOSTIC_CHECKS', 'SYSTEM_ENVIRONMENT', 'SYSTEM_ENVIRONMENT_HISTORY', 'INTEGRATION_STATUS', 'INTEGRATION_HISTORY', 'SYSTEM_PERFORMANCE', 'SYSTEM_PERFORMANCE_HISTORY', 'SYSTEM_ERRORS', 'SYSTEM_ERROR_HISTORY'],
      integrations: ['GoogleDrive', 'Gmail', 'Calendar', 'UrlFetch']
    });

    register({
      key: 'foundation', name: 'Foundation Tools', version: '3.3.1', module: 'Core', enabled: true, order: 20,
      description: 'Upgrade, core diagnostics, module initialization, menu registry, and plugin registry tools.', menuGroup: 'foundation',
      diagnostics: ['reosCoreDiagnostics', 'reosModulesHealthReport', 'reosPluginHealthReport'],
      repairs: ['installREOS', 'reosCoreSyncModules', 'reosModulesSyncEnabled'],
      routes: ['foundation.modules', 'foundation.plugins', 'foundation.menu'],
      jobs: ['startupHealthCheck'],
      permissions: ['Admin', 'Owner'],
      dashboards: ['DashboardHub'],
      sheets: ['MODULE_REGISTRY', 'MODULE_DEPENDENCIES', 'MODULE_HEALTH', 'PLUGIN_REGISTRY', 'PLUGIN_CAPABILITIES', 'PLUGIN_HEALTH'],
      integrations: []
    });

    register({
      key: 'finance', name: 'Finance Suite', version: '3.3.1', module: 'Finance', enabled: true, order: 30,
      description: 'Finance manager, dashboards, QuickBooks connector, invoices, expenses, budgets, and payment readiness.', menuGroup: 'finance',
      diagnostics: ['showFinanceManager', 'showFinanceDashboards', 'showQuickBooksConnector'],
      repairs: ['reosRunSelfHealing'],
      routes: ['finance.invoices', 'finance.expenses', 'finance.payments', 'finance.quickbooks'],
      jobs: ['dailyFinanceSnapshot', 'weeklyReceivablesReview'],
      permissions: ['Admin', 'Owner', 'Accountant'],
      dashboards: ['FinanceManager', 'FinanceDashboards'],
      sheets: ['FIN_INVOICES', 'FIN_INVOICE_LINES', 'FIN_VENDOR_PAYMENTS', 'FIN_EXPENSES', 'FIN_PAYMENT_APPROVALS', 'FIN_QB_EXPORTS', 'FIN_ACCOUNT_CATEGORIES', 'FIN_DASHBOARD_SNAPSHOTS', 'QB_CONNECTIONS', 'QB_SYNC_LOG'],
      integrations: ['QuickBooks', 'Stripe']
    });

    register({
      key: 'portals', name: 'Portal Suite', version: '3.3.1', module: 'Portal', enabled: true, order: 40,
      description: 'Investor, vendor, client, lender, portal authentication, notifications, and activity feeds.', menuGroup: 'portal',
      diagnostics: ['showPortalFoundation', 'showPortalAuth', 'showInvestorPortal', 'showVendorPortalUI', 'showClientLenderPortal'],
      repairs: ['reosRunSelfHealing'],
      routes: ['portal.login', 'portal.investor', 'portal.vendor', 'portal.client', 'portal.lender'],
      jobs: ['portalSessionCleanup', 'portalNotificationSweep'],
      permissions: ['Admin', 'Owner', 'Manager', 'Investor', 'Vendor', 'Client', 'Lender'],
      dashboards: ['PortalFoundation', 'PortalAuth', 'InvestorPortal', 'VendorPortal', 'ClientLenderPortal'],
      sheets: ['PORTAL_ACCOUNTS', 'PORTAL_SESSIONS', 'PORTAL_INVITATIONS', 'PORTAL_DOCUMENT_SHARES', 'PORTAL_MESSAGES', 'PORTAL_TASKS', 'PORTAL_ACTIVITY_LOG', 'PORTAL_LOGIN_EVENTS', 'PORTAL_ROUTES', 'PORTAL_NOTIFICATIONS', 'PORTAL_NOTIFICATION_QUEUE', 'PORTAL_ACTIVITY_FEED'],
      integrations: ['GoogleDrive', 'Gmail']
    });

    register({
      key: 'applications', name: 'Core Applications', version: '3.3.1', module: 'Apps', enabled: true, order: 50,
      description: 'Dashboard, CRM, documents, automation, AI, admin, acquisitions, vendors, and properties.', menuGroup: 'apps',
      diagnostics: ['showDashboardHub', 'showCRM', 'showDocuments', 'showAutomation', 'showAI', 'showAdmin'],
      repairs: ['reosRunSelfHealing'],
      routes: ['app.dashboard', 'app.crm', 'app.documents', 'app.automation', 'app.ai', 'app.admin'],
      jobs: ['dailyDashboardRefresh', 'automationQueueSweep'],
      permissions: ['Admin', 'Owner', 'Manager', 'Agent'],
      dashboards: ['DashboardHub', 'CRM', 'Documents', 'Automation', 'AI', 'Admin'],
      sheets: ['CRM', 'LEADS', 'TASKS', 'ACTIVITIES', 'CUSTOMERS', 'PROPERTIES', 'VENDORS', 'WORK_ORDERS', 'DOCUMENTS'],
      integrations: ['GoogleDrive', 'Gmail', 'Calendar']
    });
    return list();
  }

  function sync() {
    ensureSheets();
    registerDefaults();
    var existing = REOS.Database.getAll(PLUGINS_SHEET).reduce(function (map, row) { map[row['Plugin Key']] = row; return map; }, {});
    Object.keys(manifests).forEach(function (key) {
      var manifest = manifests[key];
      var record = {
        'Plugin Key': manifest.key, Name: manifest.name, Version: manifest.version, Module: manifest.module, Enabled: manifest.enabled,
        Status: manifest.enabled ? 'Enabled' : 'Disabled', 'Load Order': manifest.order, Description: manifest.description,
        'Manifest JSON': REOS.toJson_(manifest), 'Updated At': new Date()
      };
      if (existing[key]) REOS.Database.update(PLUGINS_SHEET, 'Plugin Key', key, record);
      else REOS.Database.insert(PLUGINS_SHEET, record, {});
    });
    syncCapabilities_();
    return list();
  }

  function list() { return Object.keys(manifests).map(function (key) { return manifests[key]; }).sort(function (a, b) { return a.order - b.order; }); }
  function get(key) { return manifests[key] || null; }
  function isEnabled(key) { var manifest = get(key); return !!(manifest && manifest.enabled); }

  function setEnabled(key, enabled) {
    ensureSheets();
    if (!manifests[key]) registerDefaults();
    if (!manifests[key]) throw new Error('Unknown plugin: ' + key);
    manifests[key].enabled = !!enabled;
    return sync();
  }

  function capabilities(type) {
    registerDefaults();
    var rows = [];
    list().forEach(function (plugin) {
      expandCapabilities_(plugin).forEach(function (capability) {
        if (!type || capability.type === type) rows.push(capability);
      });
    });
    return rows;
  }

  function byCapability(type, name) {
    return capabilities(type).filter(function (capability) { return !name || capability.name === name || capability.handler === name; });
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
      var caps = expandCapabilities_(plugin);
      var status = plugin.enabled ? 'Ready' : 'Disabled';
      var message = plugin.enabled ? 'Plugin enabled with ' + caps.length + ' capabilities.' : 'Plugin disabled.';
      return REOS.Database.insert(HEALTH_SHEET, {
        'Plugin Key': plugin.key, Status: status, Message: message,
        'Details JSON': REOS.toJson_({ plugin: plugin, capabilityCount: caps.length }), 'Checked At': new Date()
      }, { idField: 'Health ID', idPrefix: 'PHLT' });
    });
    return { ok: true, generatedAt: new Date().toISOString(), plugins: rows };
  }

  function summary() {
    registerDefaults();
    var plugins = list();
    var caps = capabilities();
    return {
      ok: true,
      total: plugins.length,
      enabled: plugins.filter(function (p) { return p.enabled; }).length,
      disabled: plugins.filter(function (p) { return !p.enabled; }).length,
      capabilityCount: caps.length,
      capabilitiesByType: groupCount_(caps, 'type'),
      plugins: plugins
    };
  }

  function syncCapabilities_() {
    clearBody_(CAPABILITIES_SHEET);
    capabilities().forEach(function (capability) {
      REOS.Database.insert(CAPABILITIES_SHEET, {
        'Plugin Key': capability.pluginKey, Type: capability.type, Name: capability.name, Handler: capability.handler,
        Enabled: capability.enabled, 'Details JSON': REOS.toJson_(capability.details || {}), 'Created At': new Date()
      }, { idField: 'Capability ID', idPrefix: 'PCAP' });
    });
  }

  function expandCapabilities_(plugin) {
    var enabled = plugin.enabled;
    var output = [];
    if (plugin.menuGroup) output.push(cap_(plugin, 'menu', plugin.menuGroup, 'REOS.MenuRegistry', { menuGroup: plugin.menuGroup }, enabled));
    (plugin.diagnostics || []).forEach(function (handler) { output.push(cap_(plugin, 'diagnostic', handler, handler, {}, enabled)); });
    (plugin.repairs || []).forEach(function (handler) { output.push(cap_(plugin, 'repair', handler, handler, {}, enabled)); });
    (plugin.routes || []).forEach(function (route) { output.push(cap_(plugin, 'route', route, route, {}, enabled)); });
    (plugin.jobs || []).forEach(function (job) { output.push(cap_(plugin, 'job', job, job, {}, enabled)); });
    (plugin.permissions || []).forEach(function (role) { output.push(cap_(plugin, 'permission', role, role, {}, enabled)); });
    (plugin.dashboards || []).forEach(function (dashboard) { output.push(cap_(plugin, 'dashboard', dashboard, dashboard, {}, enabled)); });
    (plugin.sheets || []).forEach(function (sheet) { output.push(cap_(plugin, 'sheet', sheet, sheet, {}, enabled)); });
    (plugin.integrations || []).forEach(function (integration) { output.push(cap_(plugin, 'integration', integration, integration, {}, enabled)); });
    return output;
  }

  function cap_(plugin, type, name, handler, details, enabled) {
    return { pluginKey: plugin.key, type: type, name: name, handler: handler, enabled: enabled, details: details || {} };
  }

  function normalizeManifest_(manifest) {
    return {
      key: manifest.key, name: manifest.name || manifest.key, version: manifest.version || '1.0.0', module: manifest.module || manifest.key,
      enabled: manifest.enabled !== false, order: Number(manifest.order || 1000), description: manifest.description || '', menuGroup: manifest.menuGroup || '',
      diagnostics: manifest.diagnostics || [], repairs: manifest.repairs || [], routes: manifest.routes || [], jobs: manifest.jobs || [], permissions: manifest.permissions || [],
      dashboards: manifest.dashboards || [], sheets: manifest.sheets || [], integrations: manifest.integrations || []
    };
  }

  function groupCount_(rows, field) {
    return rows.reduce(function (map, row) { var key = row[field] || 'Unknown'; map[key] = (map[key] || 0) + 1; return map; }, {});
  }

  function clearBody_(sheetName) {
    var sheet = REOS.Database.getSheet(sheetName);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  return {
    ensureSheets: ensureSheets, register: register, registerDefaults: registerDefaults, sync: sync, list: list, get: get,
    isEnabled: isEnabled, setEnabled: setEnabled, capabilities: capabilities, byCapability: byCapability,
    applyMenuContributions: applyMenuContributions, healthReport: healthReport, summary: summary
  };
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
function reosPluginCapabilities() {
  var result = REOS.PluginManager.capabilities();
  SpreadsheetApp.getUi().alert('REOS Plugin Capabilities', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

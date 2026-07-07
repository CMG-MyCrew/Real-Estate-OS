/**
 * REOS Enterprise v3.2.8 - Core Foundation Synchronization
 *
 * Centralizes startup checks, module registration, safe UI launching,
 * dependency diagnostics, and foundation health validation.
 */

var REOS = REOS || {};

REOS.CoreFoundation = (function () {
  const CORE_VERSION = '3.2.8';

  const REQUIRED_FUNCTIONS = [
    'REOS.CONFIG',
    'REOS.Database.ensureTable',
    'REOS.Database.getAll',
    'REOS.Database.insert',
    'REOS.Database.update',
    'REOS.getSheet_',
    'REOS.generateId_',
    'REOS.toJson_',
    'REOS.log_'
  ];

  const MODULE_REGISTRY = [
    { name: 'Phase1Upgrade', label: 'Phase 1 Upgrade', required: true },
    { name: 'Modules', label: 'Module Registry', required: true },
    { name: 'FinanceManager', label: 'Finance Manager', required: false },
    { name: 'FinanceEnhancements', label: 'Finance Enhancements', required: false },
    { name: 'FinanceDashboards', label: 'Finance Dashboards', required: false },
    { name: 'QuickBooksConnector', label: 'QuickBooks Connector', required: false },
    { name: 'QuickBooksOAuth', label: 'QuickBooks OAuth', required: false },
    { name: 'PortalFoundation', label: 'Portal Foundation', required: false },
    { name: 'PortalAuth', label: 'Portal Auth', required: false },
    { name: 'InvestorPortal', label: 'Investor Portal', required: false },
    { name: 'VendorPortal', label: 'Vendor Portal', required: false },
    { name: 'ClientLenderPortal', label: 'Client/Lender Portal', required: false },
    { name: 'Documents', label: 'Documents', required: false },
    { name: 'Automation', label: 'Automation', required: false },
    { name: 'AI', label: 'AI Workspace', required: false }
  ];

  const CORE_TABLES = {
    SYSTEM_LOG: ['Timestamp', 'Level', 'User', 'Action', 'Details'],
    SYSTEM_AUDIT: ['Audit ID', 'User', 'Action', 'Module', 'Record ID', 'Details JSON', 'Created At'],
    SETTINGS: ['Setting', 'Value', 'Description'],
    LOOKUPS: ['Category', 'Value', 'Sort Order', 'Active']
  };

  function startup() {
    ensureCoreTables();
    syncVersion();
    if (REOS.Modules && typeof REOS.Modules.ensureSheets === 'function') REOS.Modules.ensureSheets();
    if (REOS.Modules && typeof REOS.Modules.seedRegistry === 'function') REOS.Modules.seedRegistry();
    const diagnostics = diagnose();
    log(diagnostics.ok ? 'INFO' : 'WARN', diagnostics.ok ? 'Core startup completed' : 'Core startup diagnostics reported issues', diagnostics);
    return diagnostics;
  }

  function ensureCoreTables() {
    Object.keys(CORE_TABLES).forEach(function (key) {
      const sheetName = REOS.CONFIG.SHEETS[key] || key;
      if (REOS.Database && typeof REOS.Database.ensureTable === 'function') {
        REOS.Database.ensureTable(sheetName, CORE_TABLES[key]);
      }
    });
  }

  function ensureModuleSheets() {
    if (REOS.Modules && typeof REOS.Modules.initializeEnabledModules === 'function') return REOS.Modules.initializeEnabledModules();
    const results = [];
    MODULE_REGISTRY.forEach(function (module) {
      const namespace = REOS[module.name];
      const exists = !!namespace;
      const hasEnsureSheets = exists && typeof namespace.ensureSheets === 'function';
      let status = exists ? 'Registered' : 'Missing';
      let message = '';
      if (hasEnsureSheets) {
        try {
          namespace.ensureSheets();
          status = 'Ready';
        } catch (error) {
          status = 'Error';
          message = error.message;
        }
      }
      results.push({ module: module.name, label: module.label, required: module.required, status: status, message: message });
    });
    return results;
  }

  function diagnose() {
    const requiredFunctions = REQUIRED_FUNCTIONS.map(function (path) {
      return { path: path, exists: resolvePath_(path) !== undefined };
    });
    const modules = MODULE_REGISTRY.map(function (module) {
      const namespace = REOS[module.name];
      return {
        module: module.name,
        label: module.label,
        required: module.required,
        registered: !!namespace,
        hasEnsureSheets: !!(namespace && typeof namespace.ensureSheets === 'function')
      };
    });
    const moduleRegistryHealth = REOS.Modules && typeof REOS.Modules.healthReport === 'function' ? REOS.Modules.healthReport() : null;
    const missingRequiredFunctions = requiredFunctions.filter(function (item) { return !item.exists; });
    const missingRequiredModules = modules.filter(function (item) { return item.required && !item.registered; });
    return {
      ok: missingRequiredFunctions.length === 0 && missingRequiredModules.length === 0 && (!moduleRegistryHealth || moduleRegistryHealth.ok),
      version: getVersion(),
      coreVersion: CORE_VERSION,
      generatedAt: new Date().toISOString(),
      requiredFunctions: requiredFunctions,
      modules: modules,
      moduleRegistryHealth: moduleRegistryHealth,
      missingRequiredFunctions: missingRequiredFunctions,
      missingRequiredModules: missingRequiredModules
    };
  }

  function healthCheck() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const messages = ['REOS Version: ' + getVersion(), 'Core Foundation: ' + CORE_VERSION];
    let ok = true;
    Object.keys(REOS.CONFIG.SHEETS || {}).forEach(function (key) {
      const name = REOS.CONFIG.SHEETS[key];
      const exists = !!ss.getSheetByName(name);
      if (!exists) ok = false;
      messages.push((exists ? 'OK' : 'MISSING') + ': ' + name);
    });
    ['MODULE_REGISTRY', 'MODULE_DEPENDENCIES', 'MODULE_HEALTH'].forEach(function (name) {
      const exists = !!ss.getSheetByName(name);
      if (!exists) ok = false;
      messages.push((exists ? 'OK' : 'MISSING') + ': ' + name);
    });
    const diagnostics = diagnose();
    diagnostics.missingRequiredFunctions.forEach(function (item) {
      ok = false;
      messages.push('MISSING FUNCTION: ' + item.path);
    });
    diagnostics.missingRequiredModules.forEach(function (item) {
      ok = false;
      messages.push('MISSING REQUIRED MODULE: ' + item.module);
    });
    return { ok: ok && diagnostics.ok, version: getVersion(), coreVersion: CORE_VERSION, messages: messages, diagnostics: diagnostics };
  }

  function syncVersion() {
    if (REOS.setProperty_) {
      REOS.setProperty_('REOS_VERSION', getVersion());
      REOS.setProperty_('REOS_CORE_VERSION', CORE_VERSION);
    }
  }

  function getVersion() {
    return (REOS.CONFIG && REOS.CONFIG.APP && REOS.CONFIG.APP.VERSION) || CORE_VERSION;
  }

  function safeOpen(file, title, width, height) {
    try {
      const html = HtmlService.createHtmlOutputFromFile(file).setTitle(title).setWidth(width || 1200).setHeight(height || 800);
      SpreadsheetApp.getUi().showModalDialog(html, title);
      return true;
    } catch (error) {
      SpreadsheetApp.getUi().alert(title + ' is not available yet.\n\n' + error.message);
      return false;
    }
  }

  function log(level, action, details) {
    if (REOS.log_) return REOS.log_(level, action, details || {});
    try { console.log(level + ': ' + action + ' ' + JSON.stringify(details || {})); } catch (ignore) {}
  }

  function resolvePath_(path) {
    if (path === 'REOS.CONFIG') return REOS.CONFIG;
    const parts = String(path || '').split('.');
    let cursor = globalThis;
    for (let i = 0; i < parts.length; i++) {
      if (cursor === undefined || cursor === null) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  return {
    CORE_VERSION: CORE_VERSION,
    MODULE_REGISTRY: MODULE_REGISTRY,
    startup: startup,
    ensureCoreTables: ensureCoreTables,
    ensureModuleSheets: ensureModuleSheets,
    diagnose: diagnose,
    healthCheck: healthCheck,
    syncVersion: syncVersion,
    safeOpen: safeOpen,
    log: log
  };
})();

function reosCoreDiagnostics() {
  const report = REOS.CoreFoundation.diagnose();
  SpreadsheetApp.getUi().alert('REOS Core Diagnostics', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

function reosCoreSyncModules() {
  const results = REOS.CoreFoundation.ensureModuleSheets();
  SpreadsheetApp.getUi().alert('REOS Module Sync', JSON.stringify(results, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return results;
}

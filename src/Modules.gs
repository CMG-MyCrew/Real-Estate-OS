/**
 * REOS Enterprise v3.2.8 - Module Registry & Dependency Injection
 *
 * Provides module metadata, dependency validation, lifecycle orchestration,
 * safe dependency resolution, and module health reporting.
 */

var REOS = REOS || {};

REOS.Modules = (function () {
  const REGISTRY_SHEET = 'MODULE_REGISTRY';
  const DEPENDENCY_SHEET = 'MODULE_DEPENDENCIES';
  const HEALTH_SHEET = 'MODULE_HEALTH';

  const REGISTRY_HEADERS = ['Module Key', 'Label', 'Namespace', 'Version', 'Required', 'Enabled', 'Status', 'Load Order', 'Description', 'Updated At'];
  const DEPENDENCY_HEADERS = ['Dependency ID', 'Module Key', 'Dependency Key', 'Required', 'Status', 'Message', 'Checked At'];
  const HEALTH_HEADERS = ['Health ID', 'Module Key', 'Status', 'Registered', 'Enabled', 'Has Ensure Sheets', 'Missing Dependencies', 'Message', 'Checked At'];

  const DEFINITIONS = [
    { key: 'core', label: 'Core Foundation', namespace: 'CoreFoundation', version: '3.2.8', required: true, enabled: true, order: 10, dependencies: [], description: 'Startup diagnostics and core health.' },
    { key: 'phase1', label: 'Phase 1 Upgrade', namespace: 'Phase1Upgrade', version: '3.2.6', required: true, enabled: true, order: 20, dependencies: ['core'], description: 'Workbook upgrade bridge.' },
    { key: 'database', label: 'Database', namespace: 'Database', version: '3.2.6', required: true, enabled: true, order: 30, dependencies: [], description: 'Sheet data access layer.' },
    { key: 'documents', label: 'Documents', namespace: 'Documents', version: '3.x', required: false, enabled: true, order: 100, dependencies: ['database'], description: 'Document management.' },
    { key: 'automation', label: 'Automation', namespace: 'Automation', version: '3.x', required: false, enabled: true, order: 110, dependencies: ['database'], description: 'Automation rules and runs.' },
    { key: 'financeManager', label: 'Finance Manager', namespace: 'FinanceManager', version: '3.1', required: false, enabled: true, order: 200, dependencies: ['database'], description: 'Invoices, payments, expenses.' },
    { key: 'financeEnhancements', label: 'Finance Enhancements', namespace: 'FinanceEnhancements', version: '3.1.1', required: false, enabled: true, order: 210, dependencies: ['financeManager'], description: 'Finance workflow enhancements.' },
    { key: 'financeDashboards', label: 'Finance Dashboards', namespace: 'FinanceDashboards', version: '3.1.3', required: false, enabled: true, order: 220, dependencies: ['financeManager'], description: 'Financial KPI dashboards.' },
    { key: 'quickBooksConnector', label: 'QuickBooks Connector', namespace: 'QuickBooksConnector', version: '3.1.2', required: false, enabled: true, order: 300, dependencies: ['financeManager'], description: 'QuickBooks sync foundation.' },
    { key: 'quickBooksOAuth', label: 'QuickBooks OAuth', namespace: 'QuickBooksOAuth', version: '3.1.2.2', required: false, enabled: true, order: 310, dependencies: ['quickBooksConnector'], description: 'QuickBooks OAuth and token foundation.' },
    { key: 'portalFoundation', label: 'Portal Foundation', namespace: 'PortalFoundation', version: '3.2', required: false, enabled: true, order: 400, dependencies: ['database'], description: 'Portal account/session/document/message/task foundation.' },
    { key: 'portalAuth', label: 'Portal Auth', namespace: 'PortalAuth', version: '3.2.1', required: false, enabled: true, order: 410, dependencies: ['portalFoundation'], description: 'Portal authentication and web app shell.' },
    { key: 'investorPortal', label: 'Investor Portal', namespace: 'InvestorPortal', version: '3.2.2', required: false, enabled: true, order: 420, dependencies: ['portalFoundation', 'financeDashboards'], description: 'Investor portal dashboard.' },
    { key: 'vendorPortal', label: 'Vendor Portal', namespace: 'VendorPortal', version: '3.2.3', required: false, enabled: true, order: 430, dependencies: ['portalFoundation'], description: 'Vendor portal dashboard.' },
    { key: 'clientLenderPortal', label: 'Client/Lender Portal', namespace: 'ClientLenderPortal', version: '3.2.4', required: false, enabled: true, order: 440, dependencies: ['portalFoundation'], description: 'Client and lender dashboards.' },
    { key: 'ai', label: 'AI Workspace', namespace: 'AI', version: '3.x', required: false, enabled: true, order: 500, dependencies: ['database'], description: 'AI workspace and assistants.' }
  ];

  function ensureSheets() {
    REOS.Database.ensureTable(REGISTRY_SHEET, REGISTRY_HEADERS);
    REOS.Database.ensureTable(DEPENDENCY_SHEET, DEPENDENCY_HEADERS);
    REOS.Database.ensureTable(HEALTH_SHEET, HEALTH_HEADERS);
  }

  function seedRegistry() {
    ensureSheets();
    const existing = REOS.Database.getAll(REGISTRY_SHEET).reduce(function (map, row) {
      map[row['Module Key']] = row;
      return map;
    }, {});
    let created = 0;
    let updated = 0;
    DEFINITIONS.forEach(function (def) {
      const record = {
        'Module Key': def.key,
        Label: def.label,
        Namespace: def.namespace,
        Version: def.version,
        Required: def.required,
        Enabled: def.enabled,
        Status: resolveNamespace_(def.namespace) ? 'Registered' : 'Missing',
        'Load Order': def.order,
        Description: def.description,
        'Updated At': new Date()
      };
      if (existing[def.key]) {
        REOS.Database.update(REGISTRY_SHEET, 'Module Key', def.key, record);
        updated++;
      } else {
        REOS.Database.insert(REGISTRY_SHEET, record, {});
        created++;
      }
    });
    return { ok: true, created: created, updated: updated, total: DEFINITIONS.length };
  }

  function listModules() {
    ensureSheets();
    seedRegistry();
    return REOS.Database.getAll(REGISTRY_SHEET).sort(function (a, b) { return Number(a['Load Order'] || 0) - Number(b['Load Order'] || 0); });
  }

  function getDefinition(key) {
    return DEFINITIONS.filter(function (def) { return def.key === key || def.namespace === key; })[0] || null;
  }

  function resolve(key) {
    const def = getDefinition(key);
    if (!def) throw new Error('Unknown module: ' + key);
    const namespace = resolveNamespace_(def.namespace);
    if (!namespace) throw new Error('Module namespace not registered: ' + def.namespace);
    return namespace;
  }

  function optional(key) {
    const def = getDefinition(key);
    return def ? resolveNamespace_(def.namespace) : null;
  }

  function validateDependencies() {
    ensureSheets();
    clearSheetBody_(DEPENDENCY_SHEET);
    const statusByKey = {};
    DEFINITIONS.forEach(function (def) {
      statusByKey[def.key] = !!resolveNamespace_(def.namespace);
    });
    const results = [];
    DEFINITIONS.forEach(function (def) {
      (def.dependencies || []).forEach(function (depKey) {
        const ok = !!statusByKey[depKey];
        const row = {
          'Module Key': def.key,
          'Dependency Key': depKey,
          Required: true,
          Status: ok ? 'Ready' : 'Missing',
          Message: ok ? 'Dependency available.' : 'Dependency is missing or not registered.',
          'Checked At': new Date()
        };
        const inserted = REOS.Database.insert(DEPENDENCY_SHEET, row, { idField: 'Dependency ID', idPrefix: 'DEP' });
        results.push(inserted);
      });
    });
    return results;
  }

  function healthReport() {
    ensureSheets();
    seedRegistry();
    const dependencies = validateDependencies();
    clearSheetBody_(HEALTH_SHEET);
    const rows = DEFINITIONS.map(function (def) {
      const namespace = resolveNamespace_(def.namespace);
      const depIssues = dependencies.filter(function (dep) { return dep['Module Key'] === def.key && dep.Status !== 'Ready'; });
      const status = !namespace ? (def.required ? 'Missing Required' : 'Missing Optional') : depIssues.length ? 'Dependency Warning' : 'Ready';
      return REOS.Database.insert(HEALTH_SHEET, {
        'Module Key': def.key,
        Status: status,
        Registered: !!namespace,
        Enabled: def.enabled,
        'Has Ensure Sheets': !!(namespace && typeof namespace.ensureSheets === 'function'),
        'Missing Dependencies': depIssues.map(function (d) { return d['Dependency Key']; }).join(', '),
        Message: buildHealthMessage_(def, namespace, depIssues),
        'Checked At': new Date()
      }, { idField: 'Health ID', idPrefix: 'MHLT' });
    });
    return { ok: rows.filter(function (r) { return r.Status === 'Missing Required'; }).length === 0, generatedAt: new Date().toISOString(), modules: rows, dependencies: dependencies };
  }

  function initializeEnabledModules() {
    const rows = listModules().filter(function (row) { return String(row.Enabled) === 'true' || row.Enabled === true; });
    const results = [];
    rows.forEach(function (row) {
      const namespace = resolveNamespace_(row.Namespace);
      if (!namespace) {
        results.push({ module: row['Module Key'], status: 'Missing' });
        return;
      }
      if (typeof namespace.ensureSheets === 'function') {
        try {
          namespace.ensureSheets();
          results.push({ module: row['Module Key'], status: 'Ready' });
        } catch (error) {
          results.push({ module: row['Module Key'], status: 'Error', message: error.message });
        }
      } else {
        results.push({ module: row['Module Key'], status: 'Registered' });
      }
    });
    return results;
  }

  function setEnabled(key, enabled) {
    ensureSheets();
    const def = getDefinition(key);
    if (!def) throw new Error('Unknown module: ' + key);
    return REOS.Database.update(REGISTRY_SHEET, 'Module Key', def.key, { Enabled: !!enabled, 'Updated At': new Date() });
  }

  function buildHealthMessage_(def, namespace, depIssues) {
    if (!namespace && def.required) return 'Required module is not registered.';
    if (!namespace) return 'Optional module is not currently loaded.';
    if (depIssues.length) return 'Missing dependencies: ' + depIssues.map(function (d) { return d['Dependency Key']; }).join(', ');
    return 'Module is ready.';
  }

  function resolveNamespace_(namespace) {
    if (namespace === 'Database') return REOS.Database;
    return REOS[namespace] || null;
  }

  function clearSheetBody_(sheetName) {
    const sheet = REOS.Database.getSheet(sheetName);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  return {
    ensureSheets: ensureSheets,
    seedRegistry: seedRegistry,
    listModules: listModules,
    getDefinition: getDefinition,
    resolve: resolve,
    optional: optional,
    validateDependencies: validateDependencies,
    healthReport: healthReport,
    initializeEnabledModules: initializeEnabledModules,
    setEnabled: setEnabled
  };
})();

function reosModulesEnsureSheets() { return REOS.Modules.ensureSheets(); }
function reosModulesSeedRegistry() { return REOS.Modules.seedRegistry(); }
function reosModulesHealthReport() {
  const report = REOS.Modules.healthReport();
  SpreadsheetApp.getUi().alert('REOS Module Health', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}
function reosModulesSyncEnabled() {
  const results = REOS.Modules.initializeEnabledModules();
  SpreadsheetApp.getUi().alert('REOS Module Initialization', JSON.stringify(results, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return results;
}
function reosModulesSetEnabled(key, enabled) { return REOS.Modules.setEnabled(key, enabled); }

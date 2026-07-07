/**
 * REOS Enterprise v3.2.9 - Self-Healing Engine
 * Sprint 3 Increment 2
 *
 * Repairs common production issues: missing sheets, headers,
 * script properties, lookup values, module registry tables, and diagnostics tables.
 */

var REOS = REOS || {};

REOS.SelfHealing = (function () {
  const REPAIR_LOG_SHEET = 'SYSTEM_REPAIR_LOG';
  const REPAIR_LOG_HEADERS = ['Repair ID', 'Run ID', 'Category', 'Action', 'Status', 'Message', 'Details JSON', 'Created At'];

  const TABLES = {
    SYSTEM_LOG: ['Timestamp', 'Level', 'User', 'Action', 'Details'],
    SYSTEM_AUDIT: ['Audit ID', 'User', 'Action', 'Module', 'Record ID', 'Details JSON', 'Created At'],
    SECURITY_POLICIES: ['Policy ID', 'Policy Name', 'Status', 'Details JSON', 'Created At', 'Updated At'],
    SECURITY_EVENTS: ['Security Event ID', 'Event Type', 'Severity', 'User', 'Details JSON', 'Created At'],
    MODULE_REGISTRY: ['Module Key', 'Label', 'Namespace', 'Version', 'Required', 'Enabled', 'Status', 'Load Order', 'Description', 'Updated At'],
    MODULE_DEPENDENCIES: ['Dependency ID', 'Module Key', 'Dependency Key', 'Required', 'Status', 'Message', 'Checked At'],
    MODULE_HEALTH: ['Health ID', 'Module Key', 'Status', 'Registered', 'Enabled', 'Has Ensure Sheets', 'Missing Dependencies', 'Message', 'Checked At'],
    DIAGNOSTIC_RUNS: ['Diagnostic Run ID', 'Version', 'Status', 'Score', 'Started At', 'Completed At', 'Duration Ms', 'Summary JSON', 'Created At'],
    DIAGNOSTIC_CHECKS: ['Diagnostic Check ID', 'Diagnostic Run ID', 'Category', 'Check Name', 'Status', 'Severity', 'Message', 'Details JSON', 'Duration Ms', 'Created At'],
    SYSTEM_REPAIR_LOG: REPAIR_LOG_HEADERS,
    SETTINGS: ['Setting', 'Value', 'Description'],
    LOOKUPS: ['Category', 'Value', 'Sort Order', 'Active'],
    USERS: ['User ID', 'Email', 'Name', 'Role', 'Status', 'Created At', 'Updated At'],
    CUSTOMERS: ['Customer ID', 'Name', 'Email', 'Phone', 'Type', 'Status', 'Created At', 'Updated At'],
    PROPERTIES: ['Property ID', 'Address', 'City', 'State', 'Zip', 'Property Type', 'Status', 'Client ID', 'Owner ID', 'Vendor ID', 'Created At', 'Updated At'],
    VENDORS: ['Vendor ID', 'Vendor Name', 'Company', 'Vendor Type', 'Email', 'Phone', 'Status', 'Active', 'Created At', 'Updated At'],
    WORK_ORDERS: ['Work Order ID', 'Property ID', 'Vendor ID', 'Title', 'Description', 'Status', 'Priority', 'Due Date', 'Created At', 'Updated At'],
    DOCUMENTS: ['Document ID', 'Record Type', 'Record ID', 'Document Type', 'Name', 'URL', 'Status', 'Created At', 'Updated At'],
    FIN_INVOICES: ['Invoice ID', 'Client', 'Property ID', 'Invoice Date', 'Due Date', 'Subtotal', 'Tax', 'Total', 'Paid Amount', 'Balance', 'Status', 'Created At', 'Updated At'],
    FIN_VENDOR_PAYMENTS: ['Payment ID', 'Vendor ID', 'Vendor Name', 'Property ID', 'Amount', 'Status', 'Payment Date', 'Created At', 'Updated At'],
    FIN_EXPENSES: ['Expense ID', 'Property ID', 'Category', 'Amount', 'Expense Date', 'Description', 'Created At', 'Updated At'],
    PORTAL_ACCOUNTS: ['Portal Account ID', 'Email', 'Display Name', 'Portal Role', 'Linked Entity Type', 'Linked Entity ID', 'Status', 'Last Login At', 'Created At', 'Updated At'],
    PORTAL_SESSIONS: ['Portal Session ID', 'Portal Account ID', 'Token', 'Status', 'Expires At', 'Created At', 'Updated At'],
    PORTAL_INVITATIONS: ['Portal Invitation ID', 'Email', 'Portal Role', 'Linked Entity Type', 'Linked Entity ID', 'Token', 'Status', 'Expires At', 'Accepted At', 'Created At', 'Updated At'],
    PORTAL_MESSAGES: ['Portal Message ID', 'Portal Account ID', 'Direction', 'Subject', 'Body', 'Status', 'Related Type', 'Related ID', 'Created At', 'Updated At'],
    PORTAL_TASKS: ['Portal Task ID', 'Portal Account ID', 'Title', 'Description', 'Status', 'Due Date', 'Related Type', 'Related ID', 'Created At', 'Updated At']
  };

  const LOOKUPS = [
    ['Portal Role', 'Investor', 1, true],
    ['Portal Role', 'Lender', 2, true],
    ['Portal Role', 'Client', 3, true],
    ['Portal Role', 'Vendor', 4, true],
    ['Priority', 'Critical', 1, true],
    ['Priority', 'High', 2, true],
    ['Priority', 'Medium', 3, true],
    ['Priority', 'Low', 4, true],
    ['Status', 'Active', 1, true],
    ['Status', 'Pending', 2, true],
    ['Status', 'Archived', 3, true]
  ];

  function ensureSheets() {
    REOS.Database.ensureTable(REPAIR_LOG_SHEET, REPAIR_LOG_HEADERS);
  }

  function run() {
    ensureSheets();
    const runId = REOS.generateId_('REPAIR');
    const startedAt = new Date();
    const actions = [];
    collect_(actions, runId, 'Sheets', repairSheets);
    collect_(actions, runId, 'Configuration', repairConfiguration);
    collect_(actions, runId, 'Lookups', repairLookups);
    collect_(actions, runId, 'Modules', repairModules);
    const failed = actions.filter(function (a) { return a.status === 'Failed'; });
    const summary = { ok: failed.length === 0, runId: runId, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), total: actions.length, repaired: actions.filter(function (a) { return a.status === 'Repaired'; }).length, skipped: actions.filter(function (a) { return a.status === 'Skipped'; }).length, failed: failed.length, actions: actions };
    logRepair_(runId, 'Summary', 'Self-healing run', summary.ok ? 'Completed' : 'Completed With Errors', 'Self-healing run completed.', summary);
    return summary;
  }

  function repairSheets() {
    const actions = [];
    Object.keys(TABLES).forEach(function (sheetName) {
      const result = ensureTableAndHeaders_(sheetName, TABLES[sheetName]);
      actions.push(result);
    });
    Object.keys(REOS.CONFIG.SHEETS || {}).forEach(function (key) {
      const sheetName = REOS.CONFIG.SHEETS[key];
      if (!TABLES[sheetName]) {
        const result = ensureTableAndHeaders_(sheetName, ['ID', 'Name', 'Status', 'Created At', 'Updated At']);
        actions.push(result);
      }
    });
    return actions;
  }

  function repairConfiguration() {
    const actions = [];
    const props = PropertiesService.getScriptProperties();
    actions.push(setPropertyIfMissing_(props, 'REOS_VERSION', REOS.CONFIG.APP.VERSION));
    actions.push(setPropertyIfMissing_(props, 'REOS_CORE_VERSION', REOS.CoreFoundation ? REOS.CoreFoundation.CORE_VERSION : REOS.CONFIG.APP.VERSION));
    actions.push(setPropertyIfMissing_(props, 'REOS_ENVIRONMENT', 'Production'));
    actions.push(setPropertyIfMissing_(props, 'REOS_SELF_HEALING_ENABLED', 'true'));
    actions.push(upsertSetting_('Version', REOS.CONFIG.APP.VERSION, 'Current REOS version'));
    actions.push(upsertSetting_('Default Time Zone', REOS.CONFIG.APP.TIME_ZONE, 'Application time zone'));
    actions.push(upsertSetting_('Self Healing Enabled', 'true', 'Enables self-healing repairs'));
    return actions;
  }

  function repairLookups() {
    const actions = [];
    REOS.Database.ensureTable('LOOKUPS', TABLES.LOOKUPS);
    const existing = REOS.Database.getAll('LOOKUPS').reduce(function (map, row) {
      map[String(row.Category) + '::' + String(row.Value)] = true;
      return map;
    }, {});
    LOOKUPS.forEach(function (row) {
      const key = row[0] + '::' + row[1];
      if (existing[key]) {
        actions.push(action_('Lookup ' + key, 'Skipped', 'Lookup exists.', { key: key }));
      } else {
        REOS.Database.insert('LOOKUPS', { Category: row[0], Value: row[1], 'Sort Order': row[2], Active: row[3] }, {});
        actions.push(action_('Lookup ' + key, 'Repaired', 'Lookup added.', { key: key }));
      }
    });
    return actions;
  }

  function repairModules() {
    const actions = [];
    if (REOS.Modules && typeof REOS.Modules.ensureSheets === 'function') {
      REOS.Modules.ensureSheets();
      actions.push(action_('Module sheets', 'Repaired', 'Module sheets verified.', {}));
    } else {
      actions.push(action_('Module sheets', 'Skipped', 'Module registry not loaded.', {}));
    }
    if (REOS.Modules && typeof REOS.Modules.seedRegistry === 'function') {
      const result = REOS.Modules.seedRegistry();
      actions.push(action_('Module registry seed', 'Repaired', 'Module registry seeded.', result));
    }
    if (REOS.Modules && typeof REOS.Modules.healthReport === 'function') {
      const result = REOS.Modules.healthReport();
      actions.push(action_('Module health', result.ok ? 'Repaired' : 'Skipped', 'Module health refreshed.', result));
    }
    if (REOS.Diagnostics && typeof REOS.Diagnostics.ensureSheets === 'function') {
      REOS.Diagnostics.ensureSheets();
      actions.push(action_('Diagnostics sheets', 'Repaired', 'Diagnostics sheets verified.', {}));
    }
    return actions;
  }

  function ensureTableAndHeaders_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    let repaired = false;
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      repaired = true;
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setWrap(true);
      repaired = true;
    } else {
      const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(function (h) { return String(h || '').trim(); });
      const missing = headers.filter(function (h) { return existing.indexOf(h) === -1; });
      if (missing.length) {
        sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
        sheet.getRange(1, 1, 1, existing.length + missing.length).setFontWeight('bold').setWrap(true);
        repaired = true;
      }
    }
    return action_('Ensure table ' + sheetName, repaired ? 'Repaired' : 'Skipped', repaired ? 'Table/header repaired.' : 'Table/header already valid.', { sheetName: sheetName });
  }

  function setPropertyIfMissing_(props, key, value) {
    const existing = props.getProperty(key);
    if (existing) return action_('Property ' + key, 'Skipped', 'Property already exists.', { key: key, value: existing });
    props.setProperty(key, String(value));
    return action_('Property ' + key, 'Repaired', 'Property created.', { key: key, value: value });
  }

  function upsertSetting_(setting, value, description) {
    REOS.Database.ensureTable('SETTINGS', TABLES.SETTINGS);
    const existing = REOS.Database.getAll('SETTINGS').filter(function (row) { return row.Setting === setting; })[0];
    if (existing) {
      REOS.Database.update('SETTINGS', 'Setting', setting, { Value: value, Description: description });
      return action_('Setting ' + setting, 'Repaired', 'Setting updated.', { setting: setting, value: value });
    }
    REOS.Database.insert('SETTINGS', { Setting: setting, Value: value, Description: description }, {});
    return action_('Setting ' + setting, 'Repaired', 'Setting added.', { setting: setting, value: value });
  }

  function collect_(target, runId, category, fn) {
    try {
      const actions = fn() || [];
      actions.forEach(function (a) {
        target.push(a);
        logRepair_(runId, category, a.action, a.status, a.message, a.details || {});
      });
    } catch (error) {
      const failed = action_(category + ' repair', 'Failed', error.message, { stack: error.stack || '' });
      target.push(failed);
      logRepair_(runId, category, failed.action, failed.status, failed.message, failed.details);
    }
  }

  function action_(action, status, message, details) {
    return { action: action, status: status, message: message, details: details || {} };
  }

  function logRepair_(runId, category, action, status, message, details) {
    ensureSheets();
    REOS.Database.insert(REPAIR_LOG_SHEET, {
      'Run ID': runId,
      Category: category,
      Action: action,
      Status: status,
      Message: message,
      'Details JSON': REOS.toJson_(details || {}),
      'Created At': new Date()
    }, { idField: 'Repair ID', idPrefix: 'RPR' });
  }

  return { ensureSheets: ensureSheets, run: run, repairSheets: repairSheets, repairConfiguration: repairConfiguration, repairLookups: repairLookups, repairModules: repairModules };
})();

function reosRunSelfHealing() {
  const report = REOS.SelfHealing.run();
  SpreadsheetApp.getUi().alert('REOS Self-Healing', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}
function reosRepairSheets() { return REOS.SelfHealing.repairSheets(); }
function reosRepairConfiguration() { return REOS.SelfHealing.repairConfiguration(); }
function reosRepairModules() { return REOS.SelfHealing.repairModules(); }

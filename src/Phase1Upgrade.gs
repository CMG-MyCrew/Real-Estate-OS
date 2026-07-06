/**
 * REOS Enterprise v3.2.6 - Phase 1 Upgrade Foundation
 *
 * This bridge upgrades a v3.0.0 workbook foundation before module imports.
 * It creates required sheets, seeds upgrade settings, validates module files,
 * and provides a clear upgrade report from the REOS menu.
 */

var REOS = REOS || {};

REOS.Phase1Upgrade = (function () {
  const UPGRADE_LOG = 'UPGRADE_LOG';

  const CORE_TABLES = {
    HOME: ['Section', 'Metric', 'Value', 'Updated At'],
    SETTINGS: ['Setting', 'Value', 'Description'],
    USERS: ['User ID', 'Email', 'Name', 'Role', 'Status', 'Created At', 'Updated At'],
    LOOKUPS: ['Category', 'Value', 'Sort Order', 'Active'],
    CRM: ['CRM ID', 'Type', 'Name', 'Email', 'Phone', 'Status', 'Notes', 'Created At', 'Updated At'],
    LEADS: ['Lead ID', 'Name', 'Email', 'Phone', 'Source', 'Status', 'Assigned To', 'Created At', 'Updated At'],
    TASKS: ['Task ID', 'Title', 'Description', 'Status', 'Priority', 'Due Date', 'Assigned To', 'Related Type', 'Related ID', 'Created At', 'Updated At'],
    ACTIVITIES: ['Activity ID', 'Type', 'Description', 'Related Type', 'Related ID', 'User', 'Created At'],
    SYSTEM_LOG: ['Timestamp', 'Level', 'User', 'Action', 'Details'],
    SYSTEM_AUDIT: ['Audit ID', 'User', 'Action', 'Module', 'Record ID', 'Details JSON', 'Created At'],
    SECURITY_POLICIES: ['Policy ID', 'Policy Name', 'Status', 'Details JSON', 'Created At', 'Updated At'],
    SECURITY_EVENTS: ['Security Event ID', 'Event Type', 'Severity', 'User', 'Details JSON', 'Created At'],
    UPGRADE_LOG: ['Upgrade ID', 'Version', 'Step', 'Status', 'Message', 'Details JSON', 'Created At']
  };

  const MODULE_SHEETS = {
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

  const MODULES = [
    'FinanceManager', 'FinanceEnhancements', 'FinanceDashboards',
    'QuickBooksConnector', 'QuickBooksOAuth',
    'PortalFoundation', 'PortalAuth', 'InvestorPortal', 'VendorPortal', 'ClientLenderPortal'
  ];

  function run() {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      ensureTables_(CORE_TABLES);
      ensureTables_(MODULE_SHEETS);
      seedSettings_();
      seedLookups_();
      setProperties_();
      const report = validate_();
      log_('Phase 1 Upgrade', report.ok ? 'Complete' : 'Needs Attention', 'Phase 1 upgrade executed.', report);
      return report;
    } finally {
      lock.releaseLock();
    }
  }

  function ensureTables_(tables) {
    Object.keys(tables).forEach(function (sheetName) {
      REOS.Database.ensureTable(sheetName, tables[sheetName]);
    });
  }

  function seedSettings_() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SETTINGS');
    const values = sheet.getDataRange().getValues();
    if (values.length > 1) return;
    sheet.getRange(1, 1, 7, 3).setValues([
      ['Setting', 'Value', 'Description'],
      ['Business Name', 'REOS Enterprise', 'Displayed application name'],
      ['Version', REOS.CONFIG.APP.VERSION, 'Current REOS version'],
      ['Default Time Zone', REOS.CONFIG.APP.TIME_ZONE, 'Application time zone'],
      ['Currency', 'USD', 'Default currency'],
      ['Upgrade Phase', 'Phase 1', 'Current upgrade phase'],
      ['Source of Truth', 'GitHub', 'Repository-managed code']
    ]);
  }

  function seedLookups_() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LOOKUPS');
    if (sheet.getLastRow() > 1) return;
    sheet.getRange(1, 1, 12, 4).setValues([
      ['Category', 'Value', 'Sort Order', 'Active'],
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
    ]);
  }

  function setProperties_() {
    REOS.setProperty_('REOS_VERSION', REOS.CONFIG.APP.VERSION);
    REOS.setProperty_('REOS_UPGRADE_PHASE', 'Phase 1');
    REOS.setProperty_('REOS_UPGRADED_AT', new Date().toISOString());
  }

  function validate_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const required = Object.keys(CORE_TABLES).concat(Object.keys(MODULE_SHEETS));
    const sheets = required.map(function (name) {
      return { name: name, exists: !!ss.getSheetByName(name) };
    });
    const moduleStatus = MODULES.map(function (name) {
      return { module: name, registered: !!REOS[name] };
    });
    const missingSheets = sheets.filter(function (s) { return !s.exists; });
    return {
      ok: missingSheets.length === 0,
      version: REOS.CONFIG.APP.VERSION,
      phase: 'Phase 1',
      missingSheets: missingSheets,
      sheets: sheets,
      modules: moduleStatus,
      next: 'Phase 2: import and verify modules one at a time.'
    };
  }

  function log_(step, status, message, details) {
    REOS.Database.insert(UPGRADE_LOG, {
      Version: REOS.CONFIG.APP.VERSION,
      Step: step,
      Status: status,
      Message: message,
      'Details JSON': REOS.toJson_(details || {}),
      'Created At': new Date()
    }, { idField: 'Upgrade ID', idPrefix: 'UPG' });
  }

  return { run: run, validate: validate_ };
})();

function reosRunPhase1Upgrade() {
  const report = REOS.Phase1Upgrade.run();
  SpreadsheetApp.getUi().alert('REOS Phase 1 Upgrade', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

function reosValidatePhase1Upgrade() {
  const report = REOS.Phase1Upgrade.validate();
  SpreadsheetApp.getUi().alert('REOS Phase 1 Validation', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

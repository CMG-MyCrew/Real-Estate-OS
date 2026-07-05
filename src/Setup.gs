/**
 * REOS Enterprise v3.0 - Workbook Setup Framework
 *
 * Owns workbook schema, table headers, formatting, and safe initialization.
 */

var REOS = REOS || {};

REOS.Schema = {
  HOME: ['Section', 'Metric', 'Value', 'Updated At'],
  SETTINGS: ['Setting', 'Value', 'Description'],
  USERS: ['User ID', 'Name', 'Email', 'Role', 'Status', 'Created At', 'Updated At'],
  LOOKUPS: ['Category', 'Value', 'Sort Order', 'Active'],
  CRM: ['Client ID', 'Client Type', 'First Name', 'Last Name', 'Company', 'Email', 'Phone', 'Status', 'Source', 'Owner', 'Notes', 'Active', 'Created At', 'Updated At'],
  LEADS: ['Lead ID', 'Lead Type', 'Property Address', 'City', 'State', 'Zip', 'Owner Name', 'Owner Phone', 'Owner Email', 'Distress Indicator', 'Estimated Value', 'Asking Price', 'Status', 'Priority', 'Source', 'Assigned To', 'Next Follow Up', 'Notes', 'Active', 'Created At', 'Updated At'],
  TASKS: ['Task ID', 'Title', 'Related Type', 'Related ID', 'Assigned To', 'Priority', 'Status', 'Due Date', 'Completed At', 'Notes', 'Active', 'Created At', 'Updated At'],
  ACTIVITIES: ['Activity ID', 'Related Type', 'Related ID', 'Activity Type', 'Subject', 'Notes', 'User', 'Activity Date', 'Created At'],
  SYSTEM_LOG: ['Timestamp', 'Level', 'User', 'Action', 'Details']
};

function reosInitializeWorkbook() {
  return REOS.Setup.initializeWorkbook();
}

function reosResetWorkbookHeaders() {
  return REOS.Setup.resetHeaders();
}

REOS.Setup = (function () {
  function initializeWorkbook() {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      Object.keys(REOS.CONFIG.SHEETS).forEach(function (key) {
        const sheetName = REOS.CONFIG.SHEETS[key];
        const headers = REOS.Schema[key];
        const sheet = getOrCreateSheet_(ss, sheetName);
        if (headers) ensureHeaders_(sheet, headers);
        formatSheet_(sheet, headers || []);
      });

      seedHome_();
      REOS.seedSettings_();
      REOS.seedLookups_();
      REOS.seedInitialAdmin_();
      REOS.setProperty_('REOS_WORKBOOK_INITIALIZED_AT', REOS.nowIso_());
      REOS.Logger.info('Workbook initialized', { sheets: Object.keys(REOS.CONFIG.SHEETS).length });

      SpreadsheetApp.getUi().alert('REOS workbook initialized successfully.');
      return { ok: true, message: 'Workbook initialized' };
    } catch (error) {
      REOS.handleError_('reosInitializeWorkbook', error);
      throw error;
    } finally {
      lock.releaseLock();
    }
  }

  function resetHeaders() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(REOS.CONFIG.SHEETS).forEach(function (key) {
      const sheetName = REOS.CONFIG.SHEETS[key];
      const headers = REOS.Schema[key];
      if (!headers) return;
      const sheet = getOrCreateSheet_(ss, sheetName);
      writeHeaders_(sheet, headers);
      formatSheet_(sheet, headers);
    });
    REOS.Logger.warn('Workbook headers reset', {});
    return { ok: true, message: 'Headers reset' };
  }

  function getOrCreateSheet_(ss, sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    return sheet;
  }

  function ensureHeaders_(sheet, headers) {
    const existing = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn(), 1)).getValues()[0]
      .map(function (value) { return String(value || '').trim(); });
    const hasHeaders = existing.some(function (value) { return value !== ''; });
    if (!hasHeaders) writeHeaders_(sheet, headers);
  }

  function writeHeaders_(sheet, headers) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  function formatSheet_(sheet, headers) {
    const headerLength = Math.max(headers.length, 1);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headerLength)
      .setFontWeight('bold')
      .setWrap(true);
    sheet.autoResizeColumns(1, headerLength);
    if (sheet.getFilter()) sheet.getFilter().remove();
    sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 1), headerLength).createFilter();
  }

  function seedHome_() {
    const sheet = REOS.getSheet_(REOS.CONFIG.SHEETS.HOME);
    if (sheet.getLastRow() > 1) return;
    const rows = [
      ['Section', 'Metric', 'Value', 'Updated At'],
      ['System', 'Application', REOS.CONFIG.APP.NAME, REOS.nowIso_()],
      ['System', 'Version', REOS.CONFIG.APP.VERSION, REOS.nowIso_()],
      ['System', 'Environment', 'Production', REOS.nowIso_()],
      ['Core', 'Workbook Status', 'Initialized', REOS.nowIso_()]
    ];
    sheet.clear();
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    formatSheet_(sheet, REOS.Schema.HOME);
  }

  return {
    initializeWorkbook: initializeWorkbook,
    resetHeaders: resetHeaders
  };
})();

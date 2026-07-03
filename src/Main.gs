/**
 * REOS Enterprise v3.0 - Main Application Bootstrap
 *
 * This file contains lifecycle entry points and install routines for the
 * Google Sheets-bound Apps Script application.
 */

/**
 * Runs when the spreadsheet opens.
 */
function onOpen(e) {
  try {
    REOS.init_();
    REOS.buildMenu_();
    REOS.log_('INFO', 'Application opened', { event: e ? 'onOpen' : 'manual' });
  } catch (error) {
    REOS.handleError_('onOpen', error);
  }
}

/**
 * Runs when the add-on is installed, if deployed as an add-on later.
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * One-time setup function. Run manually after binding the script to a Sheet.
 */
function installREOS() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    REOS.createRequiredSheets_();
    REOS.seedSettings_();
    REOS.seedLookups_();
    REOS.setProperty_('REOS_VERSION', REOS.CONFIG.APP.VERSION);
    REOS.setProperty_('REOS_INSTALLED_AT', new Date().toISOString());
    REOS.log_('INFO', 'REOS installation completed', { version: REOS.CONFIG.APP.VERSION });
    SpreadsheetApp.getUi().alert('REOS Enterprise installation completed.');
  } catch (error) {
    REOS.handleError_('installREOS', error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Manual health check for administrators.
 */
function runHealthCheck() {
  const report = REOS.healthCheck_();
  const message = report.messages.join('\n');
  SpreadsheetApp.getUi().alert('REOS Health Check', message, SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

/**
 * Shared namespace. Additional files extend this object.
 */
var REOS = REOS || {};

REOS.init_ = function () {
  REOS.createRequiredSheets_();
  REOS.setProperty_('REOS_LAST_OPENED_AT', new Date().toISOString());
};

REOS.createRequiredSheets_ = function () {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requiredSheets = Object.keys(REOS.CONFIG.SHEETS).map(function (key) {
    return REOS.CONFIG.SHEETS[key];
  });

  requiredSheets.forEach(function (sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      REOS.applyDefaultSheetStyle_(sheet);
    }
  });
};

REOS.applyDefaultSheetStyle_ = function (sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange('A1:Z1').setFontWeight('bold');
};

REOS.seedSettings_ = function () {
  const sheet = REOS.getSheet_(REOS.CONFIG.SHEETS.SETTINGS);
  if (sheet.getLastRow() > 1) return;

  const rows = [
    ['Setting', 'Value', 'Description'],
    ['Business Name', 'REOS Enterprise', 'Displayed application name'],
    ['Default Time Zone', REOS.CONFIG.APP.TIME_ZONE, 'Application time zone'],
    ['Currency', 'USD', 'Default currency'],
    ['Default Commission Rate', '0.03', 'Default commission percentage'],
    ['Default Broker Split', '0.80', 'Default agent split'],
    ['Tax Reserve Rate', '0.30', 'Default tax reserve percentage']
  ];

  sheet.clear();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  REOS.applyDefaultSheetStyle_(sheet);
};

REOS.seedLookups_ = function () {
  const sheet = REOS.getSheet_(REOS.CONFIG.SHEETS.LOOKUPS);
  if (sheet.getLastRow() > 1) return;

  const rows = [
    ['Category', 'Value', 'Sort Order', 'Active'],
    ['Lead Status', 'New', 1, true],
    ['Lead Status', 'Contacted', 2, true],
    ['Lead Status', 'Appointment', 3, true],
    ['Lead Status', 'Active', 4, true],
    ['Lead Status', 'Under Contract', 5, true],
    ['Lead Status', 'Closed', 6, true],
    ['Lead Status', 'Lost', 7, true],
    ['Priority', 'Critical', 1, true],
    ['Priority', 'High', 2, true],
    ['Priority', 'Medium', 3, true],
    ['Priority', 'Low', 4, true],
    ['Client Type', 'Buyer', 1, true],
    ['Client Type', 'Seller', 2, true],
    ['Client Type', 'Investor', 3, true],
    ['Client Type', 'Tenant', 4, true],
    ['Client Type', 'Vendor', 5, true]
  ];

  sheet.clear();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  REOS.applyDefaultSheetStyle_(sheet);
};

REOS.healthCheck_ = function () {
  const report = { ok: true, messages: [] };
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(REOS.CONFIG.SHEETS).forEach(function (key) {
    const name = REOS.CONFIG.SHEETS[key];
    const exists = !!ss.getSheetByName(name);
    if (!exists) report.ok = false;
    report.messages.push((exists ? 'OK' : 'MISSING') + ': ' + name);
  });

  report.messages.unshift('REOS Version: ' + REOS.CONFIG.APP.VERSION);
  return report;
};

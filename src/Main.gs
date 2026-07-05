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
    REOS.seedInitialAdmin_();
    REOS.setProperty_('REOS_VERSION', REOS.CONFIG.APP.VERSION);
    REOS.setProperty_('REOS_INSTALLED_AT', new Date().toISOString());
    REOS.log_('INFO', 'REOS installation completed', { version: REOS.CONFIG.APP.VERSION });
    SpreadsheetApp.getUi().alert('REOS Enterprise installation completed. Initial admin user verified.');
  } catch (error) {
    REOS.handleError_('installREOS', error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function runHealthCheck() {
  const report = REOS.healthCheck_();
  const message = report.messages.join('\n');
  SpreadsheetApp.getUi().alert('REOS Health Check', message, SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

var REOS = REOS || {};

REOS.init_ = function () {
  REOS.createRequiredSheets_();
  if (REOS.Router && typeof REOS.Router.initializeDefaultModules === 'function') REOS.Router.initializeDefaultModules();
  if (REOS.Acquisitions && typeof REOS.Acquisitions.initialize === 'function') REOS.Acquisitions.initialize();
  if (REOS.Vendors && typeof REOS.Vendors.initialize === 'function') REOS.Vendors.initialize();
  if (REOS.Properties && typeof REOS.Properties.initialize === 'function') REOS.Properties.initialize();
  if (REOS.Automation && typeof REOS.Automation.ensureSheets === 'function') REOS.Automation.ensureSheets();
  if (REOS.AI && typeof REOS.AI.initialize === 'function') REOS.AI.initialize();
  REOS.setProperty_('REOS_LAST_OPENED_AT', new Date().toISOString());
};

REOS.buildMenu_ = function () {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('REOS')
    .addItem('Open Dashboard', 'reosOpenDashboard')
    .addItem('Open CRM', 'showCRM')
    .addItem('Open CRM Dashboard', 'showCRMDashboard')
    .addItem('Open Acquisitions', 'showAcquisitions')
    .addItem('Open Acquisitions Dashboard', 'showAcquisitionsDashboard')
    .addItem('Open Vendors', 'showVendors')
    .addItem('Open Properties', 'showProperties')
    .addItem('Open Property Dashboard', 'showPropertyDashboard')
    .addItem('Open AI Workspace', 'showAI')
    .addItem('Open Automation', 'showAutomation')
    .addItem('Open Admin', 'showAdmin')
    .addSeparator()
    .addItem('Initialize Workbook', 'reosInitializeWorkbook')
    .addItem('Health Check', 'runHealthCheck')
    .addItem('Run Tests', 'reosRunTests')
    .addToUi();
};

REOS.createRequiredSheets_ = function () {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requiredSheets = Object.keys(REOS.CONFIG.SHEETS).map(function (key) { return REOS.CONFIG.SHEETS[key]; });
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
    ['Acquisition Status', 'New', 1, true],
    ['Acquisition Status', 'Skip Trace', 2, true],
    ['Acquisition Status', 'Contacted', 3, true],
    ['Acquisition Status', 'Appointment', 4, true],
    ['Acquisition Status', 'Offer Sent', 5, true],
    ['Acquisition Status', 'Under Contract', 6, true],
    ['Acquisition Status', 'Closed', 7, true],
    ['Acquisition Status', 'Lost', 8, true],
    ['Distress Indicator', 'Absentee Owner', 1, true],
    ['Distress Indicator', 'Tax Delinquent', 2, true],
    ['Distress Indicator', 'Probate', 3, true],
    ['Distress Indicator', 'Code Violation', 4, true],
    ['Distress Indicator', 'Vacant', 5, true],
    ['Distress Indicator', 'Pre-Foreclosure', 6, true],
    ['Distress Indicator', 'REO', 7, true],
    ['Distress Indicator', 'Eviction', 8, true],
    ['Distress Indicator', 'Inherited', 9, true],
    ['Distress Indicator', 'Tired Landlord', 10, true],
    ['Vendor Service Category', 'Property Preservation', 1, true],
    ['Vendor Service Category', 'Commercial Cleaning', 2, true],
    ['Vendor Service Category', 'Trash Out', 3, true],
    ['Vendor Service Category', 'Lawn Care', 4, true],
    ['Vendor Service Category', 'Lock Change', 5, true],
    ['Vendor Service Category', 'Board Up', 6, true],
    ['Vendor Service Category', 'Winterization', 7, true],
    ['Vendor Service Category', 'Inspection', 8, true],
    ['Vendor Service Category', 'Repairs', 9, true],
    ['Vendor Service Category', 'Photography', 10, true],
    ['Vendor Service Category', 'Janitorial', 11, true],
    ['Vendor Service Category', 'Debris Removal', 12, true],
    ['Work Order Status', 'New', 1, true],
    ['Work Order Status', 'Assigned', 2, true],
    ['Work Order Status', 'Scheduled', 3, true],
    ['Work Order Status', 'In Progress', 4, true],
    ['Work Order Status', 'Completed', 5, true],
    ['Work Order Status', 'Cancelled', 6, true],
    ['Work Order Status', 'On Hold', 7, true],
    ['Property Type', 'Single Family', 1, true],
    ['Property Type', 'Duplex', 2, true],
    ['Property Type', 'Triplex', 3, true],
    ['Property Type', 'Fourplex', 4, true],
    ['Property Type', 'Condo', 5, true],
    ['Property Type', 'Townhome', 6, true],
    ['Property Type', 'Multifamily', 7, true],
    ['Property Type', 'Commercial', 8, true],
    ['Property Type', 'Land', 9, true],
    ['Property Type', 'Other', 10, true],
    ['Property Status', 'Prospect', 1, true],
    ['Property Status', 'Owned', 2, true],
    ['Property Status', 'Under Rehab', 3, true],
    ['Property Status', 'Available', 4, true],
    ['Property Status', 'Occupied', 5, true],
    ['Property Status', 'Listed', 6, true],
    ['Property Status', 'Sold', 7, true],
    ['Property Status', 'Archived', 8, true],
    ['Occupancy Status', 'Vacant', 1, true],
    ['Occupancy Status', 'Occupied', 2, true],
    ['Occupancy Status', 'Partially Occupied', 3, true],
    ['Occupancy Status', 'Unknown', 4, true],
    ['Maintenance Status', 'New', 1, true],
    ['Maintenance Status', 'Assigned', 2, true],
    ['Maintenance Status', 'Scheduled', 3, true],
    ['Maintenance Status', 'In Progress', 4, true],
    ['Maintenance Status', 'Completed', 5, true],
    ['Maintenance Status', 'Cancelled', 6, true],
    ['Maintenance Status', 'On Hold', 7, true],
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

REOS.seedInitialAdmin_ = function () {
  if (REOS.Users && typeof REOS.Users.seedAdminIfEmpty === 'function') return REOS.Users.seedAdminIfEmpty();
  return null;
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
  ['VENDORS', 'WORK_ORDERS', 'AUTOMATION_RULES', 'AUTOMATION_RUNS', 'PROPERTIES', 'UNITS', 'INSPECTIONS', 'MAINTENANCE_REQUESTS', 'AI_REQUESTS'].forEach(function (name) {
    const exists = !!ss.getSheetByName(name);
    if (!exists) report.ok = false;
    report.messages.push((exists ? 'OK' : 'MISSING') + ': ' + name);
  });
  report.messages.unshift('REOS Version: ' + REOS.CONFIG.APP.VERSION);
  return report;
};

function reosOpenDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Index').setTitle('REOS Enterprise').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Enterprise');
}

function showCRMDashboard() {
  REOS.Security.requirePermission('crm:read');
  const html = HtmlService.createHtmlOutputFromFile('CRMDashboard').setTitle('REOS CRM Dashboard').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS CRM Dashboard');
}

function showAcquisitionsDashboard() {
  REOS.Security.requirePermission('leads:read');
  const html = HtmlService.createHtmlOutputFromFile('AcquisitionsDashboard').setTitle('REOS Acquisitions Dashboard').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Acquisitions Dashboard');
}

function showPropertyDashboard() {
  REOS.Security.requirePermission('properties:read');
  const html = HtmlService.createHtmlOutputFromFile('PropertyDashboard').setTitle('REOS Property Dashboard').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Property Dashboard');
}

function showAI() {
  REOS.Security.requirePermission('ai:use');
  const html = HtmlService.createHtmlOutputFromFile('AI').setTitle('REOS AI Workspace').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS AI Workspace');
}

function showAdmin() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('Admin').setTitle('REOS Admin').setWidth(1100).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Admin');
}

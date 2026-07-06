/**
 * REOS Enterprise v3.0 - Main Application Bootstrap
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

function onInstall(e) { onOpen(e); }

function installREOS() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    REOS.createRequiredSheets_();
    REOS.seedSettings_();
    REOS.seedLookups_();
    REOS.seedInitialAdmin_();
    if (REOS.ExternalIntegrations && typeof REOS.ExternalIntegrations.ensureSheets === 'function') REOS.ExternalIntegrations.ensureSheets();
    if (REOS.AutomationTemplates && typeof REOS.AutomationTemplates.ensureSheets === 'function') REOS.AutomationTemplates.ensureSheets();
    if (REOS.ProductionHardening && typeof REOS.ProductionHardening.ensureSheets === 'function') REOS.ProductionHardening.ensureSheets();
    if (REOS.DashboardExport && typeof REOS.DashboardExport.ensureSheets === 'function') REOS.DashboardExport.ensureSheets();
    if (REOS.Documents && typeof REOS.Documents.ensureSheets === 'function') REOS.Documents.ensureSheets();
    if (REOS.AIAgents && typeof REOS.AIAgents.ensureSheets === 'function') REOS.AIAgents.ensureSheets();
    if (REOS.DeploymentWizard && typeof REOS.DeploymentWizard.ensureSheets === 'function') REOS.DeploymentWizard.ensureSheets();
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
  SpreadsheetApp.getUi().alert('REOS Health Check', report.messages.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
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
  if (REOS.ExternalIntegrations && typeof REOS.ExternalIntegrations.ensureSheets === 'function') REOS.ExternalIntegrations.ensureSheets();
  if (REOS.AutomationTemplates && typeof REOS.AutomationTemplates.ensureSheets === 'function') REOS.AutomationTemplates.ensureSheets();
  if (REOS.ProductionHardening && typeof REOS.ProductionHardening.ensureSheets === 'function') REOS.ProductionHardening.ensureSheets();
  if (REOS.DashboardExport && typeof REOS.DashboardExport.ensureSheets === 'function') REOS.DashboardExport.ensureSheets();
  if (REOS.Documents && typeof REOS.Documents.ensureSheets === 'function') REOS.Documents.ensureSheets();
  if (REOS.AIAgents && typeof REOS.AIAgents.ensureSheets === 'function') REOS.AIAgents.ensureSheets();
  if (REOS.DeploymentWizard && typeof REOS.DeploymentWizard.ensureSheets === 'function') REOS.DeploymentWizard.ensureSheets();
  if (REOS.AI && typeof REOS.AI.initialize === 'function') REOS.AI.initialize();
  REOS.setProperty_('REOS_LAST_OPENED_AT', new Date().toISOString());
};

REOS.buildMenu_ = function () {
  SpreadsheetApp.getUi().createMenu('REOS')
    .addItem('Open Dashboard Hub', 'showDashboardHub')
    .addItem('Open Deployment Wizard', 'showDeploymentWizard')
    .addItem('Open Dashboard Export', 'showDashboardExport')
    .addItem('Open Documents', 'showDocuments')
    .addItem('Open AI Agents', 'showAIAgents')
    .addItem('Open Dashboard', 'reosOpenDashboard')
    .addItem('Open Executive Dashboard', 'showExecutiveDashboard')
    .addItem('Open CRM', 'showCRM')
    .addItem('Open CRM Dashboard', 'showCRMDashboard')
    .addItem('Open Acquisitions', 'showAcquisitions')
    .addItem('Open Acquisitions Dashboard', 'showAcquisitionsDashboard')
    .addItem('Open Vendors', 'showVendors')
    .addItem('Open Vendor Dashboard', 'showVendorDashboard')
    .addItem('Open Properties', 'showProperties')
    .addItem('Open Property Dashboard', 'showPropertyDashboard')
    .addItem('Open Automation', 'showAutomation')
    .addItem('Open Automation Dashboard', 'showAutomationDashboard')
    .addItem('Open Automation Templates', 'showAutomationTemplates')
    .addItem('Open External Integrations', 'showExternalIntegrations')
    .addItem('Open Production Hardening', 'showProductionHardening')
    .addItem('Open AI Workspace', 'showAI')
    .addItem('Open AI Dashboard', 'showAIDashboard')
    .addItem('Open Admin', 'showAdmin')
    .addSeparator()
    .addItem('Initialize Workbook', 'reosInitializeWorkbook')
    .addItem('Health Check', 'runHealthCheck')
    .addItem('Run Tests', 'reosRunTests')
    .addToUi();
};

REOS.createRequiredSheets_ = function () {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(REOS.CONFIG.SHEETS).map(function (key) { return REOS.CONFIG.SHEETS[key]; }).forEach(function (sheetName) {
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
    ['Lead Status', 'New', 1, true], ['Lead Status', 'Contacted', 2, true], ['Lead Status', 'Appointment', 3, true], ['Lead Status', 'Active', 4, true], ['Lead Status', 'Under Contract', 5, true], ['Lead Status', 'Closed', 6, true], ['Lead Status', 'Lost', 7, true],
    ['Acquisition Status', 'New', 1, true], ['Acquisition Status', 'Skip Trace', 2, true], ['Acquisition Status', 'Contacted', 3, true], ['Acquisition Status', 'Appointment', 4, true], ['Acquisition Status', 'Offer Sent', 5, true], ['Acquisition Status', 'Under Contract', 6, true], ['Acquisition Status', 'Closed', 7, true], ['Acquisition Status', 'Lost', 8, true],
    ['Distress Indicator', 'Absentee Owner', 1, true], ['Distress Indicator', 'Tax Delinquent', 2, true], ['Distress Indicator', 'Probate', 3, true], ['Distress Indicator', 'Code Violation', 4, true], ['Distress Indicator', 'Vacant', 5, true], ['Distress Indicator', 'Pre-Foreclosure', 6, true], ['Distress Indicator', 'REO', 7, true], ['Distress Indicator', 'Eviction', 8, true], ['Distress Indicator', 'Inherited', 9, true], ['Distress Indicator', 'Tired Landlord', 10, true],
    ['Vendor Service Category', 'Property Preservation', 1, true], ['Vendor Service Category', 'Commercial Cleaning', 2, true], ['Vendor Service Category', 'Trash Out', 3, true], ['Vendor Service Category', 'Lawn Care', 4, true], ['Vendor Service Category', 'Lock Change', 5, true], ['Vendor Service Category', 'Board Up', 6, true], ['Vendor Service Category', 'Winterization', 7, true], ['Vendor Service Category', 'Inspection', 8, true], ['Vendor Service Category', 'Repairs', 9, true], ['Vendor Service Category', 'Photography', 10, true], ['Vendor Service Category', 'Janitorial', 11, true], ['Vendor Service Category', 'Debris Removal', 12, true],
    ['Work Order Status', 'New', 1, true], ['Work Order Status', 'Assigned', 2, true], ['Work Order Status', 'Scheduled', 3, true], ['Work Order Status', 'In Progress', 4, true], ['Work Order Status', 'Completed', 5, true], ['Work Order Status', 'Cancelled', 6, true], ['Work Order Status', 'On Hold', 7, true],
    ['Property Type', 'Single Family', 1, true], ['Property Type', 'Duplex', 2, true], ['Property Type', 'Triplex', 3, true], ['Property Type', 'Fourplex', 4, true], ['Property Type', 'Condo', 5, true], ['Property Type', 'Townhome', 6, true], ['Property Type', 'Multifamily', 7, true], ['Property Type', 'Commercial', 8, true], ['Property Type', 'Land', 9, true], ['Property Type', 'Other', 10, true],
    ['Property Status', 'Prospect', 1, true], ['Property Status', 'Owned', 2, true], ['Property Status', 'Under Rehab', 3, true], ['Property Status', 'Available', 4, true], ['Property Status', 'Occupied', 5, true], ['Property Status', 'Listed', 6, true], ['Property Status', 'Sold', 7, true], ['Property Status', 'Archived', 8, true],
    ['Occupancy Status', 'Vacant', 1, true], ['Occupancy Status', 'Occupied', 2, true], ['Occupancy Status', 'Partially Occupied', 3, true], ['Occupancy Status', 'Unknown', 4, true],
    ['Maintenance Status', 'New', 1, true], ['Maintenance Status', 'Assigned', 2, true], ['Maintenance Status', 'Scheduled', 3, true], ['Maintenance Status', 'In Progress', 4, true], ['Maintenance Status', 'Completed', 5, true], ['Maintenance Status', 'Cancelled', 6, true], ['Maintenance Status', 'On Hold', 7, true],
    ['Priority', 'Critical', 1, true], ['Priority', 'High', 2, true], ['Priority', 'Medium', 3, true], ['Priority', 'Low', 4, true],
    ['Document Type', 'Photo', 1, true], ['Document Type', 'Contract', 2, true], ['Document Type', 'Invoice', 3, true], ['Document Type', 'Estimate', 4, true], ['Document Type', 'Inspection Report', 5, true], ['Document Type', 'Scope of Work', 6, true], ['Document Type', 'Permit', 7, true], ['Document Type', 'Proof of Completion', 8, true], ['Document Type', 'Other', 9, true],
    ['Client Type', 'Buyer', 1, true], ['Client Type', 'Seller', 2, true], ['Client Type', 'Investor', 3, true], ['Client Type', 'Tenant', 4, true], ['Client Type', 'Vendor', 5, true]
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
  ['VENDORS', 'WORK_ORDERS', 'AUTOMATION_RULES', 'AUTOMATION_RUNS', 'AUTOMATION_TEMPLATES', 'PROPERTIES', 'UNITS', 'INSPECTIONS', 'MAINTENANCE_REQUESTS', 'AI_REQUESTS', 'EXTERNAL_PROVIDERS', 'EXTERNAL_REQUESTS', 'HARDENING_REPORTS', 'HARDENING_CHECKS', 'DASHBOARD_EXPORTS', 'DOCUMENTS', 'DOCUMENT_FOLDERS', 'DOCUMENT_EVENTS', 'AI_AGENTS', 'AI_AGENT_RUNS', 'AI_AGENT_TASKS', 'DEPLOYMENT_RUNS', 'DEPLOYMENT_CHECKS'].forEach(function (name) {
    const exists = !!ss.getSheetByName(name);
    if (!exists) report.ok = false;
    report.messages.push((exists ? 'OK' : 'MISSING') + ': ' + name);
  });
  report.messages.unshift('REOS Version: ' + REOS.CONFIG.APP.VERSION);
  return report;
};

function reosOpenDashboard() { SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('Index').setTitle('REOS Enterprise').setWidth(1200).setHeight(800), 'REOS Enterprise'); }
function showExecutiveDashboard() { REOS.Security.requirePermission('dashboard:view'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('ExecutiveDashboard').setTitle('REOS Executive Dashboard').setWidth(1200).setHeight(800), 'REOS Executive Dashboard'); }
function showCRMDashboard() { REOS.Security.requirePermission('crm:read'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('CRMDashboard').setTitle('REOS CRM Dashboard').setWidth(1200).setHeight(800), 'REOS CRM Dashboard'); }
function showAcquisitionsDashboard() { REOS.Security.requirePermission('leads:read'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('AcquisitionsDashboard').setTitle('REOS Acquisitions Dashboard').setWidth(1200).setHeight(800), 'REOS Acquisitions Dashboard'); }
function showVendorDashboard() { REOS.Security.requirePermission('vendors:read'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('VendorDashboard').setTitle('REOS Vendor Dashboard').setWidth(1200).setHeight(800), 'REOS Vendor Dashboard'); }
function showPropertyDashboard() { REOS.Security.requirePermission('properties:read'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('PropertyDashboard').setTitle('REOS Property Dashboard').setWidth(1200).setHeight(800), 'REOS Property Dashboard'); }
function showAutomationDashboard() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('AutomationDashboard').setTitle('REOS Automation Dashboard').setWidth(1200).setHeight(800), 'REOS Automation Dashboard'); }
function showExternalIntegrations() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('ExternalIntegrations').setTitle('REOS External Integrations').setWidth(1200).setHeight(800), 'REOS External Integrations'); }
function showProductionHardening() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('ProductionHardening').setTitle('REOS Production Hardening').setWidth(1200).setHeight(800), 'REOS Production Hardening'); }
function showDashboardExport() { REOS.Security.requirePermission('dashboard:view'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('DashboardExport').setTitle('REOS Dashboard Export').setWidth(1200).setHeight(800), 'REOS Dashboard Export'); }
function showDocuments() { REOS.Security.requirePermission('dashboard:view'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('Documents').setTitle('REOS Documents').setWidth(1200).setHeight(800), 'REOS Documents'); }
function showAI() { REOS.Security.requirePermission('ai:use'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('AI').setTitle('REOS AI Workspace').setWidth(1200).setHeight(800), 'REOS AI Workspace'); }
function showAIDashboard() { REOS.Security.requirePermission('ai:use'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('AIDashboard').setTitle('REOS AI Dashboard').setWidth(1200).setHeight(800), 'REOS AI Dashboard'); }
function showAIAgents() { REOS.Security.requirePermission('ai:use'); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('AIAgents').setTitle('REOS AI Agents').setWidth(1200).setHeight(800), 'REOS AI Agents'); }
function showDeploymentWizard() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('DeploymentWizard').setTitle('REOS Deployment Wizard').setWidth(1200).setHeight(800), 'REOS Deployment Wizard'); }
function showAdmin() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('Admin').setTitle('REOS Admin').setWidth(1100).setHeight(760), 'REOS Admin'); }

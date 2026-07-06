/**
 * REOS Enterprise v3.x - Main Application Bootstrap
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
    REOS.ensureModuleSheets_();
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
  REOS.ensureModuleSheets_();
  if (REOS.AI && typeof REOS.AI.initialize === 'function') REOS.AI.initialize();
  REOS.setProperty_('REOS_LAST_OPENED_AT', new Date().toISOString());
};

REOS.ensureModuleSheets_ = function () {
  const modules = [
    'ExternalIntegrations', 'AutomationTemplates', 'ProductionHardening', 'DashboardExport', 'Documents',
    'AIAgents', 'DeploymentWizard', 'EnterpriseSeeder', 'OperationalValidator', 'ProductionMonitoring',
    'ReleasePackage', 'ProductionLaunch', 'MaintenanceManager', 'FinanceManager', 'FinanceEnhancements',
    'QuickBooksConnector', 'QuickBooksOAuth', 'FinanceDashboards', 'PortalFoundation', 'PortalAuth', 'InvestorPortal'
  ];
  modules.forEach(function (name) {
    if (REOS[name] && typeof REOS[name].ensureSheets === 'function') REOS[name].ensureSheets();
  });
};

REOS.buildMenu_ = function () {
  SpreadsheetApp.getUi().createMenu('REOS')
    .addItem('Open Dashboard Hub', 'showDashboardHub')
    .addItem('Open Finance Manager', 'showFinanceManager')
    .addItem('Open Finance Enhancements', 'showFinanceEnhancements')
    .addItem('Open Finance Dashboards', 'showFinanceDashboards')
    .addItem('Open QuickBooks Connector', 'showQuickBooksConnector')
    .addItem('Open QuickBooks OAuth', 'showQuickBooksOAuth')
    .addItem('Open Portal Foundation', 'showPortalFoundation')
    .addItem('Open Portal Auth', 'showPortalAuth')
    .addItem('Open Investor Portal', 'showInvestorPortal')
    .addItem('Open Deployment Wizard', 'showDeploymentWizard')
    .addItem('Open Enterprise Seeder', 'showEnterpriseSeeder')
    .addItem('Open Operational Validator', 'showOperationalValidator')
    .addItem('Open Production Monitoring', 'showProductionMonitoring')
    .addItem('Open Release Package', 'showReleasePackage')
    .addItem('Open Production Launch', 'showProductionLaunch')
    .addItem('Open Maintenance Manager', 'showMaintenanceManager')
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
    ['Priority', 'Critical', 1, true], ['Priority', 'High', 2, true], ['Priority', 'Medium', 3, true], ['Priority', 'Low', 4, true],
    ['Portal Role', 'Investor', 1, true], ['Portal Role', 'Lender', 2, true], ['Portal Role', 'Client', 3, true], ['Portal Role', 'Vendor', 4, true]
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
  ['VENDORS', 'WORK_ORDERS', 'AUTOMATION_RULES', 'AUTOMATION_RUNS', 'AUTOMATION_TEMPLATES', 'PROPERTIES', 'UNITS', 'INSPECTIONS', 'MAINTENANCE_REQUESTS', 'AI_REQUESTS', 'EXTERNAL_PROVIDERS', 'EXTERNAL_REQUESTS', 'HARDENING_REPORTS', 'HARDENING_CHECKS', 'DASHBOARD_EXPORTS', 'DOCUMENTS', 'DOCUMENT_FOLDERS', 'DOCUMENT_EVENTS', 'AI_AGENTS', 'AI_AGENT_RUNS', 'AI_AGENT_TASKS', 'DEPLOYMENT_RUNS', 'DEPLOYMENT_CHECKS', 'SEED_RUNS', 'SEED_ITEMS', 'DASHBOARD_SETTINGS', 'INSPECTION_TEMPLATES', 'ENVIRONMENT_SETTINGS', 'OPERATIONAL_VALIDATION_RUNS', 'OPERATIONAL_VALIDATION_CHECKS', 'MONITORING_SNAPSHOTS', 'MONITORING_ALERTS', 'MONITORING_METRICS', 'RELEASE_PACKAGES', 'RELEASE_ARTIFACTS', 'PRODUCTION_LAUNCHES', 'PRODUCTION_SIGNOFFS', 'PRODUCTION_LAUNCH_CHECKS', 'PATCH_ISSUES', 'REGRESSION_RUNS', 'HOTFIX_APPROVALS', 'PATCH_RELEASES', 'FIN_INVOICES', 'FIN_VENDOR_PAYMENTS', 'FIN_EXPENSES', 'FIN_PAYMENT_APPROVALS', 'FIN_QB_EXPORTS', 'FIN_INVOICE_LINES', 'FIN_ACCOUNT_CATEGORIES', 'FIN_INVOICE_PDFS', 'QB_CONNECTIONS', 'QB_SYNC_LOG', 'QB_ACCOUNT_MAP', 'QB_ENTITY_MAP', 'QB_EXPORT_QUEUE', 'QB_OAUTH_STATES', 'QB_TOKEN_EVENTS', 'QB_CONNECTION_TESTS', 'FIN_DASHBOARD_SNAPSHOTS', 'FIN_BUDGETS', 'PORTAL_ACCOUNTS', 'PORTAL_SESSIONS', 'PORTAL_INVITATIONS', 'PORTAL_DOCUMENT_SHARES', 'PORTAL_MESSAGES', 'PORTAL_TASKS', 'PORTAL_ACTIVITY_LOG', 'PORTAL_LOGIN_EVENTS', 'PORTAL_ROUTES', 'INVESTOR_PORTAL_UPDATES', 'INVESTOR_PROPERTY_WATCHLIST'].forEach(function (name) {
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
function showEnterpriseSeeder() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('EnterpriseSeeder').setTitle('REOS Enterprise Seeder').setWidth(1200).setHeight(800), 'REOS Enterprise Seeder'); }
function showOperationalValidator() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('OperationalValidator').setTitle('REOS Operational Validator').setWidth(1200).setHeight(800), 'REOS Operational Validator'); }
function showProductionMonitoring() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('ProductionMonitoring').setTitle('REOS Production Monitoring').setWidth(1200).setHeight(800), 'REOS Production Monitoring'); }
function showReleasePackage() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('ReleasePackage').setTitle('REOS Release Package').setWidth(1200).setHeight(800), 'REOS Release Package'); }
function showProductionLaunch() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('ProductionLaunch').setTitle('REOS Production Launch').setWidth(1200).setHeight(800), 'REOS Production Launch'); }
function showMaintenanceManager() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('MaintenanceManager').setTitle('REOS Maintenance Manager').setWidth(1200).setHeight(800), 'REOS Maintenance Manager'); }
function showFinanceManager() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('FinanceManager').setTitle('REOS Finance Manager').setWidth(1200).setHeight(800), 'REOS Finance Manager'); }
function showFinanceEnhancements() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('FinanceEnhancements').setTitle('REOS Finance Enhancements').setWidth(1200).setHeight(800), 'REOS Finance Enhancements'); }
function showFinanceDashboards() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('FinanceDashboards').setTitle('REOS Finance Dashboards').setWidth(1200).setHeight(850), 'REOS Finance Dashboards'); }
function showQuickBooksConnector() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('QuickBooksConnector').setTitle('REOS QuickBooks Connector').setWidth(1200).setHeight(800), 'REOS QuickBooks Connector'); }
function showQuickBooksOAuth() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('QuickBooksOAuth').setTitle('REOS QuickBooks OAuth').setWidth(1200).setHeight(800), 'REOS QuickBooks OAuth'); }
function showPortalFoundation() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('PortalFoundation').setTitle('REOS Portal Foundation').setWidth(1200).setHeight(850), 'REOS Portal Foundation'); }
function showPortalAuth() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('PortalAuth').setTitle('REOS Portal Auth').setWidth(1200).setHeight(850), 'REOS Portal Auth'); }
function showInvestorPortal() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('InvestorPortal').setTitle('REOS Investor Portal').setWidth(1200).setHeight(850), 'REOS Investor Portal'); }
function showAdmin() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('Admin').setTitle('REOS Admin').setWidth(1100).setHeight(760), 'REOS Admin'); }

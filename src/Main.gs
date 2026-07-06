/** REOS Enterprise v3.x - Main Application Bootstrap */

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
    SpreadsheetApp.getUi().alert('REOS Enterprise installation completed.');
  } catch (error) {
    REOS.handleError_('installREOS', error);
    throw error;
  } finally { lock.releaseLock(); }
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
  ['Acquisitions', 'Vendors', 'Properties'].forEach(function (name) {
    if (REOS[name] && typeof REOS[name].initialize === 'function') REOS[name].initialize();
  });
  if (REOS.Automation && typeof REOS.Automation.ensureSheets === 'function') REOS.Automation.ensureSheets();
  REOS.ensureModuleSheets_();
  if (REOS.AI && typeof REOS.AI.initialize === 'function') REOS.AI.initialize();
  REOS.setProperty_('REOS_LAST_OPENED_AT', new Date().toISOString());
};

REOS.ensureModuleSheets_ = function () {
  [
    'ExternalIntegrations', 'AutomationTemplates', 'ProductionHardening', 'DashboardExport', 'Documents', 'AIAgents',
    'DeploymentWizard', 'EnterpriseSeeder', 'OperationalValidator', 'ProductionMonitoring', 'ReleasePackage', 'ProductionLaunch',
    'MaintenanceManager', 'FinanceManager', 'FinanceEnhancements', 'QuickBooksConnector', 'QuickBooksOAuth', 'FinanceDashboards',
    'PortalFoundation', 'PortalAuth', 'InvestorPortal', 'VendorPortal', 'ClientLenderPortal'
  ].forEach(function (name) { if (REOS[name] && typeof REOS[name].ensureSheets === 'function') REOS[name].ensureSheets(); });
};

REOS.buildMenu_ = function () {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('REOS')
    .addItem('Open Dashboard Hub', 'showDashboardHub')
    .addItem('Open Finance Manager', 'showFinanceManager')
    .addItem('Open Finance Enhancements', 'showFinanceEnhancements')
    .addItem('Open Finance Dashboards', 'showFinanceDashboards')
    .addItem('Open QuickBooks Connector', 'showQuickBooksConnector')
    .addItem('Open QuickBooks OAuth', 'showQuickBooksOAuth')
    .addItem('Open Portal Foundation', 'showPortalFoundation')
    .addItem('Open Portal Auth', 'showPortalAuth')
    .addItem('Open Investor Portal', 'showInvestorPortal')
    .addItem('Open Vendor Portal UI', 'showVendorPortalUI')
    .addItem('Open Client Lender Portal', 'showClientLenderPortal')
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
    if (!sheet) { sheet = ss.insertSheet(sheetName); REOS.applyDefaultSheetStyle_(sheet); }
  });
};
REOS.applyDefaultSheetStyle_ = function (sheet) { sheet.setFrozenRows(1); sheet.getRange('A1:Z1').setFontWeight('bold'); };
REOS.seedSettings_ = function () { const sheet = REOS.getSheet_(REOS.CONFIG.SHEETS.SETTINGS); if (sheet.getLastRow() > 1) return; const rows = [['Setting','Value','Description'],['Business Name','REOS Enterprise','Displayed application name'],['Default Time Zone',REOS.CONFIG.APP.TIME_ZONE,'Application time zone'],['Currency','USD','Default currency']]; sheet.clear(); sheet.getRange(1,1,rows.length,rows[0].length).setValues(rows); REOS.applyDefaultSheetStyle_(sheet); };
REOS.seedLookups_ = function () { const sheet = REOS.getSheet_(REOS.CONFIG.SHEETS.LOOKUPS); if (sheet.getLastRow() > 1) return; const rows = [['Category','Value','Sort Order','Active'],['Portal Role','Investor',1,true],['Portal Role','Lender',2,true],['Portal Role','Client',3,true],['Portal Role','Vendor',4,true],['Priority','High',1,true],['Priority','Medium',2,true],['Priority','Low',3,true]]; sheet.clear(); sheet.getRange(1,1,rows.length,rows[0].length).setValues(rows); REOS.applyDefaultSheetStyle_(sheet); };
REOS.seedInitialAdmin_ = function () { if (REOS.Users && typeof REOS.Users.seedAdminIfEmpty === 'function') return REOS.Users.seedAdminIfEmpty(); return null; };
REOS.healthCheck_ = function () { const report = { ok: true, messages: [] }; const ss = SpreadsheetApp.getActiveSpreadsheet(); const required = ['VENDORS','WORK_ORDERS','PROPERTIES','FIN_INVOICES','FIN_VENDOR_PAYMENTS','FIN_EXPENSES','PORTAL_ACCOUNTS','PORTAL_SESSIONS','PORTAL_INVITATIONS','PORTAL_DOCUMENT_SHARES','PORTAL_MESSAGES','PORTAL_TASKS','INVESTOR_PORTAL_UPDATES','INVESTOR_PROPERTY_WATCHLIST','VENDOR_PORTAL_UPDATES','VENDOR_WORK_SUBMISSIONS','CLIENT_LENDER_PORTAL_UPDATES','LENDER_PORTAL_NOTES']; Object.keys(REOS.CONFIG.SHEETS).forEach(function (key) { required.push(REOS.CONFIG.SHEETS[key]); }); required.forEach(function (name) { const exists = !!ss.getSheetByName(name); if (!exists) report.ok = false; report.messages.push((exists ? 'OK' : 'MISSING') + ': ' + name); }); report.messages.unshift('REOS Version: ' + REOS.CONFIG.APP.VERSION); return report; };

function showModal_(file, title, width, height) { SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile(file).setTitle(title).setWidth(width || 1200).setHeight(height || 800), title); }
function reosOpenDashboard() { showModal_('Index', 'REOS Enterprise', 1200, 800); }
function showExecutiveDashboard() { REOS.Security.requirePermission('dashboard:view'); showModal_('ExecutiveDashboard', 'REOS Executive Dashboard', 1200, 800); }
function showCRMDashboard() { REOS.Security.requirePermission('crm:read'); showModal_('CRMDashboard', 'REOS CRM Dashboard', 1200, 800); }
function showAcquisitionsDashboard() { REOS.Security.requirePermission('leads:read'); showModal_('AcquisitionsDashboard', 'REOS Acquisitions Dashboard', 1200, 800); }
function showVendorDashboard() { REOS.Security.requirePermission('vendors:read'); showModal_('VendorDashboard', 'REOS Vendor Dashboard', 1200, 800); }
function showPropertyDashboard() { REOS.Security.requirePermission('properties:read'); showModal_('PropertyDashboard', 'REOS Property Dashboard', 1200, 800); }
function showAutomationDashboard() { REOS.Security.requireAdmin(); showModal_('AutomationDashboard', 'REOS Automation Dashboard', 1200, 800); }
function showExternalIntegrations() { REOS.Security.requireAdmin(); showModal_('ExternalIntegrations', 'REOS External Integrations', 1200, 800); }
function showProductionHardening() { REOS.Security.requireAdmin(); showModal_('ProductionHardening', 'REOS Production Hardening', 1200, 800); }
function showDashboardExport() { REOS.Security.requirePermission('dashboard:view'); showModal_('DashboardExport', 'REOS Dashboard Export', 1200, 800); }
function showDocuments() { REOS.Security.requirePermission('dashboard:view'); showModal_('Documents', 'REOS Documents', 1200, 800); }
function showAI() { REOS.Security.requirePermission('ai:use'); showModal_('AI', 'REOS AI Workspace', 1200, 800); }
function showAIDashboard() { REOS.Security.requirePermission('ai:use'); showModal_('AIDashboard', 'REOS AI Dashboard', 1200, 800); }
function showAIAgents() { REOS.Security.requirePermission('ai:use'); showModal_('AIAgents', 'REOS AI Agents', 1200, 800); }
function showDeploymentWizard() { REOS.Security.requireAdmin(); showModal_('DeploymentWizard', 'REOS Deployment Wizard', 1200, 800); }
function showEnterpriseSeeder() { REOS.Security.requireAdmin(); showModal_('EnterpriseSeeder', 'REOS Enterprise Seeder', 1200, 800); }
function showOperationalValidator() { REOS.Security.requireAdmin(); showModal_('OperationalValidator', 'REOS Operational Validator', 1200, 800); }
function showProductionMonitoring() { REOS.Security.requireAdmin(); showModal_('ProductionMonitoring', 'REOS Production Monitoring', 1200, 800); }
function showReleasePackage() { REOS.Security.requireAdmin(); showModal_('ReleasePackage', 'REOS Release Package', 1200, 800); }
function showProductionLaunch() { REOS.Security.requireAdmin(); showModal_('ProductionLaunch', 'REOS Production Launch', 1200, 800); }
function showMaintenanceManager() { REOS.Security.requireAdmin(); showModal_('MaintenanceManager', 'REOS Maintenance Manager', 1200, 800); }
function showFinanceManager() { REOS.Security.requireAdmin(); showModal_('FinanceManager', 'REOS Finance Manager', 1200, 800); }
function showFinanceEnhancements() { REOS.Security.requireAdmin(); showModal_('FinanceEnhancements', 'REOS Finance Enhancements', 1200, 800); }
function showFinanceDashboards() { REOS.Security.requireAdmin(); showModal_('FinanceDashboards', 'REOS Finance Dashboards', 1200, 850); }
function showQuickBooksConnector() { REOS.Security.requireAdmin(); showModal_('QuickBooksConnector', 'REOS QuickBooks Connector', 1200, 800); }
function showQuickBooksOAuth() { REOS.Security.requireAdmin(); showModal_('QuickBooksOAuth', 'REOS QuickBooks OAuth', 1200, 800); }
function showPortalFoundation() { REOS.Security.requireAdmin(); showModal_('PortalFoundation', 'REOS Portal Foundation', 1200, 850); }
function showPortalAuth() { REOS.Security.requireAdmin(); showModal_('PortalAuth', 'REOS Portal Auth', 1200, 850); }
function showInvestorPortal() { REOS.Security.requireAdmin(); showModal_('InvestorPortal', 'REOS Investor Portal', 1200, 850); }
function showVendorPortalUI() { REOS.Security.requireAdmin(); showModal_('VendorPortal', 'REOS Vendor Portal', 1200, 850); }
function showClientLenderPortal() { REOS.Security.requireAdmin(); showModal_('ClientLenderPortal', 'REOS Client Lender Portal', 1200, 850); }
function showAdmin() { REOS.Security.requireAdmin(); showModal_('Admin', 'REOS Admin', 1100, 760); }

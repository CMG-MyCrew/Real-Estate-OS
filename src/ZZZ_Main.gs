/** REOS Enterprise v3.2.6 - Main Application Bootstrap */

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
    if (REOS.Phase1Upgrade) REOS.Phase1Upgrade.run();
    REOS.setProperty_('REOS_VERSION', REOS.CONFIG.APP.VERSION);
    REOS.setProperty_('REOS_INSTALLED_AT', new Date().toISOString());
    REOS.log_('INFO', 'REOS installation completed', { version: REOS.CONFIG.APP.VERSION });
    SpreadsheetApp.getUi().alert('REOS Enterprise installation / repair completed.');
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
  REOS.ensureModuleSheets_();
  if (REOS.AI && typeof REOS.AI.initialize === 'function') REOS.AI.initialize();
  REOS.setProperty_('REOS_LAST_OPENED_AT', new Date().toISOString());
};

REOS.ensureModuleSheets_ = function () {
  const modules = [
    'ExternalIntegrations', 'Automation', 'AutomationTemplates', 'ProductionHardening', 'DashboardExport', 'Documents', 'AIAgents',
    'DeploymentWizard', 'EnterpriseSeeder', 'OperationalValidator', 'ProductionMonitoring', 'ReleasePackage', 'ProductionLaunch',
    'MaintenanceManager', 'FinanceManager', 'FinanceEnhancements', 'QuickBooksConnector', 'QuickBooksOAuth', 'FinanceDashboards',
    'PortalFoundation', 'PortalAuth', 'InvestorPortal', 'VendorPortal', 'ClientLenderPortal', 'Phase1Upgrade'
  ];
  modules.forEach(function (name) { if (REOS[name] && typeof REOS[name].ensureSheets === 'function') REOS[name].ensureSheets(); });
};

REOS.buildMenu_ = function () {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('REOS')
    .addItem('Run Phase 1 Upgrade', 'reosRunPhase1Upgrade')
    .addItem('Validate Phase 1 Upgrade', 'reosValidatePhase1Upgrade')
    .addSeparator()
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
    .addItem('Open Client/Lender Portal', 'showClientLenderPortal')
    .addSeparator()
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
    .addItem('Setup Acquisition Intelligence', 'runAcquisitionSprint31Setup')
    .addItem('Run Acquisition Scan', 'runDailyAcquisitionScan')
    .addItem('Install Daily Acquisition Trigger', 'installDailyAcquisitionTrigger')
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
REOS.seedSettings_ = function () { const sheet = REOS.getSheet_(REOS.CONFIG.SHEETS.SETTINGS); if (sheet.getLastRow() > 1) return; const rows = [['Setting','Value','Description'],['Business Name','REOS Enterprise','Displayed application name'],['Version',REOS.CONFIG.APP.VERSION,'Current REOS version'],['Default Time Zone',REOS.CONFIG.APP.TIME_ZONE,'Application time zone'],['Currency','USD','Default currency']]; sheet.clear(); sheet.getRange(1,1,rows.length,rows[0].length).setValues(rows); REOS.applyDefaultSheetStyle_(sheet); };
REOS.seedLookups_ = function () { const sheet = REOS.getSheet_(REOS.CONFIG.SHEETS.LOOKUPS); if (sheet.getLastRow() > 1) return; const rows = [['Category','Value','Sort Order','Active'],['Portal Role','Investor',1,true],['Portal Role','Lender',2,true],['Portal Role','Client',3,true],['Portal Role','Vendor',4,true],['Priority','Critical',1,true],['Priority','High',2,true],['Priority','Medium',3,true],['Priority','Low',4,true]]; sheet.clear(); sheet.getRange(1,1,rows.length,rows[0].length).setValues(rows); REOS.applyDefaultSheetStyle_(sheet); };
REOS.seedInitialAdmin_ = function () { if (REOS.Users && typeof REOS.Users.seedAdminIfEmpty === 'function') return REOS.Users.seedAdminIfEmpty(); return null; };

REOS.healthCheck_ = function () {
  const report = { ok: true, messages: [] };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const required = [];
  Object.keys(REOS.CONFIG.SHEETS).forEach(function (key) { required.push(REOS.CONFIG.SHEETS[key]); });
  ['UPGRADE_LOG'].forEach(function (name) { required.push(name); });
  required.forEach(function (name) {
    const exists = !!ss.getSheetByName(name);
    if (!exists) report.ok = false;
    report.messages.push((exists ? 'OK' : 'MISSING') + ': ' + name);
  });
  report.messages.unshift('REOS Version: ' + REOS.CONFIG.APP.VERSION);
  return report;
};

function showModal_(file, title, width, height) { SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile(file).setTitle(title).setWidth(width || 1200).setHeight(height || 800), title); }
function safeShowModal_(file, title, width, height) { try { showModal_(file, title, width, height); } catch (e) { SpreadsheetApp.getUi().alert(title + ' is not imported yet. Run Phase 2 module import.\n\n' + e.message); } }
function reosOpenDashboard() { safeShowModal_('Index', 'REOS Enterprise', 1200, 800); }
function showExecutiveDashboard() { safeShowModal_('ExecutiveDashboard', 'REOS Executive Dashboard', 1200, 800); }
function showCRMDashboard() { safeShowModal_('CRMDashboard', 'REOS CRM Dashboard', 1200, 800); }
function showAcquisitionsDashboard() { safeShowModal_('AcquisitionsDashboard', 'REOS Acquisitions Dashboard', 1200, 800); }
function showVendorDashboard() { safeShowModal_('VendorDashboard', 'REOS Vendor Dashboard', 1200, 800); }
function showPropertyDashboard() { safeShowModal_('PropertyDashboard', 'REOS Property Dashboard', 1200, 800); }
function showAutomationDashboard() { safeShowModal_('AutomationDashboard', 'REOS Automation Dashboard', 1200, 800); }
function showExternalIntegrations() { safeShowModal_('ExternalIntegrations', 'REOS External Integrations', 1200, 800); }
function showProductionHardening() { safeShowModal_('ProductionHardening', 'REOS Production Hardening', 1200, 800); }
function showDashboardExport() { safeShowModal_('DashboardExport', 'REOS Dashboard Export', 1200, 800); }
function showDocuments() { safeShowModal_('Documents', 'REOS Documents', 1200, 800); }
function showAI() { safeShowModal_('AI', 'REOS AI Workspace', 1200, 800); }
function showAIDashboard() { safeShowModal_('AIDashboard', 'REOS AI Dashboard', 1200, 800); }
function showAIAgents() { safeShowModal_('AIAgents', 'REOS AI Agents', 1200, 800); }
function showDeploymentWizard() { safeShowModal_('DeploymentWizard', 'REOS Deployment Wizard', 1200, 800); }
function showEnterpriseSeeder() { safeShowModal_('EnterpriseSeeder', 'REOS Enterprise Seeder', 1200, 800); }
function showOperationalValidator() { safeShowModal_('OperationalValidator', 'REOS Operational Validator', 1200, 800); }
function showProductionMonitoring() { safeShowModal_('ProductionMonitoring', 'REOS Production Monitoring', 1200, 800); }
function showReleasePackage() { safeShowModal_('ReleasePackage', 'REOS Release Package', 1200, 800); }
function showProductionLaunch() { safeShowModal_('ProductionLaunch', 'REOS Production Launch', 1200, 800); }
function showMaintenanceManager() { safeShowModal_('MaintenanceManager', 'REOS Maintenance Manager', 1200, 800); }
function showFinanceManager() { safeShowModal_('FinanceManager', 'REOS Finance Manager', 1200, 800); }
function showFinanceEnhancements() { safeShowModal_('FinanceEnhancements', 'REOS Finance Enhancements', 1200, 800); }
function showFinanceDashboards() { safeShowModal_('FinanceDashboards', 'REOS Finance Dashboards', 1200, 850); }
function showQuickBooksConnector() { safeShowModal_('QuickBooksConnector', 'REOS QuickBooks Connector', 1200, 800); }
function showQuickBooksOAuth() { safeShowModal_('QuickBooksOAuth', 'REOS QuickBooks OAuth', 1200, 800); }
function showPortalFoundation() { safeShowModal_('PortalFoundation', 'REOS Portal Foundation', 1200, 850); }
function showPortalAuth() { safeShowModal_('PortalAuth', 'REOS Portal Auth', 1200, 850); }
function showInvestorPortal() { safeShowModal_('InvestorPortal', 'REOS Investor Portal', 1200, 850); }
function showVendorPortalUI() { safeShowModal_('VendorPortal', 'REOS Vendor Portal', 1200, 850); }
function showClientLenderPortal() { safeShowModal_('ClientLenderPortal', 'REOS Client Lender Portal', 1200, 850); }
function showAdmin() { safeShowModal_('Admin', 'REOS Admin', 1100, 760); }
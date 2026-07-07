/**
 * REOS Enterprise v3.2.10 - Unified Menu
 */

var REOS = REOS || {};

REOS.buildMenu_ = function () {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('REOS')
    .addItem('Run Diagnostics', 'reosRunDiagnostics')
    .addItem('Diagnostics Summary', 'reosDiagnosticsSummary')
    .addItem('Run Self-Healing', 'reosRunSelfHealing')
    .addItem('Run Environment Validation', 'reosRunEnvironmentValidation')
    .addItem('Environment Summary', 'reosEnvironmentSummary')
    .addItem('Run Integration Monitor', 'reosRunIntegrationMonitor')
    .addItem('Integration Summary', 'reosIntegrationSummary')
    .addSeparator()
    .addItem('Run Phase 1 Upgrade', 'reosRunPhase1Upgrade')
    .addItem('Validate Phase 1 Upgrade', 'reosValidatePhase1Upgrade')
    .addItem('Core Diagnostics', 'reosCoreDiagnostics')
    .addItem('Sync Module Sheets', 'reosCoreSyncModules')
    .addItem('Module Health Report', 'reosModulesHealthReport')
    .addItem('Initialize Enabled Modules', 'reosModulesSyncEnabled')
    .addSeparator()
    .addItem('Open Dashboard Hub', 'showDashboardHub')
    .addItem('Open Finance Manager', 'showFinanceManager')
    .addItem('Open Finance Enhancements', 'showFinanceEnhancements')
    .addItem('Open Finance Dashboards', 'showFinanceDashboards')
    .addItem('Open QuickBooks Connector', 'showQuickBooksConnector')
    .addItem('Open QuickBooks OAuth', 'showQuickBooksOAuth')
    .addSeparator()
    .addItem('Open Portal Foundation', 'showPortalFoundation')
    .addItem('Open Portal Auth', 'showPortalAuth')
    .addItem('Open Investor Portal', 'showInvestorPortal')
    .addItem('Open Vendor Portal UI', 'showVendorPortalUI')
    .addItem('Open Client/Lender Portal', 'showClientLenderPortal')
    .addSeparator()
    .addItem('Open CRM', 'showCRM')
    .addItem('Open Documents', 'showDocuments')
    .addItem('Open Automation', 'showAutomation')
    .addItem('Open AI Workspace', 'showAI')
    .addItem('Open Admin', 'showAdmin')
    .addSeparator()
    .addItem('Health Check', 'runHealthCheck')
    .addItem('Install / Repair REOS', 'installREOS')
    .addToUi();
};

function showDashboardHub() { safeShowMenuModal_('DashboardHub', 'REOS Dashboard Hub', 1200, 800); }
function showFinanceManager() { safeShowMenuModal_('FinanceManager', 'REOS Finance Manager', 1200, 800); }
function showFinanceEnhancements() { safeShowMenuModal_('FinanceEnhancements', 'REOS Finance Enhancements', 1200, 800); }
function showFinanceDashboards() { safeShowMenuModal_('FinanceDashboards', 'REOS Finance Dashboards', 1200, 850); }
function showQuickBooksConnector() { safeShowMenuModal_('QuickBooksConnector', 'REOS QuickBooks Connector', 1200, 800); }
function showQuickBooksOAuth() { safeShowMenuModal_('QuickBooksOAuth', 'REOS QuickBooks OAuth', 1200, 800); }
function showPortalFoundation() { safeShowMenuModal_('PortalFoundation', 'REOS Portal Foundation', 1200, 850); }
function showPortalAuth() { safeShowMenuModal_('PortalAuth', 'REOS Portal Auth', 1200, 850); }
function showInvestorPortal() { safeShowMenuModal_('InvestorPortal', 'REOS Investor Portal', 1200, 850); }
function showVendorPortalUI() { safeShowMenuModal_('VendorPortal', 'REOS Vendor Portal', 1200, 850); }
function showClientLenderPortal() { safeShowMenuModal_('ClientLenderPortal', 'REOS Client Lender Portal', 1200, 850); }
function showCRM() { safeShowMenuModal_('CRM', 'REOS CRM', 1200, 800); }
function showDocuments() { safeShowMenuModal_('Documents', 'REOS Documents', 1200, 800); }
function showAutomation() { safeShowMenuModal_('Automation', 'REOS Automation', 1200, 800); }
function showAI() { safeShowMenuModal_('AI', 'REOS AI Workspace', 1200, 800); }
function showAdmin() { safeShowMenuModal_('Admin', 'REOS Admin', 1200, 800); }

function safeShowMenuModal_(file, title, width, height) {
  try {
    if (REOS.CoreFoundation && typeof REOS.CoreFoundation.safeOpen === 'function') return REOS.CoreFoundation.safeOpen(file, title, width, height);
    const html = HtmlService.createHtmlOutputFromFile(file).setWidth(width || 1200).setHeight(height || 800).setTitle(title);
    SpreadsheetApp.getUi().showModalDialog(html, title);
    return true;
  } catch (error) {
    SpreadsheetApp.getUi().alert(title + ' is not available yet.\n\n' + error.message);
    return false;
  }
}

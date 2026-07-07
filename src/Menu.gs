/**
 * REOS Enterprise v3.2.11 - Dynamic Menu Builder
 */

var REOS = REOS || {};

REOS.buildMenu_ = function () {
  if (REOS.MenuRegistry && typeof REOS.MenuRegistry.render === 'function') {
    return REOS.MenuRegistry.render();
  }

  SpreadsheetApp.getUi()
    .createMenu('REOS')
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
function showClientLenderPortal() { safeShowMenuModal_('ClientLenderPortal', 'REOS Client/Lender Portal', 1200, 850); }
function showCRM() { safeShowMenuModal_('CRM', 'REOS CRM', 1200, 800); }
function showDocuments() { safeShowMenuModal_('Documents', 'REOS Documents', 1200, 800); }
function showAutomation() { safeShowMenuModal_('Automation', 'REOS Automation', 1200, 800); }
function showAI() { safeShowMenuModal_('AI', 'REOS AI Workspace', 1200, 800); }
function showAdmin() { safeShowMenuModal_('Admin', 'REOS Admin', 1200, 800); }

function safeShowMenuModal_(file, title, width, height) {
  try {
    if (REOS.CoreFoundation && typeof REOS.CoreFoundation.safeOpen === 'function') return REOS.CoreFoundation.safeOpen(file, title, width, height);
    var html = HtmlService.createHtmlOutputFromFile(file).setWidth(width || 1200).setHeight(height || 800).setTitle(title);
    SpreadsheetApp.getUi().showModalDialog(html, title);
    return true;
  } catch (error) {
    SpreadsheetApp.getUi().alert(title + ' is not available yet.\n\n' + error.message);
    return false;
  }
}

/**
 * REOS Enterprise v3.2.10 - Error Center Menu Patch
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
    .addItem('Run Performance Monitor', 'reosRunPerformanceMonitor')
    .addItem('Performance Summary', 'reosPerformanceSummary')
    .addItem('Run Error Scan', 'reosRunErrorScan')
    .addItem('Error Summary', 'reosErrorSummary')
    .addItem('Open Error Dashboard', 'showErrorDashboard')
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

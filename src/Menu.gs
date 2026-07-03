/**
 * REOS Enterprise v3.0 - Custom Menu
 */

var REOS = REOS || {};

REOS.buildMenu_ = function () {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('REOS')
    .addItem('Home', 'goHome')
    .addItem('Open Dashboard', 'showDashboard')
    .addItem('Open Sidebar', 'showSidebar')
    .addSeparator()
    .addItem('Open CRM App', 'showCRM')
    .addItem('Open Tasks App', 'showTasks')
    .addItem('Open Transactions App', 'showTransactions')
    .addItem('Open Investments App', 'showInvestments')
    .addItem('Open Rentals App', 'showRentals')
    .addItem('Open Finance App', 'showFinance')
    .addSeparator()
    .addItem('CRM Sheet', 'goCRM')
    .addItem('Leads Sheet', 'goLeads')
    .addItem('Tasks Sheet', 'goTasks')
    .addSeparator()
    .addItem('Health Check', 'runHealthCheck')
    .addSeparator()
    .addItem('Install / Repair REOS', 'installREOS')
    .addToUi();
};

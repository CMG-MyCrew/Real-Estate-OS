/**
 * REOS Enterprise v3.0 - Custom Menu
 */

var REOS = REOS || {};

REOS.buildMenu_ = function () {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('REOS')
    .addItem('Home', 'goHome')
    .addSeparator()
    .addItem('CRM', 'goCRM')
    .addItem('Leads', 'goLeads')
    .addItem('Tasks', 'goTasks')
    .addSeparator()
    .addItem('Open Sidebar', 'showSidebar')
    .addItem('Health Check', 'runHealthCheck')
    .addSeparator()
    .addItem('Install / Repair REOS', 'installREOS')
    .addToUi();
};

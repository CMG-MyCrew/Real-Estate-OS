/**
 * REOS Enterprise v3.2.10 - Error Dashboard Server
 */

var REOS = REOS || {};

function showErrorDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('ErrorDashboard')
    .setTitle('REOS Error Dashboard')
    .setWidth(1200)
    .setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Error Dashboard');
}

function reosGetErrorDashboardData() {
  return {
    summary: REOS.ErrorCenter.summary(),
    openErrors: REOS.ErrorCenter.list({ status: 'Open' }).slice(0, 50),
    recentResolved: REOS.ErrorCenter.list({ status: 'Resolved' }).slice(0, 25)
  };
}

function reosResolveError(errorId, notes) {
  return REOS.ErrorCenter.resolve(errorId, notes || 'Resolved from dashboard.');
}

function reosArchiveError(errorId, notes) {
  return REOS.ErrorCenter.archive(errorId, notes || 'Archived from dashboard.');
}

function reosReopenError(errorId, notes) {
  return REOS.ErrorCenter.reopen(errorId, notes || 'Reopened from dashboard.');
}

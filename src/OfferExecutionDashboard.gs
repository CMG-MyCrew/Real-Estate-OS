/**
 * REOS Enterprise v4.3.3
 * Sprint 7.2 Increment 5 — Offer Execution Dashboard
 */
var REOS = REOS || {};

REOS.OfferExecutionDashboard = (function () {
  function data(filters) {
    if (!REOS.OfferExecutionWorkflow) throw new Error('OfferExecutionWorkflow.gs is required.');
    var summary = REOS.OfferExecutionWorkflow.summary();
    var records = REOS.OfferExecutionWorkflow.list(filters || {});
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      kpis: {
        total: summary.total || 0,
        ready: summary.ready || 0,
        submitted: summary.submitted || 0,
        countered: summary.countered || 0,
        accepted: summary.accepted || 0,
        rejected: summary.rejected || 0,
        expired: summary.expired || 0,
        totalOfferValue: summary.totalOfferValue || 0
      },
      records: records,
      statuses: ['Ready','Submitted','Countered','Accepted','Rejected','Expired','Withdrawn'],
      methods: ['Email','Mail','Portal','In Person','Other']
    };
  }

  function show() {
    var html = HtmlService.createHtmlOutputFromFile('OfferExecutionDashboardUI')
      .setWidth(1400)
      .setHeight(850);
    SpreadsheetApp.getUi().showModelessDialog(html, 'REOS Offer Execution');
  }

  return { data: data, show: show };
})();

function reosOfferExecutionDashboardData(filters) {
  return JSON.stringify(REOS.OfferExecutionDashboard.data(filters || {}));
}

function showOfferExecutionDashboard() {
  return REOS.OfferExecutionDashboard.show();
}

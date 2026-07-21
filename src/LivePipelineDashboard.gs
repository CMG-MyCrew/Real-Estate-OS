/** REOS Enterprise v4.4.2 — Live Pipeline Verification Dashboard */
var REOS = REOS || {};

REOS.LivePipelineDashboard = (function () {
  function getData() {
    if (!REOS.LivePipelineVerification) throw new Error('LivePipelineVerification.gs is required.');
    var summary = REOS.LivePipelineVerification.summary();
    var latest = summary.latest || {};
    var results = [];
    if (REOS.Database && latest['Run ID']) {
      results = (REOS.Database.getAll('LIVE_PIPELINE_RESULTS') || []).filter(function (r) {
        return String(r['Run ID'] || '') === String(latest['Run ID']);
      });
    }
    return {
      ok: true,
      latest: latest,
      results: results,
      totals: {
        runs: summary.runs || 0,
        passed: Number(latest.Passed || 0),
        failed: Number(latest.Failed || 0),
        integrity: Number(latest['Integrity Percent'] || 0)
      }
    };
  }

  function show() {
    var html = HtmlService.createTemplateFromFile('LivePipelineDashboardUI');
    html.initialData = JSON.stringify(getData());
    SpreadsheetApp.getUi().showSidebar(html.evaluate().setTitle('Live Pipeline Verification').setWidth(420));
  }

  return { getData: getData, show: show };
})();

function reosLivePipelineDashboardData() { return REOS.LivePipelineDashboard.getData(); }
function showLivePipelineDashboard() { return REOS.LivePipelineDashboard.show(); }

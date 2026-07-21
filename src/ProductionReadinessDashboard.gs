/**
 * REOS Enterprise v4.4.0
 * Sprint 7.3 Increment 1 — Production Readiness Dashboard
 */
var REOS = REOS || {};

REOS.ProductionReadinessDashboard = (function () {
  function data() {
    if (!REOS.ProductionReadiness) {
      throw new Error('ProductionReadiness.gs is required.');
    }

    var summary = REOS.ProductionReadiness.summary(10);
    var latest = REOS.ProductionReadiness.latestResults();
    var results = latest.results || [];

    return clean_({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: summary,
      latestRun: latest.run,
      results: results,
      byCategory: group_(results, 'Category'),
      failures: results.filter(function (row) { return row.Status === 'Fail'; }),
      warnings: results.filter(function (row) { return row.Status === 'Warning'; })
    });
  }

  function runTests() {
    return clean_(REOS.ProductionReadiness.run());
  }

  function group_(rows, field) {
    return rows.reduce(function (map, row) {
      var key = row[field] || 'Unknown';
      if (!map[key]) map[key] = { total: 0, passed: 0, failed: 0, warnings: 0 };
      map[key].total++;
      if (row.Status === 'Pass') map[key].passed++;
      if (row.Status === 'Fail') map[key].failed++;
      if (row.Status === 'Warning') map[key].warnings++;
      return map;
    }, {});
  }

  function clean_(value) {
    return JSON.parse(JSON.stringify(value || null, function (key, item) {
      if (item instanceof Date) return item.toISOString();
      if (typeof item === 'number' && !isFinite(item)) return 0;
      return item;
    }));
  }

  return { data: data, runTests: runTests };
})();

function reosProductionReadinessDashboardData() {
  return REOS.ProductionReadinessDashboard.data();
}

function reosProductionReadinessDashboardRun() {
  return REOS.ProductionReadinessDashboard.runTests();
}

function showProductionReadinessDashboard() {
  var html = HtmlService
    .createHtmlOutputFromFile('ProductionReadinessDashboardUI')
    .setWidth(1200)
    .setHeight(760);
  SpreadsheetApp.getUi().showModelessDialog(html, 'REOS Production Readiness');
}

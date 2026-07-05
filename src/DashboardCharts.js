/**
 * REOS Enterprise v3.0 - Dashboard Charts
 * Lightweight chart rendering helpers for Apps Script HTML dashboards.
 * This file is source-controlled for future bundling; Apps Script HTML can
 * inline the same logic through DashboardComponents.html.
 */

var REOSDashboardCharts = (function () {
  function renderBarChart(rows) {
    rows = rows || [];
    if (!rows.length) return '<span class="muted">No chart data.</span>';
    var max = rows.reduce(function (m, row) { return Math.max(m, Number(row.value || row.count || 0)); }, 1);
    return rows.map(function (row) {
      var label = row.label || row.stage || row.metric || '';
      var value = Number(row.value || row.count || 0);
      var width = Math.max(2, Math.round((value / max) * 100));
      return '<div class="reos-bar-row"><span>' + escapeHtml(label) + '</span><div class="reos-bar-track"><div class="reos-bar-fill" style="width:' + width + '%"></div></div><strong>' + value + '</strong></div>';
    }).join('');
  }

  function renderFunnel(rows) {
    rows = rows || [];
    if (!rows.length) return '<span class="muted">No funnel data.</span>';
    return '<div class="reos-funnel">' + rows.map(function (row) {
      return '<div class="reos-funnel-stage"><strong>' + escapeHtml(row.value || row.count || 0) + '</strong><span>' + escapeHtml(row.label || row.stage || '') + '</span></div>';
    }).join('') + '</div>';
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>'"]/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char];
    });
  }

  return {
    renderBarChart: renderBarChart,
    renderFunnel: renderFunnel
  };
})();

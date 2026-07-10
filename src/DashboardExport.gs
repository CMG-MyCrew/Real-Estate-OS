/**
 * REOS Enterprise v3.0 - Sprint 14 Dashboard Print/PDF Export Support
 *
 * Adds print-ready export manifests, dashboard export audit logging,
 * HTML export generation, Drive file creation stubs, and PDF-ready helpers.
 */

var REOS = REOS || {};

REOS.DashboardExport = (function () {
  const EXPORTS_SHEET = 'DASHBOARD_EXPORTS';
  const EXPORT_ID_FIELD = 'Export ID';
  const EXPORT_HEADERS = [
    'Export ID', 'Dashboard Key', 'Format', 'Status', 'File Name', 'File URL',
    'Requested By', 'Options JSON', 'Error', 'Created At', 'Updated At'
  ];

  const DASHBOARDS = [
    { key: 'executive', title: 'Executive Dashboard' },
    { key: 'crm', title: 'CRM Dashboard' },
    { key: 'acquisitions', title: 'Acquisitions Dashboard' },
    { key: 'properties', title: 'Property Operations Dashboard' },
    { key: 'vendors', title: 'Vendor Operations Dashboard' },
    { key: 'automation', title: 'Automation Dashboard' },
    { key: 'ai', title: 'AI Command Center' }
  ];

  function ensureSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(EXPORTS_SHEET);
    if (!sheet) sheet = ss.insertSheet(EXPORTS_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, EXPORT_HEADERS.length).setValues([EXPORT_HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, EXPORT_HEADERS.length).setFontWeight('bold').setWrap(true);
      sheet.autoResizeColumns(1, EXPORT_HEADERS.length);
    }
    return sheet;
  }

  function getExportCenter() {
    REOS.Security.requirePermission('dashboard:view');
    ensureSheets();
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      dashboards: getAvailableDashboards_(),
      recentExports: getRecentExports({ limit: 25 }),
      supportedFormats: ['print_html', 'pdf_stub', 'csv']
    };
  }

  function getRecentExports(options) {
    REOS.Security.requirePermission('dashboard:view');
    ensureSheets();
    options = options || {};
    let rows = REOS.Database.getAll(EXPORTS_SHEET);
    if (options.dashboardKey) rows = rows.filter(function (row) { return row['Dashboard Key'] === options.dashboardKey; });
    return rows.slice().sort(function (a, b) {
      return (new Date(b['Created At'] || 0).getTime() || 0) - (new Date(a['Created At'] || 0).getTime() || 0);
    }).slice(0, Number(options.limit || 50));
  }

  function buildPrintHtml(dashboardKey, options) {
    REOS.Security.requirePermission('dashboard:view');
    ensureSheets();
    options = options || {};
    const dashboard = REOS.DashboardService.getDashboard(dashboardKey || 'executive', options);
    const html = renderPrintHtml_(dashboard, options);
    logExport_(dashboardKey, 'print_html', 'Success', options, '', '', '');
    return html;
  }

  function createPdfStub(dashboardKey, options) {
    REOS.Security.requirePermission('dashboard:view');
    ensureSheets();
    options = options || {};
    const title = getDashboardTitle_(dashboardKey);
    const fileName = 'REOS_' + sanitizeFileName_(title) + '_' + Utilities.formatDate(new Date(), REOS.CONFIG.APP.TIME_ZONE, 'yyyyMMdd_HHmmss') + '.html';
    const html = buildPrintHtml(dashboardKey, options);
    const blob = Utilities.newBlob(html, 'text/html', fileName);
    const file = DriveApp.createFile(blob);
    const row = logExport_(dashboardKey, 'pdf_stub', 'Success', options, fileName, file.getUrl(), 'PDF-ready HTML saved to Drive. Use browser print or Drive conversion for PDF in this release.');
    return { ok: true, exportId: row[EXPORT_ID_FIELD], fileName: fileName, fileUrl: file.getUrl(), message: 'PDF-ready HTML export created.' };
  }

  function exportCsv(dashboardKey, options) {
    REOS.Security.requirePermission('dashboard:view');
    ensureSheets();
    const csv = REOS.DashboardService.exportCsv(dashboardKey || 'executive', options || {});
    logExport_(dashboardKey, 'csv', 'Success', options || {}, '', '', 'CSV generated in UI response.');
    return csv;
  }

  function getAvailableDashboards_() {
    return DASHBOARDS.filter(function (dashboard) {
      try {
        if (dashboard.key === 'automation') REOS.Security.requireAdmin();
        else REOS.Security.requirePermission('dashboard:view');
        return true;
      } catch (error) {
        return false;
      }
    });
  }

  function renderPrintHtml_(dashboard, options) {
    const kpis = dashboard.kpis || [];
    const charts = dashboard.charts || [];
    const tables = dashboard.tables || [];
    const alerts = dashboard.alerts || [];
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc_(dashboard.title || 'REOS Dashboard') + '</title>' +
      '<style>body{font-family:Arial,sans-serif;color:#111827;margin:28px;}h1{margin-bottom:4px}.muted{color:#6b7280}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.kpi{border:1px solid #d1d5db;border-radius:10px;padding:12px}.kpi span{display:block;color:#6b7280;font-size:12px}.kpi strong{font-size:24px}.card{border:1px solid #d1d5db;border-radius:10px;padding:14px;margin:14px 0;page-break-inside:avoid}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #e5e7eb;padding:7px;text-align:left}th{background:#f9fafb}.bar{height:10px;background:#111827;border-radius:999px}.track{background:#e5e7eb;border-radius:999px}.alert{border-left:4px solid #f59e0b;padding:8px;background:#fffbeb;margin:6px 0}@media print{button{display:none}.card{box-shadow:none}}</style>' +
      '</head><body><button onclick="window.print()">Print / Save PDF</button><h1>' + esc_(dashboard.title || 'REOS Dashboard') + '</h1><div class="muted">Generated ' + esc_(dashboard.generatedAt || REOS.nowIso_()) + '</div>' +
      '<section class="kpis">' + kpis.map(function (k) { return '<div class="kpi"><span>' + esc_(k.label) + '</span><strong>' + esc_(k.value) + '</strong></div>'; }).join('') + '</section>' +
      (alerts.length ? '<section class="card"><h2>Alerts</h2>' + alerts.map(function (a) { return '<div class="alert"><strong>' + esc_(a.level || 'Alert') + '</strong>: ' + esc_(a.message || '') + '</div>'; }).join('') + '</section>' : '') +
      charts.map(renderChart_).join('') + tables.map(renderTable_).join('') +
      '<section class="card"><h2>Export Metadata</h2><table><tr><th>Dashboard</th><td>' + esc_(dashboard.key || '') + '</td></tr><tr><th>Filters</th><td>' + esc_(REOS.toJson_(dashboard.filters || options || {})) + '</td></tr></table></section></body></html>';
  }

  function renderChart_(chart) {
    const rows = chart.rows || [];
    const max = rows.reduce(function (m, row) { return Math.max(m, Number(row.value || row.count || 0)); }, 1);
    return '<section class="card"><h2>' + esc_(chart.title || 'Chart') + '</h2>' + rows.map(function (row) {
      const value = Number(row.value || row.count || 0);
      const width = Math.max(2, Math.round((value / max) * 100));
      return '<div style="display:grid;grid-template-columns:160px 1fr 45px;gap:8px;align-items:center;margin:6px 0"><span>' + esc_(row.label || row.stage || row.metric || row.status || '') + '</span><div class="track"><div class="bar" style="width:' + width + '%"></div></div><strong>' + value + '</strong></div>';
    }).join('') + '</section>';
  }

  function renderTable_(table) {
    const columns = table.columns || [];
    const rows = table.rows || [];
    return '<section class="card"><h2>' + esc_(table.title || 'Table') + '</h2><table><tr>' + columns.map(function (c) { return '<th>' + esc_(c) + '</th>'; }).join('') + '</tr>' +
      (rows.length ? rows.map(function (row) { return '<tr>' + columns.map(function (c) { return '<td>' + esc_(row[c] || '') + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + columns.length + '">No records found.</td></tr>') + '</table></section>';
  }

  function logExport_(dashboardKey, format, status, options, fileName, fileUrl, message) {
    return REOS.Database.insert(EXPORTS_SHEET, {
      'Dashboard Key': dashboardKey || 'executive',
      Format: format,
      Status: status,
      'File Name': fileName || '',
      'File URL': fileUrl || '',
      'Requested By': Session.getActiveUser().getEmail() || '',
      'Options JSON': REOS.toJson_(options || {}),
      Error: message || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: EXPORT_ID_FIELD, idPrefix: 'DEXP' });
  }

  function getDashboardTitle_(key) {
    const found = DASHBOARDS.filter(function (d) { return d.key === key; })[0];
    return found ? found.title : 'Dashboard';
  }

  function sanitizeFileName_(value) { return String(value || 'Dashboard').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, ''); }
  function esc_(value) { return String(value === null || value === undefined ? '' : value).replace(/[&<>'"]/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]; }); }

  return {
    ensureSheets: ensureSheets,
    getExportCenter: getExportCenter,
    getRecentExports: getRecentExports,
    buildPrintHtml: buildPrintHtml,
    createPdfStub: createPdfStub,
    exportCsv: exportCsv
  };
})();

function reosDashboardExportEnsureSheets() { return REOS.DashboardExport.ensureSheets(); }
function reosDashboardExportCenter() { return REOS.DashboardExport.getExportCenter(); }
function reosDashboardExportRecent(options) { return REOS.DashboardExport.getRecentExports(options || {}); }
function reosDashboardExportPrintHtml(dashboardKey, options) { return REOS.DashboardExport.buildPrintHtml(dashboardKey, options || {}); }
function reosDashboardExportPdfStub(dashboardKey, options) { return REOS.DashboardExport.createPdfStub(dashboardKey, options || {}); }
function reosDashboardExportCsv(dashboardKey, options) { return REOS.DashboardExport.exportCsv(dashboardKey, options || {}); }
function showDashboardExport() {
  REOS.Security.requirePermission('dashboard:view');
  const html = HtmlService.createHtmlOutputFromFile('DashboardExportUI').setTitle('REOS Dashboard Export').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Dashboard Export');
}

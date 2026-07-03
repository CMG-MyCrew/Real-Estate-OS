/** REOS Enterprise v3.0 - Usage Analytics Administration */
var REOS = REOS || {};

REOS.UsageAnalytics = (function () {
  const SHEET = 'USAGE_ANALYTICS';
  const HEADERS = ['Usage ID','Date','Tenant ID','Metric','Value','Module','Details JSON','Created At','Updated At'];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function track(metric, value, module, details) {
    ensureSheet();
    return REOS.Database.insert(SHEET, {
      Date: new Date(),
      'Tenant ID': REOS.Tenants && REOS.Tenants.getCurrentTenantId ? REOS.Tenants.getCurrentTenantId() : '',
      Metric: metric,
      Value: Number(value || 1),
      Module: module || '',
      'Details JSON': JSON.stringify(details || {})
    }, { idField: 'Usage ID', idPrefix: 'UA' });
  }

  function snapshot() {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    const metrics = [];
    push_(metrics, 'Tenants', safeCount_(function () { return REOS.Tenants.listTenants(); }), 'SaaS');
    push_(metrics, 'API Requests', safeCount_(function () { return REOS.APIPlatform.listRequests(500); }), 'API');
    push_(metrics, 'Documents', safeCount_(function () { return REOS.Documents.search(''); }), 'Documents');
    push_(metrics, 'Tasks', safeCount_(function () { return REOS.Tasks.listActive(); }), 'Tasks');
    push_(metrics, 'Transactions', safeCount_(function () { return REOS.Transactions.listActive(); }), 'Transactions');
    push_(metrics, 'AI Requests', safeCount_(function () { return REOS.Database.getAll('AI_LOG'); }), 'AI');
    metrics.forEach(function (m) { track(m.metric, m.value, m.module, { snapshot: true }); });
    return metrics;
  }

  function dashboard() {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    const rows = REOS.Database.getAll(SHEET).slice(-500);
    const totals = {};
    rows.forEach(function (r) { totals[r.Metric] = (totals[r.Metric] || 0) + Number(r.Value || 0); });
    return { totals: totals, recent: rows.slice(-50).reverse(), generatedAt: new Date() };
  }

  function push_(arr, metric, value, module) { arr.push({ metric: metric, value: value, module: module }); }
  function safeCount_(fn) { try { return (fn() || []).length; } catch (error) { return 0; } }

  return { ensureSheet: ensureSheet, track: track, snapshot: snapshot, dashboard: dashboard };
})();

function usageTrack(metric, value, module, details) { return REOS.UsageAnalytics.track(metric, value, module, details || {}); }
function usageSnapshot() { return REOS.UsageAnalytics.snapshot(); }
function usageDashboard() { return REOS.UsageAnalytics.dashboard(); }

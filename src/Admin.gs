/**
 * REOS Enterprise v3.0 - Enterprise Administration Hub
 *
 * Global admin console aggregation for system status, tenants, users,
 * licensing, usage, diagnostics, environments, feature flags, and security.
 */

var REOS = REOS || {};

REOS.Admin = (function () {
  function dashboard() {
    REOS.Security.requirePermission('reports:read');
    return {
      generatedAt: new Date(),
      system: systemOverview_(),
      tenants: safe_(function () { return REOS.SaaSAdmin.dashboard(); }) || {},
      security: safe_(function () { return REOS.SecurityHardening.dashboard(); }) || {},
      production: safe_(function () { return REOS.Deployment.readinessReport(); }) || {},
      api: apiOverview_(),
      usage: safe_(function () { return REOS.UsageAnalytics.dashboard(); }) || {},
      flags: safe_(function () { return REOS.FeatureFlags.listFlags(); }) || [],
      licenses: safe_(function () { return REOS.Licensing.dashboard(); }) || {},
      diagnostics: safe_(function () { return REOS.SystemDiagnostics.runDiagnostics(); }) || {}
    };
  }

  function systemOverview_() {
    return {
      app: 'REOS Enterprise',
      version: '3.0',
      user: REOS.Security.getCurrentUserEmail(),
      spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
      timezone: Session.getScriptTimeZone(),
      tenantId: REOS.Tenants && REOS.Tenants.getCurrentTenantId ? REOS.Tenants.getCurrentTenantId() : '',
      health: safe_(function () { return REOS.Monitoring.runHealthSuite().overallStatus; }) || 'Unknown'
    };
  }

  function apiOverview_() {
    const requests = safe_(function () { return REOS.APIPlatform.listRequests(100); }) || [];
    return {
      requestCount: requests.length,
      errorCount: requests.filter(function (r) { return String(r.Status || '') === 'Error'; }).length,
      recentRequests: requests.slice(0, 10)
    };
  }

  function globalSearch(query) {
    REOS.Security.requirePermission('reports:read');
    query = String(query || '').toLowerCase();
    if (!query) return [];
    const results = [];
    pushResults_(results, 'Tenants', safe_(function () { return REOS.Tenants.listTenants(); }) || [], ['Tenant ID', 'Tenant Name', 'Owner Email'], query);
    pushResults_(results, 'Licenses', safe_(function () { return REOS.Licensing.listLicenses(); }) || [], ['License ID', 'Customer', 'Edition'], query);
    pushResults_(results, 'Feature Flags', safe_(function () { return REOS.FeatureFlags.listFlags(); }) || [], ['Flag ID', 'Name', 'Description'], query);
    pushResults_(results, 'API Requests', safe_(function () { return REOS.APIPlatform.listRequests(50); }) || [], ['API Request ID', 'Path', 'Message'], query);
    return results.slice(0, 50);
  }

  function pushResults_(out, type, rows, fields, query) {
    (rows || []).forEach(function (row) {
      const haystack = fields.map(function (f) { return row[f] || ''; }).join(' ').toLowerCase();
      if (haystack.indexOf(query) !== -1) out.push({ type: type, id: row[fields[0]], title: row[fields[1]] || row[fields[0]], record: row });
    });
  }

  function safe_(fn) {
    try { return fn(); } catch (error) { return { error: error.message }; }
  }

  return { dashboard: dashboard, globalSearch: globalSearch };
})();

function adminDashboard() { return REOS.Admin.dashboard(); }
function adminGlobalSearch(query) { return REOS.Admin.globalSearch(query); }

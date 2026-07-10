/**
 * REOS Enterprise v3.0 - Dashboard Hub
 *
 * Sprint 8.12 centralized enterprise workspace for dashboards, modules,
 * quick actions, system health, recent activity, and permission-aware navigation.
 */

var REOS = REOS || {};

REOS.DashboardHub = (function () {
  const DASHBOARDS = [
    { key: 'executive', title: 'Executive Dashboard', description: 'Enterprise KPI rollup and health panels.', permission: 'dashboard:view', functionName: 'showExecutiveDashboard', category: 'Dashboards', icon: '📊' },
    { key: 'crm', title: 'CRM Dashboard', description: 'Clients, leads, tasks, activities, and follow-up queue.', permission: 'crm:read', functionName: 'showCRMDashboard', category: 'Dashboards', icon: '👥' },
    { key: 'acquisitions', title: 'Acquisitions Dashboard', description: 'Distressed leads, pipeline, follow-ups, and AI opportunity queue.', permission: 'leads:read', functionName: 'showAcquisitionsDashboard', category: 'Dashboards', icon: '🏚️' },
    { key: 'properties', title: 'Property Dashboard', description: 'Occupancy, maintenance, units, inspections, and operations.', permission: 'properties:read', functionName: 'showPropertyDashboard', category: 'Dashboards', icon: '🏠' },
    { key: 'vendors', title: 'Vendor Dashboard', description: 'Vendor registry, work orders, categories, and service workload.', permission: 'vendors:read', functionName: 'showVendorDashboard', category: 'Dashboards', icon: '🛠️' },
    { key: 'automation', title: 'Automation Dashboard', description: 'Trigger health, rule execution, and scheduler controls.', adminOnly: true, functionName: 'showAutomationDashboard', category: 'Admin', icon: '⚙️' },
    { key: 'ai', title: 'AI Command Center', description: 'AI usage, request logs, provider status, and AI queue.', permission: 'ai:use', functionName: 'showAIDashboard', category: 'AI', icon: '🤖' },
    { key: 'external', title: 'External Integrations', description: 'Provider registry, dry-run API tests, and request logs.', adminOnly: true, functionName: 'showExternalIntegrations', category: 'Admin', icon: '🔌' },
    { key: 'templates', title: 'Automation Templates', description: 'Reusable automation blueprints and rule creation.', adminOnly: true, functionName: 'showAutomationTemplates', category: 'Admin', icon: '📋' },
    { key: 'admin', title: 'Admin Center', description: 'Users, roles, permissions, and security audit reports.', adminOnly: true, functionName: 'showAdmin', category: 'Admin', icon: '🔐' }
  ];

  const QUICK_ACTIONS = [
    { key: 'newLead', title: 'New Acquisition Lead', route: 'acquisitions.open', permission: 'leads:write', description: 'Open acquisitions to create a new distressed/off-market lead.' },
    { key: 'newClient', title: 'New CRM Client', route: 'crm.open', permission: 'crm:write', description: 'Open CRM to create a new client or lead.' },
    { key: 'newProperty', title: 'New Property', route: 'properties.open', permission: 'properties:write', description: 'Open property operations to create a property asset.' },
    { key: 'newVendor', title: 'New Vendor', route: 'vendors.open', permission: 'vendors:write', description: 'Open vendor management to add a vendor.' },
    { key: 'newWorkOrder', title: 'New Work Order', route: 'vendors.open', permission: 'workorders:write', description: 'Open vendor work orders.' },
    { key: 'automationRule', title: 'New Automation Rule', adminOnly: true, functionName: 'showAutomationTemplates', description: 'Create a rule from an automation template.' },
    { key: 'externalTest', title: 'External API Dry Run', adminOnly: true, functionName: 'showExternalIntegrations', description: 'Run provider dry-run tests.' },
    { key: 'aiAnalysis', title: 'AI Lead Analysis', route: 'ai.open', permission: 'ai:use', functionName: 'showAI', description: 'Open AI workspace for lead qualification.' }
  ];

  function getHub() {
    const user = safeCall_(function () { return REOS.Security.getCurrentUser(); }, {});
    const dashboards = DASHBOARDS.filter(canAccess_);
    const quickActions = QUICK_ACTIONS.filter(canAccess_);
    const overview = safeCall_(function () { return REOS.Dashboard.getOverview(); }, { kpis: {}, charts: {} });
    const health = safeCall_(function () { return REOS.healthCheck_(); }, { ok: false, messages: ['Health check unavailable'] });
    const activity = getRecentActivity_();
    const notifications = buildNotifications_(overview.kpis || {}, health);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      user: user,
      dashboards: dashboards,
      quickActions: quickActions,
      kpis: overview.kpis || {},
      systemHealth: health,
      recentActivity: activity,
      notifications: notifications,
      favorites: dashboards.slice(0, 4)
    };
  }

  function openDashboard(key) {
    const dashboard = DASHBOARDS.filter(function (item) { return item.key === key; })[0];
    if (!dashboard) throw new Error('Unknown dashboard: ' + key);
    if (!canAccess_(dashboard)) throw new Error('Access denied for dashboard: ' + dashboard.title);
    return { ok: true, functionName: dashboard.functionName, key: key };
  }

  function runQuickAction(key) {
    const action = QUICK_ACTIONS.filter(function (item) { return item.key === key; })[0];
    if (!action) throw new Error('Unknown quick action: ' + key);
    if (!canAccess_(action)) throw new Error('Access denied for quick action: ' + action.title);
    if (action.route && REOS.Router && typeof REOS.Router.dispatch === 'function') {
      return REOS.Router.dispatch(action.route, {});
    }
    return { ok: true, functionName: action.functionName || '', key: key, message: 'Open UI action requested.' };
  }

  function search(query) {
    query = String(query || '').toLowerCase();
    if (!query) return [];
    const items = DASHBOARDS.concat(QUICK_ACTIONS).filter(canAccess_);
    return items.filter(function (item) {
      return String(item.title || '').toLowerCase().indexOf(query) !== -1 ||
        String(item.description || '').toLowerCase().indexOf(query) !== -1 ||
        String(item.category || '').toLowerCase().indexOf(query) !== -1;
    }).slice(0, 20);
  }

  function getRecentActivity_() {
    const rows = safeCall_(function () { return REOS.Database.getAll(REOS.CONFIG.SHEETS.SYSTEM_LOG); }, []);
    return rows.slice().sort(function (a, b) {
      return (new Date(b.Timestamp || b['Created At'] || 0).getTime() || 0) - (new Date(a.Timestamp || a['Created At'] || 0).getTime() || 0);
    }).slice(0, 10);
  }

  function buildNotifications_(kpis, health) {
    const notifications = [];
    if (!health.ok) notifications.push({ level: 'warning', title: 'Health Check Warning', message: 'One or more required sheets or services need review.' });
    if (Number(kpis.followUpsDue || 0) > 0) notifications.push({ level: 'info', title: 'Follow-ups Due', message: kpis.followUpsDue + ' acquisition follow-ups are due.' });
    if (Number(kpis.openWorkOrders || 0) > 0) notifications.push({ level: 'info', title: 'Open Work Orders', message: kpis.openWorkOrders + ' vendor work orders remain open.' });
    if (Number(kpis.openMaintenance || 0) > 0) notifications.push({ level: 'warning', title: 'Maintenance Backlog', message: kpis.openMaintenance + ' maintenance requests are open.' });
    return notifications;
  }

  function canAccess_(item) {
    try {
      if (item.adminOnly) {
        REOS.Security.requireAdmin();
        return true;
      }
      if (item.permission) {
        REOS.Security.requirePermission(item.permission);
        return true;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  function safeCall_(fn, fallback) {
    try { return fn(); } catch (error) { return fallback; }
  }

  return {
    getHub: getHub,
    openDashboard: openDashboard,
    runQuickAction: runQuickAction,
    search: search
  };
})();

function reosDashboardHubGet() { return REOS.DashboardHub.getHub(); }
function reosDashboardHubOpenDashboard(key) { return REOS.DashboardHub.openDashboard(key); }
function reosDashboardHubRunQuickAction(key) { return REOS.DashboardHub.runQuickAction(key); }
function reosDashboardHubSearch(query) { return REOS.DashboardHub.search(query); }
function showDashboardHub() {
  REOS.Security.requirePermission('dashboard:view');
  const html = HtmlService.createHtmlOutputFromFile('DashboardHubUI').setTitle('REOS Dashboard Hub').setWidth(1300).setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Dashboard Hub');
}

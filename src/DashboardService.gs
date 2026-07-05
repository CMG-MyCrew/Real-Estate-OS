/**
 * REOS Enterprise v3.0 - Dashboard Service Framework
 *
 * Sprint 8.1 foundation for reusable module dashboards.
 * Provides KPI builders, chart data helpers, date-range filtering,
 * dashboard caching, CSV export models, and permission-aware providers.
 */

var REOS = REOS || {};

REOS.DashboardService = (function () {
  const CACHE_PREFIX = 'REOS_DASHBOARD_';
  const DEFAULT_CACHE_SECONDS = 300;

  function getDashboard(moduleKey, options) {
    options = normalizeOptions_(options || {});
    const key = String(moduleKey || 'executive').toLowerCase();
    const cacheKey = CACHE_PREFIX + key + '_' + hash_(REOS.toJson_(options));

    if (options.useCache !== false) {
      const cached = getCached_(cacheKey);
      if (cached) return cached;
    }

    let dashboard;
    if (key === 'crm') dashboard = buildCRMDashboard_(options);
    else if (key === 'acquisitions') dashboard = buildAcquisitionsDashboard_(options);
    else if (key === 'properties') dashboard = buildPropertiesDashboard_(options);
    else if (key === 'vendors') dashboard = buildVendorsDashboard_(options);
    else if (key === 'automation') dashboard = buildAutomationDashboard_(options);
    else if (key === 'ai') dashboard = buildAIDashboard_(options);
    else dashboard = buildExecutiveDashboard_(options);

    if (options.useCache !== false) setCached_(cacheKey, dashboard, options.cacheSeconds || DEFAULT_CACHE_SECONDS);
    return dashboard;
  }

  function buildBaseDashboard_(key, title, options) {
    return {
      ok: true,
      key: key,
      title: title,
      generatedAt: REOS.nowIso_(),
      filters: {
        startDate: options.startDate || '',
        endDate: options.endDate || '',
        dateField: options.dateField || 'Created At'
      },
      kpis: [],
      charts: [],
      tables: [],
      alerts: [],
      exports: []
    };
  }

  function buildCRMDashboard_(options) {
    REOS.Security.requirePermission('crm:read');
    const dashboard = buildBaseDashboard_('crm', 'CRM Dashboard', options);
    const clients = filterByDate_(safeList_(function () { return REOS.CRM.listClients({ limit: 1000 }); }), options);
    const leads = filterByDate_(safeList_(function () { return REOS.Database.getAll(REOS.CONFIG.SHEETS.LEADS); }), options);
    const tasks = filterByDate_(safeList_(function () { return REOS.Database.getAll(REOS.CONFIG.SHEETS.TASKS); }), options);
    const activities = filterByDate_(safeList_(function () { return REOS.Database.getAll(REOS.CONFIG.SHEETS.ACTIVITIES); }), options);

    dashboard.kpis = [
      kpi_('Clients', clients.length),
      kpi_('Leads', leads.length),
      kpi_('Open Tasks', tasks.filter(function (t) { return String(t.Status || '').toLowerCase() !== 'completed'; }).length),
      kpi_('Activities', activities.length),
      kpi_('Active Clients', clients.filter(function (c) { return c.Active !== false; }).length)
    ];
    dashboard.charts = [
      chart_('lead_status', 'Lead Status', 'bar', objectToRows_(groupCount_(leads, 'Status'), 'label', 'value')),
      chart_('task_priority', 'Task Priority', 'bar', objectToRows_(groupCount_(tasks, 'Priority'), 'label', 'value')),
      chart_('activity_type', 'Activity Type', 'bar', objectToRows_(groupCount_(activities, 'Activity Type'), 'label', 'value'))
    ];
    dashboard.tables = [
      table_('recent_clients', 'Recent Clients', latest_(clients, 'Created At', 10), ['Client ID', 'First Name', 'Last Name', 'Email', 'Status']),
      table_('follow_up_queue', 'Follow-up Queue', latest_(tasks.filter(function (t) { return String(t.Status || '').toLowerCase() !== 'completed'; }), 'Due Date', 10), ['Task ID', 'Title', 'Related Type', 'Related ID', 'Priority', 'Due Date'])
    ];
    dashboard.exports = buildExports_(dashboard);
    return dashboard;
  }

  function buildAcquisitionsDashboard_(options) {
    REOS.Security.requirePermission('leads:read');
    const dashboard = buildBaseDashboard_('acquisitions', 'Acquisitions Dashboard', options);
    const leads = filterByDate_(safeList_(function () { return REOS.Acquisitions.listLeads({ limit: 1000 }); }), options);
    const hot = leads.filter(function (l) { return ['High', 'Critical'].indexOf(String(l.Priority || '')) !== -1; });
    const due = leads.filter(function (l) { return isDue_(l['Next Follow Up']); });

    dashboard.kpis = [kpi_('Leads', leads.length), kpi_('Hot Leads', hot.length), kpi_('Follow-ups Due', due.length), kpi_('Under Contract', countWhere_(leads, 'Status', 'Under Contract')), kpi_('Closed', countWhere_(leads, 'Status', 'Closed'))];
    dashboard.charts = [
      chart_('acquisition_pipeline', 'Acquisition Pipeline', 'funnel', objectToRows_(groupCount_(leads, 'Status'), 'label', 'value')),
      chart_('distress_indicators', 'Distress Indicators', 'bar', objectToRows_(groupCount_(leads, 'Distress Indicator'), 'label', 'value')),
      chart_('lead_priority', 'Lead Priority', 'bar', objectToRows_(groupCount_(leads, 'Priority'), 'label', 'value')),
      chart_('city_distribution', 'City Distribution', 'bar', objectToRows_(groupCount_(leads, 'City'), 'label', 'value'))
    ];
    dashboard.tables = [
      table_('hot_leads', 'Hot Leads', latest_(hot, 'Created At', 10), ['Lead ID', 'Property Address', 'Owner Name', 'Status', 'Priority', 'Next Follow Up']),
      table_('followups_due', 'Follow-ups Due', latest_(due, 'Next Follow Up', 10), ['Lead ID', 'Property Address', 'Owner Name', 'Priority', 'Next Follow Up'])
    ];
    dashboard.exports = buildExports_(dashboard);
    return dashboard;
  }

  function buildPropertiesDashboard_(options) {
    REOS.Security.requirePermission('properties:read');
    const dashboard = buildBaseDashboard_('properties', 'Property Operations Dashboard', options);
    const properties = filterByDate_(safeList_(function () { return REOS.Properties.listProperties({ limit: 1000 }); }), options);
    const maintenance = filterByDate_(safeList_(function () { return REOS.Properties.listMaintenance({ limit: 1000 }); }), options);
    const units = safeList_(function () { return REOS.Properties.listUnits(); });

    dashboard.kpis = [
      kpi_('Properties', properties.length),
      kpi_('Vacant', countWhere_(properties, 'Occupancy Status', 'Vacant')),
      kpi_('Occupied', countWhere_(properties, 'Occupancy Status', 'Occupied')),
      kpi_('Units', units.length),
      kpi_('Open Maintenance', maintenance.filter(function (m) { return ['Completed', 'Cancelled'].indexOf(String(m.Status || '')) === -1; }).length)
    ];
    dashboard.charts = [
      chart_('occupancy', 'Occupancy', 'bar', objectToRows_(groupCount_(properties, 'Occupancy Status'), 'label', 'value')),
      chart_('property_status', 'Property Status', 'bar', objectToRows_(groupCount_(properties, 'Status'), 'label', 'value')),
      chart_('maintenance_status', 'Maintenance Status', 'bar', objectToRows_(groupCount_(maintenance, 'Status'), 'label', 'value')),
      chart_('property_type', 'Property Type', 'bar', objectToRows_(groupCount_(properties, 'Property Type'), 'label', 'value'))
    ];
    dashboard.tables = [
      table_('recent_properties', 'Recent Properties', latest_(properties, 'Created At', 10), ['Property ID', 'Property Name', 'Address', 'Status', 'Occupancy Status']),
      table_('maintenance_backlog', 'Maintenance Backlog', latest_(maintenance, 'Due Date', 10), ['Maintenance ID', 'Property ID', 'Title', 'Priority', 'Status', 'Due Date'])
    ];
    dashboard.exports = buildExports_(dashboard);
    return dashboard;
  }

  function buildVendorsDashboard_(options) {
    REOS.Security.requirePermission('vendors:read');
    const dashboard = buildBaseDashboard_('vendors', 'Vendor Operations Dashboard', options);
    const vendors = filterByDate_(safeList_(function () { return REOS.Vendors.listVendors({ limit: 1000 }); }), options);
    const workOrders = filterByDate_(safeList_(function () { return REOS.Vendors.listWorkOrders({ limit: 1000 }); }), options);

    dashboard.kpis = [
      kpi_('Vendors', vendors.length),
      kpi_('Active Vendors', vendors.filter(function (v) { return v.Active !== false; }).length),
      kpi_('Work Orders', workOrders.length),
      kpi_('Open Work Orders', workOrders.filter(function (w) { return ['Completed', 'Cancelled'].indexOf(String(w.Status || '')) === -1; }).length),
      kpi_('Completed', countWhere_(workOrders, 'Status', 'Completed'))
    ];
    dashboard.charts = [
      chart_('vendor_category', 'Vendor Service Category', 'bar', objectToRows_(groupCount_(vendors, 'Service Category'), 'label', 'value')),
      chart_('work_order_status', 'Work Order Status', 'bar', objectToRows_(groupCount_(workOrders, 'Status'), 'label', 'value')),
      chart_('work_order_priority', 'Work Order Priority', 'bar', objectToRows_(groupCount_(workOrders, 'Priority'), 'label', 'value'))
    ];
    dashboard.tables = [
      table_('recent_vendors', 'Recent Vendors', latest_(vendors, 'Created At', 10), ['Vendor ID', 'Company', 'Service Category', 'Status', 'Phone']),
      table_('active_work_orders', 'Active Work Orders', latest_(workOrders, 'Due Date', 10), ['Work Order ID', 'Vendor ID', 'Property Address', 'Priority', 'Status', 'Due Date'])
    ];
    dashboard.exports = buildExports_(dashboard);
    return dashboard;
  }

  function buildAutomationDashboard_(options) {
    REOS.Security.requireAdmin();
    const dashboard = buildBaseDashboard_('automation', 'Automation Dashboard', options);
    const admin = REOS.Automation.getAdminDashboard();
    const runs = filterByDate_(admin.recentRuns || [], Object.assign({}, options, { dateField: 'Started At' }));
    dashboard.kpis = [kpi_('Jobs', admin.kpis.jobs), kpi_('Triggers', admin.kpis.installedTriggers), kpi_('Rules', admin.kpis.rules), kpi_('Active Rules', admin.kpis.activeRules), kpi_('Failed Runs', admin.kpis.failedRuns)];
    dashboard.charts = [chart_('run_status', 'Run Status', 'bar', objectToRows_(groupCount_(runs, 'Status'), 'label', 'value')), chart_('rules_by_module', 'Rules by Module', 'bar', objectToRows_(groupCount_(admin.rules || [], 'Module'), 'label', 'value'))];
    dashboard.tables = [table_('recent_runs', 'Recent Runs', runs, ['Run ID', 'Rule ID', 'Status', 'Message', 'Started At']), table_('rules', 'Rules', admin.rules || [], ['Rule ID', 'Name', 'Event', 'Module', 'Action', 'Active'])];
    dashboard.exports = buildExports_(dashboard);
    return dashboard;
  }

  function buildAIDashboard_(options) {
    REOS.Security.requirePermission('ai:use');
    const dashboard = buildBaseDashboard_('ai', 'AI Command Center', options);
    const logs = filterByDate_(safeList_(function () { return REOS.AI.getRequestLogs ? REOS.AI.getRequestLogs({ limit: 1000 }) : []; }), Object.assign({}, options, { dateField: 'Started At' }));
    const totalTokens = logs.reduce(function (sum, log) { return sum + Number(log['Total Tokens'] || 0); }, 0);
    const failed = logs.filter(function (log) { return String(log.Status || '').toLowerCase() === 'error'; });
    dashboard.kpis = [kpi_('AI Requests', logs.length), kpi_('Failures', failed.length), kpi_('Total Tokens', totalTokens), kpi_('Lead Qualifications', countWhere_(logs, 'Request Type', 'leadQualification')), kpi_('Reports/Docs', countWhere_(logs, 'Request Type', 'report'))];
    dashboard.charts = [chart_('ai_request_type', 'Request Type', 'bar', objectToRows_(groupCount_(logs, 'Request Type'), 'label', 'value')), chart_('ai_provider', 'Provider', 'bar', objectToRows_(groupCount_(logs, 'Provider'), 'label', 'value')), chart_('ai_status', 'Status', 'bar', objectToRows_(groupCount_(logs, 'Status'), 'label', 'value'))];
    dashboard.tables = [table_('recent_ai_logs', 'Recent AI Requests', latest_(logs, 'Started At', 20), ['AI Request ID', 'Request Type', 'Provider', 'Status', 'Total Tokens', 'Started At'])];
    dashboard.exports = buildExports_(dashboard);
    return dashboard;
  }

  function buildExecutiveDashboard_(options) {
    const dashboard = buildBaseDashboard_('executive', 'Executive Dashboard', options);
    const overview = safeCall_(function () { return REOS.Dashboard.getOverview(); }, { kpis: {}, charts: {} });
    dashboard.kpis = Object.keys(overview.kpis || {}).map(function (key) { return kpi_(labelize_(key), overview.kpis[key]); });
    dashboard.charts = Object.keys(overview.charts || {}).map(function (key) { return chart_(key, labelize_(key), key.indexOf('Pipeline') !== -1 ? 'funnel' : 'bar', overview.charts[key]); });
    dashboard.tables = [];
    dashboard.alerts = buildAlerts_(overview.kpis || {});
    dashboard.exports = buildExports_(dashboard);
    return dashboard;
  }

  function normalizeOptions_(options) {
    options = options || {};
    return {
      startDate: options.startDate || '',
      endDate: options.endDate || '',
      dateField: options.dateField || 'Created At',
      useCache: options.useCache !== false,
      cacheSeconds: Number(options.cacheSeconds || DEFAULT_CACHE_SECONDS)
    };
  }

  function filterByDate_(records, options) {
    if (!options.startDate && !options.endDate) return records || [];
    const start = options.startDate ? new Date(options.startDate) : null;
    const end = options.endDate ? new Date(options.endDate) : null;
    const field = options.dateField || 'Created At';
    return (records || []).filter(function (record) {
      const value = record[field] ? new Date(record[field]) : null;
      if (!value || isNaN(value.getTime())) return false;
      if (start && value < start) return false;
      if (end && value > end) return false;
      return true;
    });
  }

  function kpi_(label, value, options) { return Object.assign({ label: label, value: value || 0, format: 'number' }, options || {}); }
  function chart_(key, title, type, rows, options) { return Object.assign({ key: key, title: title, type: type, rows: rows || [] }, options || {}); }
  function table_(key, title, rows, columns) { return { key: key, title: title, rows: rows || [], columns: columns || [] }; }

  function buildExports_(dashboard) {
    return [{ type: 'csv', label: 'Export Dashboard CSV', functionName: 'reosDashboardServiceExportCsv', args: [dashboard.key] }];
  }

  function exportCsv(moduleKey, options) {
    const dashboard = getDashboard(moduleKey, Object.assign({}, options || {}, { useCache: false }));
    const lines = [];
    lines.push('Dashboard,' + csvEscape_(dashboard.title));
    lines.push('Generated At,' + csvEscape_(dashboard.generatedAt));
    lines.push('');
    lines.push('KPIs');
    dashboard.kpis.forEach(function (kpi) { lines.push(csvEscape_(kpi.label) + ',' + csvEscape_(kpi.value)); });
    dashboard.tables.forEach(function (table) {
      lines.push('');
      lines.push(table.title);
      lines.push(table.columns.map(csvEscape_).join(','));
      table.rows.forEach(function (row) { lines.push(table.columns.map(function (column) { return csvEscape_(row[column]); }).join(',')); });
    });
    return lines.join('\n');
  }

  function buildAlerts_(kpis) {
    const alerts = [];
    if (Number(kpis.overdueWorkOrders || 0) > 0) alerts.push({ level: 'warning', message: kpis.overdueWorkOrders + ' overdue work orders need review.' });
    if (Number(kpis.overdueMaintenance || 0) > 0) alerts.push({ level: 'warning', message: kpis.overdueMaintenance + ' overdue maintenance items need review.' });
    if (Number(kpis.followUpsDue || 0) > 0) alerts.push({ level: 'info', message: kpis.followUpsDue + ' acquisition follow-ups are due.' });
    return alerts;
  }

  function groupCount_(records, field) {
    return (records || []).reduce(function (map, record) {
      const key = String(record[field] || 'Unknown');
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
  }

  function objectToRows_(map, labelKey, valueKey) {
    return Object.keys(map || {}).map(function (key) {
      const row = {};
      row[labelKey] = key;
      row[valueKey] = Number(map[key] || 0);
      return row;
    }).filter(function (row) { return row[valueKey] > 0; });
  }

  function latest_(records, dateField, limit) {
    return (records || []).slice().sort(function (a, b) {
      return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0);
    }).slice(0, limit || 10);
  }

  function countWhere_(records, field, value) {
    return (records || []).filter(function (record) { return String(record[field] || '') === String(value); }).length;
  }

  function isDue_(value) {
    if (!value) return false;
    const date = new Date(value);
    if (isNaN(date.getTime())) return false;
    const today = new Date();
    return date <= today;
  }

  function getCached_(key) {
    try {
      const raw = CacheService.getScriptCache().get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  function setCached_(key, value, seconds) {
    try { CacheService.getScriptCache().put(key, JSON.stringify(value), seconds || DEFAULT_CACHE_SECONDS); } catch (error) {}
  }

  function hash_(value) {
    let hash = 0;
    value = String(value || '');
    for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash) + value.charCodeAt(i) | 0;
    return Math.abs(hash).toString(36);
  }

  function labelize_(value) { return String(value || '').replace(/([A-Z])/g, ' $1').replace(/^./, function (s) { return s.toUpperCase(); }); }
  function csvEscape_(value) { value = value === null || value === undefined ? '' : String(value); return '"' + value.replace(/"/g, '""') + '"'; }
  function safeList_(fn) { try { const value = fn(); return Array.isArray(value) ? value : []; } catch (error) { REOS.Logger.warn('DashboardService list failed', { error: error.message }); return []; } }
  function safeCall_(fn, fallback) { try { return fn(); } catch (error) { REOS.Logger.warn('DashboardService call failed', { error: error.message }); return fallback; } }

  return {
    getDashboard: getDashboard,
    exportCsv: exportCsv,
    buildCRMDashboard: buildCRMDashboard_,
    buildAcquisitionsDashboard: buildAcquisitionsDashboard_,
    buildPropertiesDashboard: buildPropertiesDashboard_,
    buildVendorsDashboard: buildVendorsDashboard_,
    buildAutomationDashboard: buildAutomationDashboard_,
    buildAIDashboard: buildAIDashboard_,
    buildExecutiveDashboard: buildExecutiveDashboard_
  };
})();

function reosDashboardServiceGet(moduleKey, options) { return REOS.DashboardService.getDashboard(moduleKey, options || {}); }
function reosDashboardServiceExportCsv(moduleKey, options) { return REOS.DashboardService.exportCsv(moduleKey, options || {}); }

/**
 * REOS Enterprise v3.0 - Dashboard Records Review + Visualizations
 *
 * Aggregates CRM, acquisition, vendor, property, work-order, maintenance,
 * and task records for the main command center with contextual drill-down actions.
 */

var REOS = REOS || {};

REOS.Dashboard = (function () {
  function getOverview() {
    const clients = safeList_(function () { return REOS.CRM.listClients({ limit: 500 }); });
    const acquisitionDashboard = safeCall_(function () { return REOS.Acquisitions.dashboard(); }, {});
    const acquisitionLeads = safeList_(function () { return REOS.Acquisitions.listLeads({ limit: 500 }); });
    const tasks = safeList_(function () { return REOS.Database.getAll(REOS.CONFIG.SHEETS.TASKS); });
    const vendorDashboard = safeCall_(function () { return REOS.Vendors ? REOS.Vendors.dashboard() : {}; }, {});
    const vendors = safeList_(function () { return REOS.Vendors ? REOS.Vendors.listVendors({ limit: 500 }) : []; });
    const workOrders = safeList_(function () { return REOS.Vendors ? REOS.Vendors.listWorkOrders({ limit: 500 }) : []; });
    const propertyDashboard = safeCall_(function () { return REOS.Properties ? REOS.Properties.dashboard() : {}; }, {});
    const properties = safeList_(function () { return REOS.Properties ? REOS.Properties.listProperties({ limit: 500 }) : []; });
    const maintenance = safeList_(function () { return REOS.Properties ? REOS.Properties.listMaintenance({ limit: 500 }) : []; });

    const openTasks = tasks.filter(function (task) {
      return task.Active !== false && String(task.Status || '').toLowerCase() !== 'completed';
    });

    const charts = buildCharts_({
      acquisitionDashboard: acquisitionDashboard,
      vendorDashboard: vendorDashboard,
      propertyDashboard: propertyDashboard,
      workOrders: workOrders,
      maintenance: maintenance,
      tasks: openTasks
    });

    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        clients: clients.length,
        acquisitionLeads: acquisitionLeads.length,
        hotAcquisitionLeads: acquisitionDashboard.hot || 0,
        followUpsDue: acquisitionDashboard.followUpsDue || 0,
        openTasks: openTasks.length,
        vendors: vendorDashboard.activeVendors || vendors.length,
        openWorkOrders: vendorDashboard.openWorkOrders || 0,
        overdueWorkOrders: vendorDashboard.overdueWorkOrders || 0,
        properties: propertyDashboard.properties || properties.length,
        vacantProperties: propertyDashboard.vacant || 0,
        openMaintenance: propertyDashboard.openMaintenance || 0,
        overdueMaintenance: propertyDashboard.overdueMaintenance || 0
      },
      crm: { recentClients: latest_(clients, 'Created At', 10), activeClients: clients.filter(function (client) { return client.Active !== false; }).length },
      acquisitions: { recentLeads: latest_(acquisitionLeads, 'Created At', 10), byStatus: acquisitionDashboard.byStatus || {}, byPriority: acquisitionDashboard.byPriority || {} },
      vendors: { recentVendors: latest_(vendors, 'Created At', 10), recentWorkOrders: latest_(workOrders, 'Created At', 10), workOrdersByStatus: vendorDashboard.workOrdersByStatus || {} },
      properties: { recentProperties: latest_(properties, 'Created At', 10), recentMaintenance: latest_(maintenance, 'Created At', 10), byStatus: propertyDashboard.byStatus || {}, byOccupancy: propertyDashboard.byOccupancy || {}, maintenanceByStatus: propertyDashboard.maintenanceByStatus || {} },
      tasks: { open: latest_(openTasks, 'Due Date', 10) },
      charts: charts
    };
  }

  function buildCharts_(data) {
    return {
      acquisitionPipeline: objectToChartRows_(data.acquisitionDashboard.byStatus || {}, 'stage', 'count'),
      acquisitionPriority: objectToChartRows_(data.acquisitionDashboard.byPriority || {}, 'priority', 'count'),
      workOrdersByStatus: objectToChartRows_(data.vendorDashboard.workOrdersByStatus || {}, 'status', 'count'),
      propertyOccupancy: objectToChartRows_(data.propertyDashboard.byOccupancy || {}, 'status', 'count'),
      maintenanceByStatus: objectToChartRows_(data.propertyDashboard.maintenanceByStatus || {}, 'status', 'count'),
      operatingSnapshot: [
        { metric: 'Open Tasks', count: data.tasks.length || 0 },
        { metric: 'Open Work Orders', count: data.vendorDashboard.openWorkOrders || 0 },
        { metric: 'Overdue Work Orders', count: data.vendorDashboard.overdueWorkOrders || 0 },
        { metric: 'Open Maintenance', count: data.propertyDashboard.openMaintenance || 0 },
        { metric: 'Overdue Maintenance', count: data.propertyDashboard.overdueMaintenance || 0 }
      ]
    };
  }

  function objectToChartRows_(map, labelKey, valueKey) {
    return Object.keys(map || {}).map(function (key) {
      const row = {};
      row[labelKey] = key;
      row[valueKey] = Number(map[key] || 0);
      return row;
    }).filter(function (row) { return row[valueKey] > 0; });
  }

  function searchRecords(query) {
    const q = String(query || '').trim();
    return {
      ok: true,
      query: q,
      clients: q && REOS.CRM ? REOS.CRM.searchClients(q) : [],
      acquisitionLeads: q && REOS.Acquisitions ? REOS.Acquisitions.searchLeads(q) : [],
      vendors: q && REOS.Vendors ? REOS.Vendors.searchVendors(q) : [],
      workOrders: q && REOS.Vendors ? REOS.Vendors.searchWorkOrders(q) : [],
      properties: q && REOS.Properties ? REOS.Properties.searchProperties(q) : [],
      maintenance: q && REOS.Properties ? REOS.Properties.searchMaintenance(q) : []
    };
  }

  function getRecord(recordType, recordId) {
    const type = String(recordType || '').toLowerCase();
    const id = String(recordId || '').trim();
    if (!id) throw new Error('Record ID is required.');

    let record = null;
    let activity = [];
    let related = {};

    if (type === 'client') {
      record = REOS.CRM.getClient(id);
      activity = getActivities_('Client', id);
    } else if (type === 'lead' || type === 'acquisition') {
      record = REOS.Acquisitions.getLead(id);
      activity = getActivities_('Lead', id);
    } else if (type === 'vendor') {
      record = REOS.Vendors.getVendor(id);
      activity = getActivities_('Vendor', id);
    } else if (type === 'workorder' || type === 'work_order') {
      record = REOS.Vendors.getWorkOrder(id);
      activity = getActivities_('Work Order', id);
    } else if (type === 'property') {
      record = REOS.Properties.getProperty(id);
      activity = getActivities_('Property', id);
      related = getPropertyRelated_(id);
    } else if (type === 'maintenance') {
      record = getMaintenance_(id);
      activity = getActivities_('Maintenance', id).concat(getActivities_('Property', record ? record['Property ID'] : ''));
      related = { property: record && record['Property ID'] ? REOS.Properties.getProperty(record['Property ID']) : null };
    } else if (type === 'task') {
      record = REOS.Database.findById(REOS.CONFIG.SHEETS.TASKS, 'Task ID', id);
      activity = getActivities_('Task', id);
    } else {
      throw new Error('Unsupported dashboard record type: ' + recordType);
    }

    if (!record) throw new Error('Record not found: ' + recordType + ' ' + recordId);

    return { ok: true, recordType: type, recordId: id, record: record, related: related, activity: latest_(activity, 'Created At', 20), actions: getAvailableActions_(type, record) };
  }

  function runRecordAction(recordType, recordId, action, payload) {
    const type = String(recordType || '').toLowerCase();
    const id = String(recordId || '').trim();
    const actionName = String(action || '').trim();
    payload = payload || {};
    if (!id || !actionName) throw new Error('Record ID and action are required.');

    let result;
    let detailType = type;
    let detailId = id;

    if ((type === 'lead' || type === 'acquisition') && actionName === 'moveStage') {
      result = REOS.Acquisitions.moveStage(id, payload.status, payload.notes || 'Updated from dashboard drill-down.');
    } else if (type === 'client' && actionName === 'archive') {
      result = REOS.CRM.archiveClient(id);
    } else if ((type === 'workorder' || type === 'work_order') && actionName === 'updateStatus') {
      result = REOS.Vendors.updateWorkOrderStatus(id, payload.status, payload.notes || 'Updated from dashboard drill-down.');
    } else if ((type === 'workorder' || type === 'work_order') && actionName === 'assignVendor') {
      result = REOS.Vendors.assignWorkOrder(id, payload.vendorId);
    } else if (type === 'vendor' && actionName === 'deactivate') {
      result = REOS.Vendors.deactivateVendor(id);
    } else if (type === 'property' && actionName === 'updatePropertyStatus') {
      result = REOS.Properties.updateProperty(id, { Status: payload.status, Notes: payload.notes || 'Status updated from dashboard.' });
    } else if (type === 'property' && actionName === 'updateOccupancy') {
      result = REOS.Properties.updateProperty(id, { 'Occupancy Status': payload.occupancyStatus, Notes: payload.notes || 'Occupancy updated from dashboard.' });
    } else if (type === 'property' && actionName === 'createUnit') {
      result = REOS.Properties.createUnit(Object.assign({ 'Property ID': id }, payload.unit || {}));
    } else if (type === 'property' && actionName === 'createInspection') {
      result = REOS.Properties.createInspection(Object.assign({ 'Property ID': id }, payload.inspection || {}));
    } else if (type === 'property' && actionName === 'createMaintenance') {
      result = REOS.Properties.createMaintenanceRequest(Object.assign({ 'Property ID': id }, payload.maintenance || {}));
    } else if (type === 'maintenance' && actionName === 'updateMaintenanceStatus') {
      result = REOS.Properties.updateMaintenanceStatus(id, payload.status, payload.notes || 'Updated from dashboard drill-down.');
    } else if (type === 'task' && actionName === 'complete') {
      REOS.Security.requirePermission('tasks:write');
      result = REOS.Database.update(REOS.CONFIG.SHEETS.TASKS, 'Task ID', id, { Status: 'Completed', 'Completed At': new Date(), Notes: payload.notes || 'Completed from dashboard drill-down.' });
    } else {
      throw new Error('Unsupported dashboard action: ' + type + '.' + actionName);
    }

    REOS.Logger.audit('Dashboard record action', { recordType: type, recordId: id, action: actionName });
    return { ok: true, action: actionName, result: result, detail: getRecord(detailType, detailId) };
  }

  function getPropertyRelated_(propertyId) {
    return {
      units: safeList_(function () { return REOS.Properties.listUnits(propertyId); }),
      inspections: safeList_(function () { return REOS.Properties.listInspections({ propertyId: propertyId, limit: 25 }); }),
      maintenance: safeList_(function () { return REOS.Properties.listMaintenance({ propertyId: propertyId, limit: 25 }); })
    };
  }

  function getMaintenance_(maintenanceId) {
    REOS.Security.requirePermission('maintenance:read');
    return REOS.Database.findById('MAINTENANCE_REQUESTS', 'Maintenance ID', maintenanceId);
  }

  function getActivities_(relatedType, relatedId) {
    return safeList_(function () {
      if (!relatedId) return [];
      return REOS.Database.getAll(REOS.CONFIG.SHEETS.ACTIVITIES).filter(function (activity) {
        return String(activity['Related Type'] || '') === String(relatedType || '') && String(activity['Related ID'] || '') === String(relatedId || '');
      });
    });
  }

  function getAvailableActions_(type, record) {
    if (type === 'client') return ['archive'];
    if (type === 'lead' || type === 'acquisition') return ['moveStage'];
    if (type === 'vendor') return ['deactivate'];
    if (type === 'workorder' || type === 'work_order') return ['updateStatus', 'assignVendor'];
    if (type === 'property') return ['updatePropertyStatus', 'updateOccupancy', 'createUnit', 'createInspection', 'createMaintenance'];
    if (type === 'maintenance') return ['updateMaintenanceStatus'];
    if (type === 'task' && String(record.Status || '') !== 'Completed') return ['complete'];
    return [];
  }

  function latest_(records, dateField, limit) {
    return (records || []).slice().sort(function (a, b) {
      const ad = new Date(a[dateField] || 0).getTime() || 0;
      const bd = new Date(b[dateField] || 0).getTime() || 0;
      return bd - ad;
    }).slice(0, limit || 10);
  }

  function safeList_(fn) {
    try { const value = fn(); return Array.isArray(value) ? value : []; }
    catch (error) { REOS.Logger.warn('Dashboard list failed', { error: error.message }); return []; }
  }

  function safeCall_(fn, fallback) {
    try { return fn(); }
    catch (error) { REOS.Logger.warn('Dashboard call failed', { error: error.message }); return fallback; }
  }

  return { getOverview: getOverview, searchRecords: searchRecords, getRecord: getRecord, runRecordAction: runRecordAction, getExecutiveDashboard: getOverview };
})();

function showDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Index').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Enterprise Dashboard');
}

function dashboardGetExecutive() { return REOS.Dashboard.getOverview(); }
function reosDashboardOverview() { return REOS.Dashboard.getOverview(); }
function reosDashboardSearch(query) { return REOS.Dashboard.searchRecords(query || ''); }
function reosDashboardGetRecord(recordType, recordId) { return REOS.Dashboard.getRecord(recordType, recordId); }
function reosDashboardRunRecordAction(recordType, recordId, action, payload) { return REOS.Dashboard.runRecordAction(recordType, recordId, action, payload || {}); }

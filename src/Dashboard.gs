/**
 * REOS Enterprise v3.0 - Dashboard Records Review
 *
 * Aggregates CRM, acquisition, vendor, work-order, and task records for the main command center.
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

    const openTasks = tasks.filter(function (task) {
      return task.Active !== false && String(task.Status || '').toLowerCase() !== 'completed';
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
        overdueWorkOrders: vendorDashboard.overdueWorkOrders || 0
      },
      crm: {
        recentClients: latest_(clients, 'Created At', 10),
        activeClients: clients.filter(function (client) { return client.Active !== false; }).length
      },
      acquisitions: {
        recentLeads: latest_(acquisitionLeads, 'Created At', 10),
        byStatus: acquisitionDashboard.byStatus || {},
        byPriority: acquisitionDashboard.byPriority || {}
      },
      vendors: {
        recentVendors: latest_(vendors, 'Created At', 10),
        recentWorkOrders: latest_(workOrders, 'Created At', 10),
        workOrdersByStatus: vendorDashboard.workOrdersByStatus || {}
      },
      tasks: {
        open: latest_(openTasks, 'Due Date', 10)
      }
    };
  }

  function searchRecords(query) {
    const q = String(query || '').trim();
    return {
      ok: true,
      query: q,
      clients: q && REOS.CRM ? REOS.CRM.searchClients(q) : [],
      acquisitionLeads: q && REOS.Acquisitions ? REOS.Acquisitions.searchLeads(q) : [],
      vendors: q && REOS.Vendors ? REOS.Vendors.searchVendors(q) : [],
      workOrders: q && REOS.Vendors ? REOS.Vendors.searchWorkOrders(q) : []
    };
  }

  function getRecord(recordType, recordId) {
    const type = String(recordType || '').toLowerCase();
    const id = String(recordId || '').trim();
    if (!id) throw new Error('Record ID is required.');

    let record = null;
    let activity = [];

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
    } else if (type === 'task') {
      record = REOS.Database.findById(REOS.CONFIG.SHEETS.TASKS, 'Task ID', id);
      activity = getActivities_('Task', id);
    } else {
      throw new Error('Unsupported dashboard record type: ' + recordType);
    }

    if (!record) throw new Error('Record not found: ' + recordType + ' ' + recordId);

    return {
      ok: true,
      recordType: type,
      recordId: id,
      record: record,
      activity: latest_(activity, 'Created At', 20),
      actions: getAvailableActions_(type, record)
    };
  }

  function runRecordAction(recordType, recordId, action, payload) {
    const type = String(recordType || '').toLowerCase();
    const id = String(recordId || '').trim();
    const actionName = String(action || '').trim();
    payload = payload || {};

    if (!id || !actionName) throw new Error('Record ID and action are required.');

    let result;
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
    } else if (type === 'task' && actionName === 'complete') {
      REOS.Security.requirePermission('tasks:write');
      result = REOS.Database.update(REOS.CONFIG.SHEETS.TASKS, 'Task ID', id, {
        Status: 'Completed',
        'Completed At': new Date(),
        Notes: payload.notes || 'Completed from dashboard drill-down.'
      });
    } else {
      throw new Error('Unsupported dashboard action: ' + type + '.' + actionName);
    }

    REOS.Logger.audit('Dashboard record action', { recordType: type, recordId: id, action: actionName });
    return {
      ok: true,
      action: actionName,
      result: result,
      detail: getRecord(type, id)
    };
  }

  function getActivities_(relatedType, relatedId) {
    return safeList_(function () {
      return REOS.Database.getAll(REOS.CONFIG.SHEETS.ACTIVITIES).filter(function (activity) {
        return String(activity['Related Type'] || '') === String(relatedType || '') &&
          String(activity['Related ID'] || '') === String(relatedId || '');
      });
    });
  }

  function getAvailableActions_(type, record) {
    if (type === 'client') return ['archive'];
    if (type === 'lead' || type === 'acquisition') return ['moveStage'];
    if (type === 'vendor') return ['deactivate'];
    if (type === 'workorder' || type === 'work_order') return ['updateStatus', 'assignVendor'];
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
    try {
      const value = fn();
      return Array.isArray(value) ? value : [];
    } catch (error) {
      REOS.Logger.warn('Dashboard list failed', { error: error.message });
      return [];
    }
  }

  function safeCall_(fn, fallback) {
    try {
      return fn();
    } catch (error) {
      REOS.Logger.warn('Dashboard call failed', { error: error.message });
      return fallback;
    }
  }

  return {
    getOverview: getOverview,
    searchRecords: searchRecords,
    getRecord: getRecord,
    runRecordAction: runRecordAction,
    getExecutiveDashboard: getOverview
  };
})();

function showDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(1200)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Enterprise Dashboard');
}

function dashboardGetExecutive() { return REOS.Dashboard.getOverview(); }
function reosDashboardOverview() { return REOS.Dashboard.getOverview(); }
function reosDashboardSearch(query) { return REOS.Dashboard.searchRecords(query || ''); }
function reosDashboardGetRecord(recordType, recordId) { return REOS.Dashboard.getRecord(recordType, recordId); }
function reosDashboardRunRecordAction(recordType, recordId, action, payload) { return REOS.Dashboard.runRecordAction(recordType, recordId, action, payload || {}); }

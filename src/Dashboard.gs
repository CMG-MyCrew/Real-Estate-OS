/**
 * REOS Enterprise v3.0 - Dashboard Records Review
 *
 * Aggregates CRM and acquisition records for the main command center.
 */

var REOS = REOS || {};

REOS.Dashboard = (function () {
  function getOverview() {
    const clients = safeList_(function () { return REOS.CRM.listClients({ limit: 500 }); });
    const acquisitionDashboard = safeCall_(function () { return REOS.Acquisitions.dashboard(); }, {});
    const acquisitionLeads = safeList_(function () { return REOS.Acquisitions.listLeads({ limit: 500 }); });
    const tasks = safeList_(function () { return REOS.Database.getAll(REOS.CONFIG.SHEETS.TASKS); });

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
        openTasks: openTasks.length
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
      acquisitionLeads: q && REOS.Acquisitions ? REOS.Acquisitions.searchLeads(q) : []
    };
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
    getExecutiveDashboard: getOverview
  };
})();

function showDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(1200)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Enterprise Dashboard');
}

function dashboardGetExecutive() {
  return REOS.Dashboard.getOverview();
}

function reosDashboardOverview() {
  return REOS.Dashboard.getOverview();
}

function reosDashboardSearch(query) {
  return REOS.Dashboard.searchRecords(query || '');
}

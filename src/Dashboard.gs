/**
 * REOS Enterprise v3.0 - Executive Dashboard Framework
 *
 * Aggregates operational KPIs across CRM, tasks, transactions,
 * investments, rentals, and finance.
 */

var REOS = REOS || {};

REOS.Dashboard = (function () {
  function getExecutiveDashboard() {
    REOS.Security.requirePermission('reports:read');

    return {
      generatedAt: new Date(),
      crm: safe_('crm', function () { return crmSummary_(); }),
      tasks: safe_('tasks', function () { return tasksSummary_(); }),
      transactions: safe_('transactions', function () { return REOS.Transactions.dashboard(); }),
      investments: safe_('investments', function () { return REOS.Investments.dashboard(); }),
      rentals: safe_('rentals', function () { return REOS.Rentals.dashboard(); }),
      finance: safe_('finance', function () { return REOS.Finance.dashboard(); }),
      commissions: safe_('commissions', function () { return REOS.Commissions.dashboard(); })
    };
  }

  function crmSummary_() {
    const contacts = REOS.CRM.listContacts ? REOS.CRM.listContacts() : [];
    const leads = REOS.CRM.listLeads ? REOS.CRM.listLeads() : [];
    const activeLeads = leads.filter(function (lead) {
      return lead.Active !== false && ['closed', 'lost', 'archived'].indexOf(String(lead.Status || '').toLowerCase()) === -1;
    });
    const hotLeads = activeLeads.filter(function (lead) {
      return String(lead.Priority || '').toLowerCase() === 'hot' || Number(lead['Lead Score'] || 0) >= 90;
    });
    return {
      contactsCount: contacts.length,
      leadsCount: leads.length,
      activeLeadsCount: activeLeads.length,
      hotLeadsCount: hotLeads.length,
      projectedCommission: sum_(activeLeads, 'Expected Commission')
    };
  }

  function tasksSummary_() {
    return {
      activeCount: REOS.Tasks.listActive().length,
      dueTodayCount: REOS.Tasks.dueToday().length,
      overdueCount: REOS.Tasks.overdue().length,
      upcomingCount: REOS.Tasks.upcoming(7).length
    };
  }

  function safe_(moduleName, fn) {
    try {
      return fn();
    } catch (error) {
      REOS.Logger.warn('Dashboard module failed', { module: moduleName, error: error.message });
      return { error: error.message };
    }
  }

  function sum_(records, field) {
    return (records || []).reduce(function (total, record) {
      return total + (Number(record[field] || 0) || 0);
    }, 0);
  }

  return {
    getExecutiveDashboard: getExecutiveDashboard
  };
})();

function showDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Dashboard')
    .setWidth(1100)
    .setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Executive Dashboard');
}

function dashboardGetExecutive() {
  return REOS.Dashboard.getExecutiveDashboard();
}

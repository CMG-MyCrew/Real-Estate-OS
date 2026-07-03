/**
 * REOS Enterprise v3.0 - Agent Portal Framework
 *
 * Internal agent command center aggregating pipeline, tasks, transactions,
 * commissions, rentals, documents, automation, and KPIs.
 */

var REOS = REOS || {};

REOS.AgentPortal = (function () {
  function getWorkspace() {
    const user = REOS.Security.getCurrentUser();
    return {
      generatedAt: new Date(),
      user: sanitizeUser_(user),
      kpis: getKpis_(),
      pipeline: getPipeline_(),
      tasks: getTaskCenter_(),
      transactions: getTransactions_(),
      commissions: getCommissions_(),
      rentals: getRentals_(),
      documents: getDocuments_(),
      automation: getAutomation_()
    };
  }

  function getKpis_() {
    const dashboard = REOS.Dashboard.getExecutiveDashboard();
    return {
      activeLeads: value_(dashboard.crm, 'activeLeadsCount'),
      hotLeads: value_(dashboard.crm, 'hotLeadsCount'),
      overdueTasks: value_(dashboard.tasks, 'overdueCount'),
      activeTransactions: value_(dashboard.transactions, 'activeCount'),
      pendingGci: value_(dashboard.transactions, 'pendingGci'),
      projectedNetCommission: value_(dashboard.commissions, 'projectedNet'),
      rentalCashFlow: value_(dashboard.rentals, 'monthlyCashFlow'),
      monthlyNetProfit: value_(value_(dashboard.finance, 'currentMonth', {}), 'netProfit')
    };
  }

  function getPipeline_() {
    const leads = REOS.CRM.listLeads ? REOS.CRM.listLeads() : [];
    return leads.filter(function (lead) {
      return lead.Active !== false && ['closed', 'lost', 'archived'].indexOf(String(lead.Status || '').toLowerCase()) === -1;
    }).slice(0, 50);
  }

  function getTaskCenter_() {
    return {
      overdue: REOS.Tasks.overdue().slice(0, 25),
      dueToday: REOS.Tasks.dueToday().slice(0, 25),
      upcoming: REOS.Tasks.upcoming(7).slice(0, 25)
    };
  }

  function getTransactions_() {
    try {
      return REOS.Transactions.listActive().slice(0, 50);
    } catch (error) {
      return [];
    }
  }

  function getCommissions_() {
    try {
      return REOS.Commissions.listActive().slice(-50).reverse();
    } catch (error) {
      return [];
    }
  }

  function getRentals_() {
    try {
      return REOS.Rentals.listActive().slice(0, 50);
    } catch (error) {
      return [];
    }
  }

  function getDocuments_() {
    try {
      return REOS.Documents.search('').slice(0, 50);
    } catch (error) {
      return [];
    }
  }

  function getAutomation_() {
    try {
      return {
        triggers: REOS.Triggers.list(),
        activePortalAccess: REOS.Portal.listActiveAccess().length
      };
    } catch (error) {
      return { triggers: [], activePortalAccess: 0 };
    }
  }

  function quickCreateLeadFollowUp(clientId, leadId) {
    REOS.Security.requirePermission('tasks:write');
    return REOS.FollowUp.startSequence(clientId, leadId, 'New Lead', 'Started from Agent Portal.');
  }

  function quickCreateClientPortal(clientId, email, recordType, recordId) {
    REOS.Security.requirePermission('documents:write');
    return REOS.ClientPortal.createClientAccess(clientId, email, recordType, recordId, 'Created from Agent Portal.');
  }

  function sanitizeUser_(user) {
    return {
      email: user.Email || user.email || '',
      role: user.Role || user.role || '',
      status: user.Status || user.status || ''
    };
  }

  function value_(obj, key, fallback) {
    return obj && !obj.error && obj[key] !== undefined ? obj[key] : (fallback || 0);
  }

  return {
    getWorkspace: getWorkspace,
    quickCreateLeadFollowUp: quickCreateLeadFollowUp,
    quickCreateClientPortal: quickCreateClientPortal
  };
})();

function agentPortalGetWorkspace() { return REOS.AgentPortal.getWorkspace(); }
function agentPortalQuickCreateLeadFollowUp(clientId, leadId) {
  return REOS.AgentPortal.quickCreateLeadFollowUp(clientId, leadId);
}
function agentPortalQuickCreateClientPortal(clientId, email, recordType, recordId) {
  return REOS.AgentPortal.quickCreateClientPortal(clientId, email, recordType, recordId);
}

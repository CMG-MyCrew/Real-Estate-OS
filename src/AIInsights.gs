/**
 * REOS Enterprise v3.0 - AI Insights Framework
 *
 * Context builders and AI-assisted workflows for CRM, deals, documents,
 * finance, and daily operations.
 */

var REOS = REOS || {};

REOS.AIInsights = (function () {
  function dailyBriefing() {
    const context = {
      dashboard: REOS.Dashboard.getExecutiveDashboard(),
      tasks: {
        overdue: REOS.Tasks.overdue().slice(0, 20),
        dueToday: REOS.Tasks.dueToday().slice(0, 20),
        upcoming: REOS.Tasks.upcoming(7).slice(0, 20)
      }
    };
    return REOS.AI.ask('Daily Briefing', 'Create a daily executive briefing with priorities, risks, and recommended next actions.', context);
  }

  function leadCoach(leadId) {
    const lead = findLead_(leadId);
    const contact = lead && lead['Client ID'] ? safe_(function () { return REOS.CRM.getContact(lead['Client ID']); }) : null;
    const activities = contact ? safe_(function () { return REOS.Activities.listForClient(contact['Client ID']).slice(-20); }) : [];
    return REOS.AI.ask('Lead Coach', 'Analyze this lead and recommend the best follow-up strategy, script, objections to prepare for, and next task.', {
      lead: lead,
      contact: contact,
      recentActivities: activities
    });
  }

  function transactionRiskReview(transactionId) {
    const tx = REOS.Transactions.get(transactionId);
    const docs = safe_(function () { return REOS.Documents.listForRecord(transactionId); }) || [];
    const missing = safe_(function () { return REOS.Documents.missingForRecord(transactionId); }) || [];
    const tasks = safe_(function () { return REOS.Tasks.listActive().filter(function (t) { return String(t.Notes || '').indexOf(transactionId) !== -1; }); }) || [];
    return REOS.AI.ask('Transaction Risk Review', 'Review this transaction for closing risks, missing documents, urgent tasks, and recommended next actions.', {
      transaction: tx,
      documents: docs,
      missingDocuments: missing,
      tasks: tasks
    });
  }

  function investmentDealReview(investmentId) {
    const investment = REOS.Investments.get(investmentId);
    return REOS.AI.ask('Investment Deal Review', 'Review this investment deal. Explain strengths, risks, financial red flags, and whether to pursue, renegotiate, or pass.', {
      investment: investment
    });
  }

  function rentalPortfolioReview() {
    return REOS.AI.ask('Rental Portfolio Review', 'Analyze the rental portfolio for occupancy risk, cash-flow issues, lease renewal priorities, maintenance risk, and next actions.', {
      rentals: REOS.Rentals.dashboard(),
      leasesExpiring: REOS.Leases.expiringWithin(90),
      maintenanceOpen: REOS.Maintenance.listOpen()
    });
  }

  function financeReview() {
    return REOS.AI.ask('Finance Review', 'Analyze current business finances. Identify profitability trends, cash-flow concerns, tax reserve issues, and recommended financial actions.', {
      finance: REOS.Finance.dashboard(),
      commissions: REOS.Commissions.dashboard()
    });
  }

  function documentSummary(documentId) {
    const doc = REOS.Documents.get(documentId);
    return REOS.AI.ask('Document Summary', 'Summarize this document metadata and identify required follow-up, signature status, verification status, and missing information.', {
      document: doc
    });
  }

  function draftEmail(type, context) {
    return REOS.AI.ask('Email Draft', 'Draft a professional real estate email for this situation: ' + type + '. Include a clear subject line and concise body.', context || {});
  }

  function findLead_(leadId) {
    const leads = REOS.CRM.listLeads ? REOS.CRM.listLeads() : [];
    return leads.filter(function (lead) { return String(lead['Lead ID'] || '') === String(leadId || ''); })[0] || null;
  }

  function safe_(fn) {
    try { return fn(); } catch (error) { return null; }
  }

  return {
    dailyBriefing: dailyBriefing,
    leadCoach: leadCoach,
    transactionRiskReview: transactionRiskReview,
    investmentDealReview: investmentDealReview,
    rentalPortfolioReview: rentalPortfolioReview,
    financeReview: financeReview,
    documentSummary: documentSummary,
    draftEmail: draftEmail
  };
})();

function aiDailyBriefing() { return REOS.AIInsights.dailyBriefing(); }
function aiLeadCoach(leadId) { return REOS.AIInsights.leadCoach(leadId); }
function aiTransactionRiskReview(transactionId) { return REOS.AIInsights.transactionRiskReview(transactionId); }
function aiInvestmentDealReview(investmentId) { return REOS.AIInsights.investmentDealReview(investmentId); }
function aiRentalPortfolioReview() { return REOS.AIInsights.rentalPortfolioReview(); }
function aiFinanceReview() { return REOS.AIInsights.financeReview(); }
function aiDocumentSummary(documentId) { return REOS.AIInsights.documentSummary(documentId); }
function aiDraftEmail(type, context) { return REOS.AIInsights.draftEmail(type, context || {}); }

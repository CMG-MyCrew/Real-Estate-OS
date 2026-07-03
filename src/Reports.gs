/**
 * REOS Enterprise v3.0 - Reports Framework
 *
 * Produces structured business reports from dashboard/module data.
 */

var REOS = REOS || {};

REOS.Reports = (function () {
  function monthlyBusinessReport(year, month) {
    REOS.Security.requirePermission('reports:read');

    const now = new Date();
    year = Number(year || now.getFullYear());
    month = Number(month || (now.getMonth() + 1));

    const dashboard = REOS.Dashboard.getExecutiveDashboard();
    const finance = REOS.Finance.monthlySummary(year, month);

    return {
      title: 'Monthly Business Report',
      period: year + '-' + String(month).padStart(2, '0'),
      generatedAt: new Date(),
      executiveSummary: {
        contacts: value_(dashboard.crm, 'contactsCount'),
        activeLeads: value_(dashboard.crm, 'activeLeadsCount'),
        overdueTasks: value_(dashboard.tasks, 'overdueCount'),
        activeTransactions: value_(dashboard.transactions, 'activeCount'),
        rentalCashFlow: value_(dashboard.rentals, 'monthlyCashFlow'),
        netProfit: finance.netProfit,
        cashFlow: finance.cashFlow
      },
      sales: salesReport_(),
      rentals: rentalReport_(),
      investments: investmentReport_(),
      finance: finance
    };
  }

  function salesReport_() {
    const tx = REOS.Transactions.dashboard();
    const commissions = REOS.Commissions.dashboard();
    return {
      activeTransactions: tx.activeCount,
      pendingTransactions: tx.pendingCount,
      closedTransactions: tx.closedCount,
      pendingGci: tx.pendingGci,
      closedGci: tx.closedGci,
      projectedNetCommission: commissions.projectedNet,
      paidNetCommission: commissions.paidNet
    };
  }

  function rentalReport_() {
    const rentals = REOS.Rentals.dashboard();
    const expiringLeases = REOS.Leases.expiringWithin(90);
    const maintenance = REOS.Maintenance.listOpen();
    return {
      rentalCount: rentals.rentalCount,
      occupiedCount: rentals.occupiedCount,
      vacantCount: rentals.vacantCount,
      occupancyRate: rentals.occupancyRate,
      monthlyRent: rentals.monthlyRent,
      monthlyCashFlow: rentals.monthlyCashFlow,
      leasesExpiring90Days: expiringLeases.length,
      openWorkOrders: maintenance.length
    };
  }

  function investmentReport_() {
    const investments = REOS.Investments.dashboard();
    return {
      activeInvestments: investments.activeCount,
      flipCount: investments.flipCount,
      rentalCount: investments.rentalCount,
      totalEstimatedProfit: investments.totalEstimatedProfit,
      totalActualProfit: investments.totalActualProfit,
      monthlyCashFlow: investments.monthlyCashFlow
    };
  }

  function value_(obj, key) {
    return obj && !obj.error ? obj[key] : null;
  }

  return {
    monthlyBusinessReport: monthlyBusinessReport
  };
})();

function reportsMonthlyBusiness(year, month) {
  return REOS.Reports.monthlyBusinessReport(year, month);
}

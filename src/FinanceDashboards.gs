/**
 * REOS Enterprise v3.1.3 - Finance Dashboards
 *
 * Executive finance dashboard, cash flow dashboard, portfolio profitability,
 * AR/AP aging widgets, monthly revenue/expense trends, budget variance,
 * and dashboard-ready datasets for charts.
 */

var REOS = REOS || {};

REOS.FinanceDashboards = (function () {
  const SNAPSHOTS_SHEET = 'FIN_DASHBOARD_SNAPSHOTS';
  const BUDGETS_SHEET = 'FIN_BUDGETS';
  const SNAPSHOT_ID_FIELD = 'Finance Snapshot ID';
  const BUDGET_ID_FIELD = 'Budget ID';

  const SNAPSHOT_HEADERS = ['Finance Snapshot ID', 'Period', 'Revenue', 'Receivables', 'Payables', 'Expenses', 'Vendor Payments', 'Net Income', 'Cash Requirement', 'Snapshot JSON', 'Created At', 'Updated At'];
  const BUDGET_HEADERS = ['Budget ID', 'Period', 'Property ID', 'Category', 'Budget Amount', 'Actual Amount', 'Variance', 'Status', 'Created At', 'Updated At'];

  function ensureSheets() {
    ensureTable_(SNAPSHOTS_SHEET, SNAPSHOT_HEADERS);
    ensureTable_(BUDGETS_SHEET, BUDGET_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setWrap(true);
      sheet.autoResizeColumns(1, headers.length);
    }
  }

  function getDashboard(filters) {
    REOS.Security.requireAdmin();
    ensureSheets();
    filters = filters || {};
    const period = filters.period || currentPeriod_();
    const invoices = safeGetAll_('FIN_INVOICES');
    const payments = safeGetAll_('FIN_VENDOR_PAYMENTS');
    const expenses = safeGetAll_('FIN_EXPENSES');
    const budgets = safeGetAll_(BUDGETS_SHEET);
    const ar = REOS.FinanceEnhancements && REOS.FinanceEnhancements.getReceivablesAging ? REOS.FinanceEnhancements.getReceivablesAging() : aging_(invoices.filter(function (i) { return Number(i.Balance || 0) > 0; }), 'Due Date', 'Balance');
    const ap = REOS.FinanceEnhancements && REOS.FinanceEnhancements.getPayablesAging ? REOS.FinanceEnhancements.getPayablesAging() : aging_(payments.filter(function (p) { return p.Status !== 'Paid'; }), 'Payment Date', 'Amount');
    const revenue = sum_(invoices, 'Total');
    const receivables = sum_(invoices, 'Balance');
    const vendorPayments = sum_(payments.filter(function (p) { return p.Status === 'Paid' || p.Status === 'Approved'; }), 'Amount');
    const expenseTotal = sum_(expenses, 'Amount');
    const payableAmount = sum_(payments.filter(function (p) { return p.Status !== 'Paid'; }), 'Amount');
    const netIncome = revenue - vendorPayments - expenseTotal;
    const monthly = monthlySeries_(invoices, payments, expenses);
    const propertyPL = propertyPL_(invoices, payments, expenses);
    const variance = budgetVariance_(budgets, expenses, invoices);

    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      period: period,
      kpis: {
        revenue: revenue,
        receivables: receivables,
        payables: payableAmount,
        expenses: expenseTotal,
        vendorPayments: vendorPayments,
        netIncome: netIncome,
        cashRequirement: payableAmount + expenseTotal,
        ar90Plus: Number(ar.days90 || 0) + Number(ar.days120 || 0),
        ap90Plus: Number(ap.days90 || 0) + Number(ap.days120 || 0)
      },
      receivablesAging: ar,
      payablesAging: ap,
      monthlySeries: monthly,
      propertyPL: propertyPL,
      budgetVariance: variance,
      snapshots: latest_(safeGetAll_(SNAPSHOTS_SHEET), 'Created At', 25),
      budgets: latest_(budgets, 'Created At', 100)
    };
  }

  function createSnapshot(period) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const dashboard = getDashboard({ period: period || currentPeriod_() });
    return REOS.Database.insert(SNAPSHOTS_SHEET, {
      Period: dashboard.period,
      Revenue: dashboard.kpis.revenue,
      Receivables: dashboard.kpis.receivables,
      Payables: dashboard.kpis.payables,
      Expenses: dashboard.kpis.expenses,
      'Vendor Payments': dashboard.kpis.vendorPayments,
      'Net Income': dashboard.kpis.netIncome,
      'Cash Requirement': dashboard.kpis.cashRequirement,
      'Snapshot JSON': REOS.toJson_(dashboard),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: SNAPSHOT_ID_FIELD, idPrefix: 'FDS' });
  }

  function createBudget(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    const budget = Number(record['Budget Amount'] || 0);
    const actual = Number(record['Actual Amount'] || 0);
    return REOS.Database.insert(BUDGETS_SHEET, {
      Period: record.Period || currentPeriod_(),
      'Property ID': record['Property ID'] || '',
      Category: record.Category || 'General',
      'Budget Amount': budget,
      'Actual Amount': actual,
      Variance: budget - actual,
      Status: actual > budget ? 'Over Budget' : 'On Track',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: BUDGET_ID_FIELD, idPrefix: 'BUD' });
  }

  function recalculateBudgets() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const budgets = safeGetAll_(BUDGETS_SHEET);
    const expenses = safeGetAll_('FIN_EXPENSES');
    let updated = 0;
    budgets.forEach(function (budget) {
      const actual = expenses.filter(function (e) {
        return (!budget['Property ID'] || e['Property ID'] === budget['Property ID']) && (!budget.Category || e.Category === budget.Category) && monthKey_(e['Expense Date']) === budget.Period;
      }).reduce(function (sum, e) { return sum + Number(e.Amount || 0); }, 0);
      REOS.Database.update(BUDGETS_SHEET, BUDGET_ID_FIELD, budget[BUDGET_ID_FIELD], {
        'Actual Amount': actual,
        Variance: Number(budget['Budget Amount'] || 0) - actual,
        Status: actual > Number(budget['Budget Amount'] || 0) ? 'Over Budget' : 'On Track',
        'Updated At': new Date()
      });
      updated++;
    });
    return { ok: true, updated: updated };
  }

  function monthlySeries_(invoices, payments, expenses) {
    const map = {};
    function row_(period) {
      if (!map[period]) map[period] = { period: period, revenue: 0, vendorPayments: 0, expenses: 0, net: 0 };
      return map[period];
    }
    invoices.forEach(function (i) { row_(monthKey_(i['Invoice Date'] || i['Created At'])).revenue += Number(i.Total || 0); });
    payments.forEach(function (p) { row_(monthKey_(p['Payment Date'] || p['Created At'])).vendorPayments += Number(p.Amount || 0); });
    expenses.forEach(function (e) { row_(monthKey_(e['Expense Date'] || e['Created At'])).expenses += Number(e.Amount || 0); });
    Object.keys(map).forEach(function (period) { map[period].net = map[period].revenue - map[period].vendorPayments - map[period].expenses; });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  function propertyPL_(invoices, payments, expenses) {
    const map = {};
    function row_(propertyId) {
      const id = propertyId || 'Unassigned';
      if (!map[id]) map[id] = { propertyId: id, revenue: 0, vendorPayments: 0, expenses: 0, net: 0, margin: 0 };
      return map[id];
    }
    invoices.forEach(function (i) { row_(i['Property ID']).revenue += Number(i.Total || 0); });
    payments.forEach(function (p) { row_(p['Property ID']).vendorPayments += Number(p.Amount || 0); });
    expenses.forEach(function (e) { row_(e['Property ID']).expenses += Number(e.Amount || 0); });
    Object.keys(map).forEach(function (id) {
      map[id].net = map[id].revenue - map[id].vendorPayments - map[id].expenses;
      map[id].margin = map[id].revenue ? map[id].net / map[id].revenue : 0;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.net - a.net; });
  }

  function budgetVariance_(budgets, expenses, invoices) {
    return budgets.map(function (b) {
      return {
        period: b.Period,
        propertyId: b['Property ID'],
        category: b.Category,
        budget: Number(b['Budget Amount'] || 0),
        actual: Number(b['Actual Amount'] || 0),
        variance: Number(b.Variance || 0),
        status: b.Status
      };
    });
  }

  function aging_(rows, dateField, amountField) {
    const today = new Date();
    const result = { current: 0, days30: 0, days60: 0, days90: 0, days120: 0, total: 0, records: [] };
    rows.forEach(function (row) {
      const amount = Number(row[amountField] || 0);
      const date = row[dateField] ? new Date(row[dateField]) : today;
      const days = Math.floor((today.getTime() - date.getTime()) / 86400000);
      if (days <= 0) result.current += amount;
      else if (days <= 30) result.days30 += amount;
      else if (days <= 60) result.days60 += amount;
      else if (days <= 90) result.days90 += amount;
      else result.days120 += amount;
      result.total += amount;
      result.records.push(Object.assign({}, row, { AgingDays: days, AgingAmount: amount }));
    });
    return result;
  }

  function currentPeriod_() { return monthKey_(new Date()); }
  function monthKey_(value) { const d = value ? new Date(value) : new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function sum_(rows, field) { return (rows || []).reduce(function (s, r) { return s + Number(r[field] || 0); }, 0); }
  function safeGetAll_(sheetName) { try { return REOS.Database.getAll(sheetName); } catch (error) { return []; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 50); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, createSnapshot: createSnapshot, createBudget: createBudget, recalculateBudgets: recalculateBudgets };
})();

function reosFinanceDashboardsEnsureSheets() { return REOS.FinanceDashboards.ensureSheets(); }
function reosFinanceDashboardsData(filters) { return REOS.FinanceDashboards.getDashboard(filters || {}); }
function reosFinanceDashboardsSnapshot(period) { return REOS.FinanceDashboards.createSnapshot(period || ''); }
function reosFinanceDashboardsCreateBudget(record) { return REOS.FinanceDashboards.createBudget(record || {}); }
function reosFinanceDashboardsRecalculateBudgets() { return REOS.FinanceDashboards.recalculateBudgets(); }
function showFinanceDashboards() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('FinanceDashboards').setTitle('REOS Finance Dashboards').setWidth(1200).setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Finance Dashboards');
}

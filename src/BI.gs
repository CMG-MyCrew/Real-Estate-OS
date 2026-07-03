/**
 * REOS Enterprise v3.0 - Business Intelligence Framework
 *
 * Cross-module analytics, KPI snapshots, trend data, and executive BI summaries.
 */

var REOS = REOS || {};

REOS.BI = (function () {
  const SNAPSHOT_SHEET = 'BI_SNAPSHOTS';
  const ID_FIELD = 'Snapshot ID';

  const HEADERS = [
    'Snapshot ID', 'Snapshot Date', 'Period', 'Active Leads', 'Hot Leads',
    'Overdue Tasks', 'Active Transactions', 'Pending GCI', 'Closed GCI',
    'Projected Net Commission', 'Paid Net Commission', 'Rental Cash Flow',
    'Monthly Income', 'Monthly Expenses', 'Monthly Net Profit', 'Monthly Cash Flow',
    'Office Count', 'Agent Count', 'Brokerage YTD GCI', 'Brokerage YTD Net',
    'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SNAPSHOT_SHEET);
    if (!sheet) sheet = ss.insertSheet(SNAPSHOT_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function createSnapshot(period) {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    const dashboard = REOS.Dashboard.getExecutiveDashboard();
    const brokerage = safe_(function () { return REOS.Brokerage.dashboard(); }) || {};
    const financeMonth = value_(dashboard.finance, 'currentMonth', {});

    const row = {
      'Snapshot Date': new Date(),
      Period: period || periodKey_(new Date()),
      'Active Leads': value_(dashboard.crm, 'activeLeadsCount'),
      'Hot Leads': value_(dashboard.crm, 'hotLeadsCount'),
      'Overdue Tasks': value_(dashboard.tasks, 'overdueCount'),
      'Active Transactions': value_(dashboard.transactions, 'activeCount'),
      'Pending GCI': value_(dashboard.transactions, 'pendingGci'),
      'Closed GCI': value_(dashboard.transactions, 'closedGci'),
      'Projected Net Commission': value_(dashboard.commissions, 'projectedNet'),
      'Paid Net Commission': value_(dashboard.commissions, 'paidNet'),
      'Rental Cash Flow': value_(dashboard.rentals, 'monthlyCashFlow'),
      'Monthly Income': value_(financeMonth, 'income'),
      'Monthly Expenses': value_(financeMonth, 'expenses'),
      'Monthly Net Profit': value_(financeMonth, 'netProfit'),
      'Monthly Cash Flow': value_(financeMonth, 'cashFlow'),
      'Office Count': brokerage.officeCount || 0,
      'Agent Count': brokerage.agentCount || 0,
      'Brokerage YTD GCI': brokerage.ytdGci || 0,
      'Brokerage YTD Net': brokerage.ytdNetCommission || 0
    };

    const created = REOS.Database.insert(SNAPSHOT_SHEET, row, { idField: ID_FIELD, idPrefix: 'BIS' });
    REOS.Logger.audit('BI snapshot created', { snapshotId: created[ID_FIELD], period: created.Period });
    return created;
  }

  function listSnapshots(limit) {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    const rows = REOS.Database.getAll(SNAPSHOT_SHEET);
    return rows.slice(-Number(limit || 24));
  }

  function executiveBI() {
    const latest = getLatestSnapshot_();
    const snapshots = listSnapshots(24);
    return {
      generatedAt: new Date(),
      latest: latest,
      trends: buildTrends_(snapshots),
      scorecard: buildScorecard_(latest),
      recommendations: buildRecommendations_(latest, snapshots)
    };
  }

  function buildTrends_(snapshots) {
    return {
      periods: snapshots.map(function (s) { return s.Period; }),
      activeLeads: snapshots.map(function (s) { return num_(s['Active Leads']); }),
      pendingGci: snapshots.map(function (s) { return num_(s['Pending GCI']); }),
      netProfit: snapshots.map(function (s) { return num_(s['Monthly Net Profit']); }),
      cashFlow: snapshots.map(function (s) { return num_(s['Monthly Cash Flow']); }),
      brokerageGci: snapshots.map(function (s) { return num_(s['Brokerage YTD GCI']); })
    };
  }

  function buildScorecard_(latest) {
    latest = latest || {};
    return {
      leadHealth: score_(num_(latest['Hot Leads']), num_(latest['Active Leads']), 0.20),
      taskHealth: num_(latest['Overdue Tasks']) === 0 ? 100 : Math.max(0, 100 - num_(latest['Overdue Tasks']) * 10),
      pipelineHealth: num_(latest['Pending GCI']) > 0 ? 85 : 40,
      financeHealth: num_(latest['Monthly Cash Flow']) >= 0 ? 90 : 35,
      brokerageHealth: num_(latest['Agent Count']) > 0 ? 80 : 50
    };
  }

  function buildRecommendations_(latest, snapshots) {
    latest = latest || {};
    const recs = [];
    if (num_(latest['Overdue Tasks']) > 0) recs.push('Reduce overdue tasks before adding new pipeline volume.');
    if (num_(latest['Hot Leads']) < 3) recs.push('Increase prospecting or lead nurturing to build more hot leads.');
    if (num_(latest['Pending GCI']) === 0) recs.push('Pipeline GCI is low; prioritize active buyer/seller conversion.');
    if (num_(latest['Monthly Cash Flow']) < 0) recs.push('Monthly cash flow is negative; review expenses, tax reserve, and pending receivables.');
    if (snapshots.length >= 2) {
      const previous = snapshots[snapshots.length - 2];
      if (num_(latest['Active Leads']) < num_(previous['Active Leads'])) recs.push('Active leads declined from the prior snapshot; review lead sources.');
      if (num_(latest['Monthly Net Profit']) < num_(previous['Monthly Net Profit'])) recs.push('Net profit declined from the prior snapshot; investigate revenue and expenses.');
    }
    return recs.length ? recs : ['Business health appears stable based on current snapshot data.'];
  }

  function getLatestSnapshot_() {
    const rows = listSnapshots(1);
    return rows.length ? rows[0] : createSnapshot();
  }

  function periodKey_(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function score_(part, whole, targetRatio) {
    if (!whole) return 0;
    return Math.min(100, Math.round((part / whole) / targetRatio * 100));
  }

  function value_(obj, key, fallback) {
    return obj && !obj.error && obj[key] !== undefined ? obj[key] : (fallback || 0);
  }

  function num_(value) {
    return Number(value || 0) || 0;
  }

  function safe_(fn) {
    try { return fn(); } catch (error) { return null; }
  }

  return {
    ensureSheet: ensureSheet,
    createSnapshot: createSnapshot,
    listSnapshots: listSnapshots,
    executiveBI: executiveBI
  };
})();

function biCreateSnapshot(period) { return REOS.BI.createSnapshot(period); }
function biListSnapshots(limit) { return REOS.BI.listSnapshots(limit); }
function biExecutive() { return REOS.BI.executiveBI(); }

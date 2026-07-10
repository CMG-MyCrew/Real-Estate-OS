/**
 * REOS Enterprise v3.2.2 - Investor Portal UI
 *
 * Adds investor-specific portal datasets, portfolio KPIs, property performance,
 * document center, capital updates, investor messages, and investor portal shell.
 */

var REOS = REOS || {};

REOS.InvestorPortal = (function () {
  const UPDATES_SHEET = 'INVESTOR_PORTAL_UPDATES';
  const WATCHLIST_SHEET = 'INVESTOR_PROPERTY_WATCHLIST';
  const UPDATE_ID_FIELD = 'Investor Update ID';
  const WATCHLIST_ID_FIELD = 'Investor Watchlist ID';

  const UPDATE_HEADERS = ['Investor Update ID', 'Portal Account ID', 'Title', 'Body', 'Category', 'Status', 'Published At', 'Created At', 'Updated At'];
  const WATCHLIST_HEADERS = ['Investor Watchlist ID', 'Portal Account ID', 'Property ID', 'Status', 'Notes', 'Created At', 'Updated At'];

  function ensureSheets() {
    ensureTable_(UPDATES_SHEET, UPDATE_HEADERS);
    ensureTable_(WATCHLIST_SHEET, WATCHLIST_HEADERS);
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

  function getInvestorDashboard(accountId) {
    ensureSheets();
    const account = REOS.Database.findById('PORTAL_ACCOUNTS', 'Portal Account ID', accountId);
    if (!account) throw new Error('Portal account not found.');
    if (account['Portal Role'] !== 'Investor') throw new Error('Portal account is not an investor account.');

    const finance = safeFinanceDashboard_();
    const documents = safeGetAll_('PORTAL_DOCUMENT_SHARES').filter(function (s) { return s['Portal Account ID'] === accountId && s.Status === 'Active'; });
    const messages = safeGetAll_('PORTAL_MESSAGES').filter(function (m) { return m['Portal Account ID'] === accountId; });
    const tasks = safeGetAll_('PORTAL_TASKS').filter(function (t) { return t['Portal Account ID'] === accountId; });
    const updates = safeGetAll_(UPDATES_SHEET).filter(function (u) { return u['Portal Account ID'] === accountId && u.Status === 'Published'; });
    const watchlist = safeGetAll_(WATCHLIST_SHEET).filter(function (w) { return w['Portal Account ID'] === accountId && w.Status !== 'Archived'; });

    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      account: account,
      kpis: {
        portfolioRevenue: Number((finance.kpis || {}).revenue || 0),
        netIncome: Number((finance.kpis || {}).netIncome || 0),
        cashRequirement: Number((finance.kpis || {}).cashRequirement || 0),
        documents: documents.length,
        openMessages: messages.filter(function (m) { return m.Status !== 'Closed'; }).length,
        openTasks: tasks.filter(function (t) { return t.Status !== 'Completed'; }).length,
        updates: updates.length,
        watchlist: watchlist.length
      },
      propertyPerformance: finance.propertyPL || [],
      monthlySeries: finance.monthlySeries || [],
      documents: documents,
      messages: latest_(messages, 'Created At', 25),
      tasks: latest_(tasks, 'Created At', 25),
      updates: latest_(updates, 'Published At', 25),
      watchlist: watchlist
    };
  }

  function createInvestorUpdate(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    if (!record['Portal Account ID']) throw new Error('Portal Account ID is required.');
    return REOS.Database.insert(UPDATES_SHEET, {
      'Portal Account ID': record['Portal Account ID'],
      Title: record.Title || '',
      Body: record.Body || '',
      Category: record.Category || 'General',
      Status: record.Status || 'Draft',
      'Published At': record.Status === 'Published' ? new Date() : '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: UPDATE_ID_FIELD, idPrefix: 'IUPD' });
  }

  function publishInvestorUpdate(updateId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.update(UPDATES_SHEET, UPDATE_ID_FIELD, updateId, { Status: 'Published', 'Published At': new Date(), 'Updated At': new Date() });
  }

  function addWatchlistProperty(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    if (!record['Portal Account ID']) throw new Error('Portal Account ID is required.');
    if (!record['Property ID']) throw new Error('Property ID is required.');
    return REOS.Database.insert(WATCHLIST_SHEET, {
      'Portal Account ID': record['Portal Account ID'],
      'Property ID': record['Property ID'],
      Status: record.Status || 'Active',
      Notes: record.Notes || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: WATCHLIST_ID_FIELD, idPrefix: 'IWL' });
  }

  function safeFinanceDashboard_() {
    try {
      if (REOS.FinanceDashboards && typeof REOS.FinanceDashboards.getDashboard === 'function') return REOS.FinanceDashboards.getDashboard({});
    } catch (error) {}
    return { kpis: {}, propertyPL: [], monthlySeries: [] };
  }

  function safeGetAll_(sheetName) { try { return REOS.Database.getAll(sheetName); } catch (error) { return []; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 25); }

  return { ensureSheets: ensureSheets, getInvestorDashboard: getInvestorDashboard, createInvestorUpdate: createInvestorUpdate, publishInvestorUpdate: publishInvestorUpdate, addWatchlistProperty: addWatchlistProperty };
})();

function reosInvestorPortalEnsureSheets() { return REOS.InvestorPortal.ensureSheets(); }
function reosInvestorPortalDashboard(accountId) { return REOS.InvestorPortal.getInvestorDashboard(accountId); }
function reosInvestorPortalCreateUpdate(record) { return REOS.InvestorPortal.createInvestorUpdate(record || {}); }
function reosInvestorPortalPublishUpdate(updateId) { return REOS.InvestorPortal.publishInvestorUpdate(updateId); }
function reosInvestorPortalAddWatchlist(record) { return REOS.InvestorPortal.addWatchlistProperty(record || {}); }
function showInvestorPortal() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('InvestorPortalUI').setTitle('REOS Investor Portal').setWidth(1200).setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Investor Portal');
}

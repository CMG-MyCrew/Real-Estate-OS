/**
 * REOS Enterprise v3.1.2 - QuickBooks Connector Foundation
 *
 * Increment 3.1.2.1 foundation:
 * connection registry, OAuth/settings placeholders, account/entity mapping,
 * export queue, dry-run sync logging, and connector dashboard.
 */

var REOS = REOS || {};

REOS.QuickBooksConnector = (function () {
  const CONNECTIONS_SHEET = 'QB_CONNECTIONS';
  const SYNC_LOG_SHEET = 'QB_SYNC_LOG';
  const ACCOUNT_MAP_SHEET = 'QB_ACCOUNT_MAP';
  const ENTITY_MAP_SHEET = 'QB_ENTITY_MAP';
  const EXPORT_QUEUE_SHEET = 'QB_EXPORT_QUEUE';
  const CONNECTION_ID_FIELD = 'QB Connection ID';
  const LOG_ID_FIELD = 'QB Sync Log ID';
  const ACCOUNT_MAP_ID_FIELD = 'QB Account Map ID';
  const ENTITY_MAP_ID_FIELD = 'QB Entity Map ID';
  const QUEUE_ID_FIELD = 'QB Queue ID';

  const CONNECTION_HEADERS = ['QB Connection ID', 'Environment', 'Company ID', 'Company Name', 'Status', 'Client ID Key', 'Client Secret Key', 'Redirect URI', 'Scopes', 'Access Token Property', 'Refresh Token Property', 'Connected At', 'Created At', 'Updated At'];
  const LOG_HEADERS = ['QB Sync Log ID', 'Connection ID', 'Direction', 'Object Type', 'Object ID', 'Status', 'Message', 'Payload JSON', 'Created At', 'Updated At'];
  const ACCOUNT_MAP_HEADERS = ['QB Account Map ID', 'REOS Category', 'REOS Type', 'QB Account Name', 'QB Account ID', 'Active', 'Created At', 'Updated At'];
  const ENTITY_MAP_HEADERS = ['QB Entity Map ID', 'REOS Entity Type', 'REOS Entity ID', 'QB Entity Type', 'QB Entity ID', 'Display Name', 'Status', 'Created At', 'Updated At'];
  const QUEUE_HEADERS = ['QB Queue ID', 'Connection ID', 'Direction', 'Object Type', 'Object ID', 'Operation', 'Status', 'Payload JSON', 'Attempts', 'Last Attempt At', 'Created At', 'Updated At'];

  function ensureSheets() {
    ensureTable_(CONNECTIONS_SHEET, CONNECTION_HEADERS);
    ensureTable_(SYNC_LOG_SHEET, LOG_HEADERS);
    ensureTable_(ACCOUNT_MAP_SHEET, ACCOUNT_MAP_HEADERS);
    ensureTable_(ENTITY_MAP_SHEET, ENTITY_MAP_HEADERS);
    ensureTable_(EXPORT_QUEUE_SHEET, QUEUE_HEADERS);
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

  function getDashboard() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const connections = REOS.Database.getAll(CONNECTIONS_SHEET);
    const logs = REOS.Database.getAll(SYNC_LOG_SHEET);
    const accountMaps = REOS.Database.getAll(ACCOUNT_MAP_SHEET);
    const entityMaps = REOS.Database.getAll(ENTITY_MAP_SHEET);
    const queue = REOS.Database.getAll(EXPORT_QUEUE_SHEET);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        connections: connections.length,
        activeConnections: connections.filter(function (c) { return String(c.Status || '') === 'Connected'; }).length,
        queued: queue.filter(function (q) { return String(q.Status || '') === 'Queued'; }).length,
        failed: queue.filter(function (q) { return String(q.Status || '') === 'Failed'; }).length,
        accountMaps: accountMaps.length,
        entityMaps: entityMaps.length,
        logs: logs.length
      },
      connections: latest_(connections, 'Created At', 25),
      queue: latest_(queue, 'Created At', 100),
      logs: latest_(logs, 'Created At', 100),
      accountMaps: accountMaps,
      entityMaps: latest_(entityMaps, 'Created At', 100)
    };
  }

  function createConnection(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    return REOS.Database.insert(CONNECTIONS_SHEET, {
      Environment: record.Environment || 'Sandbox',
      'Company ID': record['Company ID'] || '',
      'Company Name': record['Company Name'] || '',
      Status: 'Configured',
      'Client ID Key': record['Client ID Key'] || 'QB_CLIENT_ID',
      'Client Secret Key': record['Client Secret Key'] || 'QB_CLIENT_SECRET',
      'Redirect URI': record['Redirect URI'] || '',
      Scopes: record.Scopes || 'com.intuit.quickbooks.accounting openid profile email',
      'Access Token Property': record['Access Token Property'] || 'QB_ACCESS_TOKEN',
      'Refresh Token Property': record['Refresh Token Property'] || 'QB_REFRESH_TOKEN',
      'Connected At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: CONNECTION_ID_FIELD, idPrefix: 'QBC' });
  }

  function markConnected(connectionId, companyId, companyName) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.update(CONNECTIONS_SHEET, CONNECTION_ID_FIELD, connectionId, {
      'Company ID': companyId || '',
      'Company Name': companyName || '',
      Status: 'Connected',
      'Connected At': new Date(),
      'Updated At': new Date()
    });
  }

  function seedAccountMappings() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const categories = safeGetAll_('FIN_ACCOUNT_CATEGORIES');
    const existing = REOS.Database.getAll(ACCOUNT_MAP_SHEET).map(function (m) { return String(m['REOS Type']) + '|' + String(m['REOS Category']); });
    let created = 0;
    categories.forEach(function (cat) {
      const key = String(cat.Type) + '|' + String(cat.Name);
      if (existing.indexOf(key) !== -1) return;
      REOS.Database.insert(ACCOUNT_MAP_SHEET, {
        'REOS Category': cat.Name,
        'REOS Type': cat.Type,
        'QB Account Name': cat['QuickBooks Account'] || cat.Name,
        'QB Account ID': '',
        Active: true,
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: ACCOUNT_MAP_ID_FIELD, idPrefix: 'QAM' });
      created++;
    });
    return { ok: true, created: created, mappings: REOS.Database.getAll(ACCOUNT_MAP_SHEET) };
  }

  function queueObject(connectionId, direction, objectType, objectId, operation, payload) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.insert(EXPORT_QUEUE_SHEET, {
      'Connection ID': connectionId || '',
      Direction: direction || 'Export',
      'Object Type': objectType,
      'Object ID': objectId,
      Operation: operation || 'Upsert',
      Status: 'Queued',
      'Payload JSON': REOS.toJson_(payload || {}),
      Attempts: 0,
      'Last Attempt At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: QUEUE_ID_FIELD, idPrefix: 'QBQ' });
  }

  function queueFinanceExports(connectionId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const invoices = safeGetAll_('FIN_INVOICES');
    const payments = safeGetAll_('FIN_VENDOR_PAYMENTS');
    const expenses = safeGetAll_('FIN_EXPENSES');
    let queued = 0;
    invoices.forEach(function (invoice) { queueObject(connectionId, 'Export', 'Invoice', invoice['Invoice ID'], 'Upsert', invoice); queued++; });
    payments.forEach(function (payment) { queueObject(connectionId, 'Export', 'BillPayment', payment['Payment ID'], 'Upsert', payment); queued++; });
    expenses.forEach(function (expense) { queueObject(connectionId, 'Export', 'Purchase', expense['Expense ID'], 'Upsert', expense); queued++; });
    return { ok: true, queued: queued };
  }

  function runDryRunSync(connectionId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const queued = REOS.Database.getAll(EXPORT_QUEUE_SHEET).filter(function (q) { return (!connectionId || q['Connection ID'] === connectionId) && q.Status === 'Queued'; });
    queued.forEach(function (item) {
      logSync_(item['Connection ID'], item.Direction, item['Object Type'], item['Object ID'], 'Dry Run', 'Dry-run sync completed. No data sent to QuickBooks.', item);
      REOS.Database.update(EXPORT_QUEUE_SHEET, QUEUE_ID_FIELD, item[QUEUE_ID_FIELD], { Status: 'Dry Run Complete', Attempts: Number(item.Attempts || 0) + 1, 'Last Attempt At': new Date(), 'Updated At': new Date() });
    });
    return { ok: true, processed: queued.length, mode: 'Dry Run' };
  }

  function logSync_(connectionId, direction, objectType, objectId, status, message, payload) {
    return REOS.Database.insert(SYNC_LOG_SHEET, {
      'Connection ID': connectionId || '',
      Direction: direction || '',
      'Object Type': objectType || '',
      'Object ID': objectId || '',
      Status: status || 'Info',
      Message: message || '',
      'Payload JSON': REOS.toJson_(payload || {}),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: LOG_ID_FIELD, idPrefix: 'QLOG' });
  }

  function safeGetAll_(sheetName) { try { return REOS.Database.getAll(sheetName); } catch (error) { return []; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 50); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, createConnection: createConnection, markConnected: markConnected, seedAccountMappings: seedAccountMappings, queueObject: queueObject, queueFinanceExports: queueFinanceExports, runDryRunSync: runDryRunSync };
})();

function reosQuickBooksEnsureSheets() { return REOS.QuickBooksConnector.ensureSheets(); }
function reosQuickBooksDashboard() { return REOS.QuickBooksConnector.getDashboard(); }
function reosQuickBooksCreateConnection(record) { return REOS.QuickBooksConnector.createConnection(record || {}); }
function reosQuickBooksMarkConnected(connectionId, companyId, companyName) { return REOS.QuickBooksConnector.markConnected(connectionId, companyId, companyName); }
function reosQuickBooksSeedAccountMappings() { return REOS.QuickBooksConnector.seedAccountMappings(); }
function reosQuickBooksQueueFinanceExports(connectionId) { return REOS.QuickBooksConnector.queueFinanceExports(connectionId || ''); }
function reosQuickBooksDryRunSync(connectionId) { return REOS.QuickBooksConnector.runDryRunSync(connectionId || ''); }
function showQuickBooksConnector() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('QuickBooksConnectorUI').setTitle('REOS QuickBooks Connector').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS QuickBooks Connector');
}

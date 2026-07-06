/**
 * REOS Enterprise v3.2.4 - Client and Lender Portal UI
 */

var REOS = REOS || {};

REOS.ClientLenderPortal = (function () {
  const UPDATES_SHEET = 'CLIENT_LENDER_PORTAL_UPDATES';
  const NOTES_SHEET = 'LENDER_PORTAL_NOTES';
  const UPDATE_ID_FIELD = 'Client Lender Update ID';
  const NOTE_ID_FIELD = 'Lender Note ID';
  const UPDATE_HEADERS = ['Client Lender Update ID', 'Portal Account ID', 'Audience', 'Related Type', 'Related ID', 'Title', 'Body', 'Status', 'Published At', 'Created At', 'Updated At'];
  const NOTE_HEADERS = ['Lender Note ID', 'Portal Account ID', 'Property ID', 'Reference ID', 'Note', 'Status', 'Created At', 'Updated At'];

  function ensureSheets() {
    ensureTable_(UPDATES_SHEET, UPDATE_HEADERS);
    ensureTable_(NOTES_SHEET, NOTE_HEADERS);
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

  function getDashboard(accountId) {
    ensureSheets();
    const account = REOS.Database.findById('PORTAL_ACCOUNTS', 'Portal Account ID', accountId);
    if (!account) throw new Error('Portal account not found.');
    const role = account['Portal Role'];
    if (role !== 'Client' && role !== 'Lender') throw new Error('Portal account must be Client or Lender.');
    const linkedId = account['Linked Entity ID'];
    const properties = getVisibleProperties_(role, linkedId);
    const documents = safeGetAll_('PORTAL_DOCUMENT_SHARES').filter(function (s) { return s['Portal Account ID'] === accountId && s.Status === 'Active'; });
    const messages = safeGetAll_('PORTAL_MESSAGES').filter(function (m) { return m['Portal Account ID'] === accountId; });
    const tasks = safeGetAll_('PORTAL_TASKS').filter(function (t) { return t['Portal Account ID'] === accountId; });
    const updates = safeGetAll_(UPDATES_SHEET).filter(function (u) { return u['Portal Account ID'] === accountId && u.Status === 'Published'; });
    const notes = safeGetAll_(NOTES_SHEET).filter(function (n) { return n['Portal Account ID'] === accountId; });
    return { ok: true, generatedAt: REOS.nowIso_(), account: account, role: role, kpis: { properties: properties.length, documents: documents.length, openMessages: messages.filter(function (m) { return m.Status !== 'Closed'; }).length, openTasks: tasks.filter(function (t) { return t.Status !== 'Completed'; }).length, updates: updates.length, notes: notes.length }, properties: properties, documents: documents, messages: latest_(messages, 'Created At', 50), tasks: latest_(tasks, 'Created At', 50), updates: latest_(updates, 'Published At', 50), notes: latest_(notes, 'Created At', 50) };
  }

  function createUpdate(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    if (!record['Portal Account ID']) throw new Error('Portal Account ID is required.');
    const status = record.Status || 'Draft';
    return REOS.Database.insert(UPDATES_SHEET, { 'Portal Account ID': record['Portal Account ID'], Audience: record.Audience || 'Client', 'Related Type': record['Related Type'] || '', 'Related ID': record['Related ID'] || '', Title: record.Title || '', Body: record.Body || '', Status: status, 'Published At': status === 'Published' ? new Date() : '', 'Created At': new Date(), 'Updated At': new Date() }, { idField: UPDATE_ID_FIELD, idPrefix: 'CLUPD' });
  }

  function createNote(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    if (!record['Portal Account ID']) throw new Error('Portal Account ID is required.');
    return REOS.Database.insert(NOTES_SHEET, { 'Portal Account ID': record['Portal Account ID'], 'Property ID': record['Property ID'] || '', 'Reference ID': record['Reference ID'] || '', Note: record.Note || '', Status: record.Status || 'Open', 'Created At': new Date(), 'Updated At': new Date() }, { idField: NOTE_ID_FIELD, idPrefix: 'LNOTE' });
  }

  function getVisibleProperties_(role, linkedId) {
    const properties = safeGetAll_('PROPERTIES');
    if (!linkedId) return properties.slice(0, 100);
    if (role === 'Client') return properties.filter(function (p) { return p['Client ID'] === linkedId || p['Owner ID'] === linkedId || p['Property ID'] === linkedId; }).slice(0, 100);
    return properties.filter(function (p) { return p['Lender ID'] === linkedId || p['Reference ID'] === linkedId || p['Property ID'] === linkedId; }).slice(0, 100);
  }

  function safeGetAll_(sheetName) { try { return REOS.Database.getAll(sheetName); } catch (error) { return []; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 50); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, createUpdate: createUpdate, createNote: createNote };
})();

function reosClientLenderPortalEnsureSheets() { return REOS.ClientLenderPortal.ensureSheets(); }
function reosClientLenderPortalDashboard(accountId) { return REOS.ClientLenderPortal.getDashboard(accountId); }
function reosClientLenderPortalCreateUpdate(record) { return REOS.ClientLenderPortal.createUpdate(record || {}); }
function reosClientLenderPortalCreateNote(record) { return REOS.ClientLenderPortal.createNote(record || {}); }
function showClientLenderPortal() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('ClientLenderPortal').setTitle('REOS Client Lender Portal').setWidth(1200).setHeight(850), 'REOS Client Lender Portal'); }

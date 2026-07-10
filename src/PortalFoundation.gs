/**
 * REOS Enterprise v3.2 - Portal Foundation
 *
 * Adds portal accounts, portal sessions, portal invitations, secure document
 * shares, portal messages, portal tasks, portal activity logs, and role-specific
 * portal dashboard data for investors, lenders, clients, and vendors.
 */

var REOS = REOS || {};

REOS.PortalFoundation = (function () {
  const ACCOUNTS_SHEET = 'PORTAL_ACCOUNTS';
  const SESSIONS_SHEET = 'PORTAL_SESSIONS';
  const INVITES_SHEET = 'PORTAL_INVITATIONS';
  const SHARES_SHEET = 'PORTAL_DOCUMENT_SHARES';
  const MESSAGES_SHEET = 'PORTAL_MESSAGES';
  const TASKS_SHEET = 'PORTAL_TASKS';
  const ACTIVITY_SHEET = 'PORTAL_ACTIVITY_LOG';

  const ACCOUNT_ID_FIELD = 'Portal Account ID';
  const SESSION_ID_FIELD = 'Portal Session ID';
  const INVITE_ID_FIELD = 'Portal Invitation ID';
  const SHARE_ID_FIELD = 'Portal Share ID';
  const MESSAGE_ID_FIELD = 'Portal Message ID';
  const TASK_ID_FIELD = 'Portal Task ID';
  const ACTIVITY_ID_FIELD = 'Portal Activity ID';

  const ACCOUNT_HEADERS = ['Portal Account ID', 'Email', 'Display Name', 'Portal Role', 'Linked Entity Type', 'Linked Entity ID', 'Status', 'Last Login At', 'Created At', 'Updated At'];
  const SESSION_HEADERS = ['Portal Session ID', 'Portal Account ID', 'Token', 'Status', 'Expires At', 'Created At', 'Updated At'];
  const INVITE_HEADERS = ['Portal Invitation ID', 'Email', 'Portal Role', 'Linked Entity Type', 'Linked Entity ID', 'Token', 'Status', 'Expires At', 'Accepted At', 'Created At', 'Updated At'];
  const SHARE_HEADERS = ['Portal Share ID', 'Portal Account ID', 'Document ID', 'Property ID', 'Access Level', 'Status', 'Expires At', 'Created At', 'Updated At'];
  const MESSAGE_HEADERS = ['Portal Message ID', 'Portal Account ID', 'Direction', 'Subject', 'Body', 'Status', 'Related Type', 'Related ID', 'Created At', 'Updated At'];
  const TASK_HEADERS = ['Portal Task ID', 'Portal Account ID', 'Title', 'Description', 'Status', 'Due Date', 'Related Type', 'Related ID', 'Created At', 'Updated At'];
  const ACTIVITY_HEADERS = ['Portal Activity ID', 'Portal Account ID', 'Action', 'Details JSON', 'Created At'];

  const PORTAL_ROLES = ['Investor', 'Lender', 'Client', 'Vendor'];

  function ensureSheets() {
    ensureTable_(ACCOUNTS_SHEET, ACCOUNT_HEADERS);
    ensureTable_(SESSIONS_SHEET, SESSION_HEADERS);
    ensureTable_(INVITES_SHEET, INVITE_HEADERS);
    ensureTable_(SHARES_SHEET, SHARE_HEADERS);
    ensureTable_(MESSAGES_SHEET, MESSAGE_HEADERS);
    ensureTable_(TASKS_SHEET, TASK_HEADERS);
    ensureTable_(ACTIVITY_SHEET, ACTIVITY_HEADERS);
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

  function getAdminDashboard() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const accounts = REOS.Database.getAll(ACCOUNTS_SHEET);
    const invites = REOS.Database.getAll(INVITES_SHEET);
    const shares = REOS.Database.getAll(SHARES_SHEET);
    const messages = REOS.Database.getAll(MESSAGES_SHEET);
    const tasks = REOS.Database.getAll(TASKS_SHEET);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      roles: PORTAL_ROLES,
      kpis: {
        accounts: accounts.length,
        activeAccounts: accounts.filter(function (a) { return a.Status === 'Active'; }).length,
        pendingInvites: invites.filter(function (i) { return i.Status === 'Pending'; }).length,
        activeShares: shares.filter(function (s) { return s.Status === 'Active'; }).length,
        openMessages: messages.filter(function (m) { return m.Status !== 'Closed'; }).length,
        openTasks: tasks.filter(function (t) { return t.Status !== 'Completed'; }).length
      },
      accounts: latest_(accounts, 'Created At', 100),
      invites: latest_(invites, 'Created At', 100),
      shares: latest_(shares, 'Created At', 100),
      messages: latest_(messages, 'Created At', 100),
      tasks: latest_(tasks, 'Created At', 100),
      activity: latest_(REOS.Database.getAll(ACTIVITY_SHEET), 'Created At', 100)
    };
  }

  function createInvitation(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    if (!record.Email) throw new Error('Email is required.');
    if (PORTAL_ROLES.indexOf(record['Portal Role']) === -1) throw new Error('Invalid portal role.');
    const token = Utilities.getUuid();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = REOS.Database.insert(INVITES_SHEET, {
      Email: record.Email,
      'Portal Role': record['Portal Role'],
      'Linked Entity Type': record['Linked Entity Type'] || '',
      'Linked Entity ID': record['Linked Entity ID'] || '',
      Token: token,
      Status: 'Pending',
      'Expires At': expiresAt,
      'Accepted At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: INVITE_ID_FIELD, idPrefix: 'PINV' });
    logActivity_('', 'Invitation Created', invite);
    return invite;
  }

  function acceptInvitation(token, displayName) {
    ensureSheets();
    const invite = REOS.Database.getAll(INVITES_SHEET).filter(function (i) { return i.Token === token && i.Status === 'Pending'; })[0];
    if (!invite) throw new Error('Valid invitation not found.');
    if (new Date(invite['Expires At']).getTime() < Date.now()) {
      REOS.Database.update(INVITES_SHEET, INVITE_ID_FIELD, invite[INVITE_ID_FIELD], { Status: 'Expired', 'Updated At': new Date() });
      throw new Error('Invitation expired.');
    }
    const account = REOS.Database.insert(ACCOUNTS_SHEET, {
      Email: invite.Email,
      'Display Name': displayName || invite.Email,
      'Portal Role': invite['Portal Role'],
      'Linked Entity Type': invite['Linked Entity Type'],
      'Linked Entity ID': invite['Linked Entity ID'],
      Status: 'Active',
      'Last Login At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: ACCOUNT_ID_FIELD, idPrefix: 'PACC' });
    REOS.Database.update(INVITES_SHEET, INVITE_ID_FIELD, invite[INVITE_ID_FIELD], { Status: 'Accepted', 'Accepted At': new Date(), 'Updated At': new Date() });
    logActivity_(account[ACCOUNT_ID_FIELD], 'Invitation Accepted', { inviteId: invite[INVITE_ID_FIELD] });
    return account;
  }

  function createSession(accountId) {
    ensureSheets();
    const account = REOS.Database.findById(ACCOUNTS_SHEET, ACCOUNT_ID_FIELD, accountId);
    if (!account || account.Status !== 'Active') throw new Error('Active portal account not found.');
    const token = Utilities.getUuid();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    REOS.Database.update(ACCOUNTS_SHEET, ACCOUNT_ID_FIELD, accountId, { 'Last Login At': new Date(), 'Updated At': new Date() });
    const session = REOS.Database.insert(SESSIONS_SHEET, {
      [ACCOUNT_ID_FIELD]: accountId,
      Token: token,
      Status: 'Active',
      'Expires At': expiresAt,
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: SESSION_ID_FIELD, idPrefix: 'PSES' });
    logActivity_(accountId, 'Session Created', { sessionId: session[SESSION_ID_FIELD] });
    return session;
  }

  function shareDocument(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    if (!record[ACCOUNT_ID_FIELD]) throw new Error('Portal Account ID is required.');
    if (!record['Document ID']) throw new Error('Document ID is required.');
    const share = REOS.Database.insert(SHARES_SHEET, {
      [ACCOUNT_ID_FIELD]: record[ACCOUNT_ID_FIELD],
      'Document ID': record['Document ID'],
      'Property ID': record['Property ID'] || '',
      'Access Level': record['Access Level'] || 'View',
      Status: 'Active',
      'Expires At': record['Expires At'] || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: SHARE_ID_FIELD, idPrefix: 'PSHR' });
    logActivity_(record[ACCOUNT_ID_FIELD], 'Document Shared', share);
    return share;
  }

  function createMessage(record) {
    ensureSheets();
    record = record || {};
    if (!record[ACCOUNT_ID_FIELD]) throw new Error('Portal Account ID is required.');
    const message = REOS.Database.insert(MESSAGES_SHEET, {
      [ACCOUNT_ID_FIELD]: record[ACCOUNT_ID_FIELD],
      Direction: record.Direction || 'Inbound',
      Subject: record.Subject || '',
      Body: record.Body || '',
      Status: record.Status || 'Open',
      'Related Type': record['Related Type'] || '',
      'Related ID': record['Related ID'] || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: MESSAGE_ID_FIELD, idPrefix: 'PMSG' });
    logActivity_(record[ACCOUNT_ID_FIELD], 'Message Created', message);
    return message;
  }

  function createTask(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    if (!record[ACCOUNT_ID_FIELD]) throw new Error('Portal Account ID is required.');
    const task = REOS.Database.insert(TASKS_SHEET, {
      [ACCOUNT_ID_FIELD]: record[ACCOUNT_ID_FIELD],
      Title: record.Title || '',
      Description: record.Description || '',
      Status: record.Status || 'Open',
      'Due Date': record['Due Date'] || '',
      'Related Type': record['Related Type'] || '',
      'Related ID': record['Related ID'] || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: TASK_ID_FIELD, idPrefix: 'PTSK' });
    logActivity_(record[ACCOUNT_ID_FIELD], 'Task Created', task);
    return task;
  }

  function getPortalDashboard(accountId) {
    ensureSheets();
    const account = REOS.Database.findById(ACCOUNTS_SHEET, ACCOUNT_ID_FIELD, accountId);
    if (!account) throw new Error('Portal account not found.');
    const shares = REOS.Database.getAll(SHARES_SHEET).filter(function (s) { return s[ACCOUNT_ID_FIELD] === accountId && s.Status === 'Active'; });
    const messages = REOS.Database.getAll(MESSAGES_SHEET).filter(function (m) { return m[ACCOUNT_ID_FIELD] === accountId; });
    const tasks = REOS.Database.getAll(TASKS_SHEET).filter(function (t) { return t[ACCOUNT_ID_FIELD] === accountId; });
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      account: account,
      kpis: {
        documents: shares.length,
        openMessages: messages.filter(function (m) { return m.Status !== 'Closed'; }).length,
        openTasks: tasks.filter(function (t) { return t.Status !== 'Completed'; }).length
      },
      roleDashboard: buildRoleDashboard_(account),
      documents: shares,
      messages: latest_(messages, 'Created At', 50),
      tasks: latest_(tasks, 'Created At', 50)
    };
  }

  function buildRoleDashboard_(account) {
    const role = account['Portal Role'];
    const linkedId = account['Linked Entity ID'];
    if (role === 'Investor') return investorDashboard_(linkedId);
    if (role === 'Lender') return lenderDashboard_(linkedId);
    if (role === 'Vendor') return vendorDashboard_(linkedId);
    return clientDashboard_(linkedId);
  }

  function investorDashboard_(linkedId) {
    const finance = REOS.FinanceDashboards && REOS.FinanceDashboards.getDashboard ? REOS.FinanceDashboards.getDashboard({}) : {};
    return { role: 'Investor', summary: 'Portfolio financial visibility', financeKpis: finance.kpis || {}, propertyPL: finance.propertyPL || [] };
  }

  function lenderDashboard_(linkedId) {
    return { role: 'Lender', summary: 'Loan and collateral visibility', properties: safeGetAll_('PROPERTIES').slice(0, 25), documents: safeGetAll_('DOCUMENTS').slice(0, 25) };
  }

  function clientDashboard_(linkedId) {
    return { role: 'Client', summary: 'Property and service status visibility', properties: safeGetAll_('PROPERTIES').filter(function (p) { return !linkedId || p['Client ID'] === linkedId || p['Property ID'] === linkedId; }).slice(0, 25), workOrders: safeGetAll_('WORK_ORDERS').slice(0, 25) };
  }

  function vendorDashboard_(linkedId) {
    return { role: 'Vendor', summary: 'Assigned work and payment visibility', workOrders: safeGetAll_('WORK_ORDERS').filter(function (w) { return !linkedId || w['Vendor ID'] === linkedId; }).slice(0, 25), payments: safeGetAll_('FIN_VENDOR_PAYMENTS').filter(function (p) { return !linkedId || p['Vendor ID'] === linkedId; }).slice(0, 25) };
  }

  function logActivity_(accountId, action, details) {
    try {
      return REOS.Database.insert(ACTIVITY_SHEET, {
        [ACCOUNT_ID_FIELD]: accountId || '',
        Action: action,
        'Details JSON': REOS.toJson_(details || {}),
        'Created At': new Date()
      }, { idField: ACTIVITY_ID_FIELD, idPrefix: 'PACT' });
    } catch (error) { return null; }
  }

  function safeGetAll_(sheetName) { try { return REOS.Database.getAll(sheetName); } catch (error) { return []; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 50); }

  return { ensureSheets: ensureSheets, getAdminDashboard: getAdminDashboard, createInvitation: createInvitation, acceptInvitation: acceptInvitation, createSession: createSession, shareDocument: shareDocument, createMessage: createMessage, createTask: createTask, getPortalDashboard: getPortalDashboard };
})();

function reosPortalEnsureSheets() { return REOS.PortalFoundation.ensureSheets(); }
function reosPortalAdminDashboard() { return REOS.PortalFoundation.getAdminDashboard(); }
function reosPortalCreateInvitation(record) { return REOS.PortalFoundation.createInvitation(record || {}); }
function reosPortalAcceptInvitation(token, displayName) { return REOS.PortalFoundation.acceptInvitation(token, displayName || ''); }
function reosPortalCreateSession(accountId) { return REOS.PortalFoundation.createSession(accountId); }
function reosPortalShareDocument(record) { return REOS.PortalFoundation.shareDocument(record || {}); }
function reosPortalCreateMessage(record) { return REOS.PortalFoundation.createMessage(record || {}); }
function reosPortalCreateTask(record) { return REOS.PortalFoundation.createTask(record || {}); }
function reosPortalDashboard(accountId) { return REOS.PortalFoundation.getPortalDashboard(accountId); }
function showPortalFoundation() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('PortalFoundationUI').setTitle('REOS Portal Foundation').setWidth(1200).setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Portal Foundation');
}

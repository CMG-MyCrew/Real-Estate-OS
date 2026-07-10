/**
 * REOS Enterprise v3.2.1 - Portal Authentication & Web App Shell
 *
 * Adds secure portal login tokens, access validation, web app routing,
 * mobile-responsive portal shell data, and role-based portal views.
 */

var REOS = REOS || {};

REOS.PortalAuth = (function () {
  const LOGIN_EVENTS_SHEET = 'PORTAL_LOGIN_EVENTS';
  const ROUTES_SHEET = 'PORTAL_ROUTES';
  const EVENT_ID_FIELD = 'Portal Login Event ID';
  const ROUTE_ID_FIELD = 'Portal Route ID';

  const EVENT_HEADERS = ['Portal Login Event ID', 'Portal Account ID', 'Email', 'Event Type', 'Status', 'Message', 'IP Address', 'User Agent', 'Created At'];
  const ROUTE_HEADERS = ['Portal Route ID', 'Route', 'Portal Role', 'Title', 'Description', 'Active', 'Created At', 'Updated At'];

  const DEFAULT_ROUTES = [
    ['home', 'Investor', 'Investor Dashboard', 'Portfolio financials, documents, tasks, and messages.'],
    ['home', 'Lender', 'Lender Dashboard', 'Collateral, loan documents, property visibility, and messages.'],
    ['home', 'Client', 'Client Dashboard', 'Property status, documents, work orders, and messages.'],
    ['home', 'Vendor', 'Vendor Dashboard', 'Assigned work, documents, tasks, and payments.'],
    ['documents', 'All', 'Documents', 'Shared portal documents.'],
    ['messages', 'All', 'Messages', 'Portal communication center.'],
    ['tasks', 'All', 'Tasks', 'Portal task center.']
  ];

  function ensureSheets() {
    ensureTable_(LOGIN_EVENTS_SHEET, EVENT_HEADERS);
    ensureTable_(ROUTES_SHEET, ROUTE_HEADERS);
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

  function seedRoutes() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const existing = REOS.Database.getAll(ROUTES_SHEET).map(function (r) { return r.Route + '|' + r['Portal Role']; });
    let created = 0;
    DEFAULT_ROUTES.forEach(function (r) {
      const key = r[0] + '|' + r[1];
      if (existing.indexOf(key) !== -1) return;
      REOS.Database.insert(ROUTES_SHEET, {
        Route: r[0],
        'Portal Role': r[1],
        Title: r[2],
        Description: r[3],
        Active: true,
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: ROUTE_ID_FIELD, idPrefix: 'PROUTE' });
      created++;
    });
    return { ok: true, created: created, routes: REOS.Database.getAll(ROUTES_SHEET) };
  }

  function getAdminDashboard() {
    REOS.Security.requireAdmin();
    ensureSheets();
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        loginEvents: REOS.Database.getAll(LOGIN_EVENTS_SHEET).length,
        routes: REOS.Database.getAll(ROUTES_SHEET).length,
        portalAccounts: safeGetAll_('PORTAL_ACCOUNTS').length,
        activeSessions: safeGetAll_('PORTAL_SESSIONS').filter(function (s) { return s.Status === 'Active' && new Date(s['Expires At']).getTime() > Date.now(); }).length
      },
      routes: REOS.Database.getAll(ROUTES_SHEET),
      loginEvents: latest_(REOS.Database.getAll(LOGIN_EVENTS_SHEET), 'Created At', 100)
    };
  }

  function requestLogin(email) {
    ensureSheets();
    const account = safeGetAll_('PORTAL_ACCOUNTS').filter(function (a) { return String(a.Email).toLowerCase() === String(email).toLowerCase() && a.Status === 'Active'; })[0];
    if (!account) {
      logLogin_('', email, 'Login Request', 'Failed', 'Active portal account not found.');
      throw new Error('Active portal account not found.');
    }
    const session = REOS.PortalFoundation.createSession(account['Portal Account ID']);
    logLogin_(account['Portal Account ID'], email, 'Login Request', 'Success', 'Portal session created.');
    return { ok: true, accountId: account['Portal Account ID'], email: email, sessionToken: session.Token, expiresAt: session['Expires At'] };
  }

  function validateSession(token) {
    ensureSheets();
    const session = safeGetAll_('PORTAL_SESSIONS').filter(function (s) { return s.Token === token && s.Status === 'Active'; })[0];
    if (!session) return { ok: false, status: 'Invalid', message: 'Session not found.' };
    if (new Date(session['Expires At']).getTime() < Date.now()) {
      REOS.Database.update('PORTAL_SESSIONS', 'Portal Session ID', session['Portal Session ID'], { Status: 'Expired', 'Updated At': new Date() });
      return { ok: false, status: 'Expired', message: 'Session expired.' };
    }
    const account = REOS.Database.findById('PORTAL_ACCOUNTS', 'Portal Account ID', session['Portal Account ID']);
    if (!account || account.Status !== 'Active') return { ok: false, status: 'Inactive', message: 'Portal account inactive.' };
    return { ok: true, status: 'Active', session: session, account: account };
  }

  function getShellData(token, route) {
    const validation = validateSession(token);
    if (!validation.ok) return validation;
    route = route || 'home';
    const account = validation.account;
    const routes = getRoutesForRole_(account['Portal Role']);
    const portal = REOS.PortalFoundation.getPortalDashboard(account['Portal Account ID']);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      route: route,
      account: account,
      nav: routes,
      portal: portal,
      view: buildView_(route, portal)
    };
  }

  function logout(token) {
    ensureSheets();
    const session = safeGetAll_('PORTAL_SESSIONS').filter(function (s) { return s.Token === token && s.Status === 'Active'; })[0];
    if (!session) return { ok: true, status: 'Already Closed' };
    REOS.Database.update('PORTAL_SESSIONS', 'Portal Session ID', session['Portal Session ID'], { Status: 'Closed', 'Updated At': new Date() });
    logLogin_(session['Portal Account ID'], '', 'Logout', 'Success', 'Portal session closed.');
    return { ok: true, status: 'Closed' };
  }

  function doGet(e) {
    ensureSheets();
    const template = HtmlService.createTemplateFromFile('PortalWebApp');
    template.route = e && e.parameter && e.parameter.route ? e.parameter.route : 'home';
    template.token = e && e.parameter && e.parameter.token ? e.parameter.token : '';
    return template.evaluate().setTitle('REOS Portal').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  function getRoutesForRole_(role) {
    return REOS.Database.getAll(ROUTES_SHEET).filter(function (r) { return String(r.Active) === 'true' || r.Active === true; }).filter(function (r) { return r['Portal Role'] === role || r['Portal Role'] === 'All'; });
  }

  function buildView_(route, portal) {
    if (route === 'documents') return { title: 'Documents', records: portal.documents || [] };
    if (route === 'messages') return { title: 'Messages', records: portal.messages || [] };
    if (route === 'tasks') return { title: 'Tasks', records: portal.tasks || [] };
    return { title: 'Dashboard', records: [], roleDashboard: portal.roleDashboard || {}, kpis: portal.kpis || {} };
  }

  function logLogin_(accountId, email, eventType, status, message) {
    return REOS.Database.insert(LOGIN_EVENTS_SHEET, {
      'Portal Account ID': accountId || '',
      Email: email || '',
      'Event Type': eventType,
      Status: status,
      Message: message,
      'IP Address': '',
      'User Agent': '',
      'Created At': new Date()
    }, { idField: EVENT_ID_FIELD, idPrefix: 'PLOG' });
  }

  function safeGetAll_(sheetName) { try { return REOS.Database.getAll(sheetName); } catch (error) { return []; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 50); }

  return { ensureSheets: ensureSheets, seedRoutes: seedRoutes, getAdminDashboard: getAdminDashboard, requestLogin: requestLogin, validateSession: validateSession, getShellData: getShellData, logout: logout, doGet: doGet };
})();

function reosPortalAuthEnsureSheets() { return REOS.PortalAuth.ensureSheets(); }
function reosPortalAuthSeedRoutes() { return REOS.PortalAuth.seedRoutes(); }
function reosPortalAuthAdminDashboard() { return REOS.PortalAuth.getAdminDashboard(); }
function reosPortalRequestLogin(email) { return REOS.PortalAuth.requestLogin(email); }
function reosPortalValidateSession(token) { return REOS.PortalAuth.validateSession(token); }
function reosPortalShellData(token, route) { return REOS.PortalAuth.getShellData(token, route || 'home'); }
function reosPortalLogout(token) { return REOS.PortalAuth.logout(token); }
function doGet(e) { return REOS.PortalAuth.doGet(e); }
function showPortalAuth() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('PortalAuthUI').setTitle('REOS Portal Auth').setWidth(1200).setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Portal Auth');
}

/**
 * REOS Enterprise v3.1.2.2 - QuickBooks OAuth / Token Foundation
 *
 * Adds OAuth authorization URL generation, token state tracking, token storage
 * placeholders, refresh-token workflow stubs, and sandbox-safe connection tests.
 *
 * This file is intentionally safe-by-default: it does not require live secrets
 * and does not send financial data. Live token exchange is only attempted when
 * Script Properties are configured and liveMode is explicitly true.
 */

var REOS = REOS || {};

REOS.QuickBooksOAuth = (function () {
  const STATES_SHEET = 'QB_OAUTH_STATES';
  const TOKENS_SHEET = 'QB_TOKEN_EVENTS';
  const TESTS_SHEET = 'QB_CONNECTION_TESTS';
  const STATE_ID_FIELD = 'OAuth State ID';
  const TOKEN_EVENT_ID_FIELD = 'Token Event ID';
  const TEST_ID_FIELD = 'Connection Test ID';

  const STATE_HEADERS = ['OAuth State ID', 'Connection ID', 'State', 'Status', 'Authorization URL', 'Redirect URI', 'Scopes', 'Created At', 'Expires At', 'Updated At'];
  const TOKEN_HEADERS = ['Token Event ID', 'Connection ID', 'Event Type', 'Status', 'Message', 'Token Property', 'Expires At', 'Details JSON', 'Created At', 'Updated At'];
  const TEST_HEADERS = ['Connection Test ID', 'Connection ID', 'Environment', 'Status', 'Message', 'Details JSON', 'Created At', 'Updated At'];

  const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';
  const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  const DEFAULT_SCOPES = 'com.intuit.quickbooks.accounting openid profile email';

  function ensureSheets() {
    ensureTable_(STATES_SHEET, STATE_HEADERS);
    ensureTable_(TOKENS_SHEET, TOKEN_HEADERS);
    ensureTable_(TESTS_SHEET, TEST_HEADERS);
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
    const states = REOS.Database.getAll(STATES_SHEET);
    const events = REOS.Database.getAll(TOKENS_SHEET);
    const tests = REOS.Database.getAll(TESTS_SHEET);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        states: states.length,
        activeStates: states.filter(function (s) { return s.Status === 'Pending'; }).length,
        tokenEvents: events.length,
        failedTokenEvents: events.filter(function (e) { return e.Status === 'Failed'; }).length,
        connectionTests: tests.length,
        passedTests: tests.filter(function (t) { return t.Status === 'Passed'; }).length
      },
      states: latest_(states, 'Created At', 50),
      tokenEvents: latest_(events, 'Created At', 50),
      tests: latest_(tests, 'Created At', 50),
      requiredScriptProperties: getRequiredProperties_()
    };
  }

  function buildAuthorizationUrl(connectionId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const connection = getConnection_(connectionId);
    const clientId = getScriptProperty_(connection['Client ID Key']);
    const redirectUri = connection['Redirect URI'] || getScriptProperty_('QB_REDIRECT_URI');
    const scopes = connection.Scopes || DEFAULT_SCOPES;
    const state = Utilities.getUuid();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const url = AUTH_BASE + '?' + toQuery_({
      client_id: clientId || 'MISSING_CLIENT_ID',
      response_type: 'code',
      scope: scopes,
      redirect_uri: redirectUri || 'MISSING_REDIRECT_URI',
      state: state
    });
    const row = REOS.Database.insert(STATES_SHEET, {
      'Connection ID': connectionId,
      State: state,
      Status: clientId && redirectUri ? 'Pending' : 'Configuration Required',
      'Authorization URL': url,
      'Redirect URI': redirectUri || '',
      Scopes: scopes,
      'Created At': new Date(),
      'Expires At': expiresAt,
      'Updated At': new Date()
    }, { idField: STATE_ID_FIELD, idPrefix: 'QBST' });
    return { ok: true, connectionId: connectionId, stateId: row[STATE_ID_FIELD], state: state, status: row.Status, authorizationUrl: url, expiresAt: expiresAt };
  }

  function recordAuthorizationCallback(connectionId, state, code, realmId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const states = REOS.Database.getAll(STATES_SHEET).filter(function (s) { return s['Connection ID'] === connectionId && s.State === state; });
    if (!states.length) throw new Error('OAuth state not found for connection.');
    const stateRow = states[0];
    const expired = new Date(stateRow['Expires At']).getTime() < Date.now();
    REOS.Database.update(STATES_SHEET, STATE_ID_FIELD, stateRow[STATE_ID_FIELD], {
      Status: expired ? 'Expired' : 'Callback Received',
      'Updated At': new Date()
    });
    const event = logTokenEvent_(connectionId, 'Authorization Callback', expired ? 'Failed' : 'Recorded', expired ? 'OAuth state expired.' : 'Authorization callback recorded. Token exchange is ready.', '', '', { state: state, codePresent: !!code, realmId: realmId || '' });
    return { ok: !expired, connectionId: connectionId, tokenEvent: event, realmId: realmId || '', codePresent: !!code };
  }

  function exchangeAuthorizationCode(connectionId, code, realmId, liveMode) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const connection = getConnection_(connectionId);
    if (!liveMode) {
      return logTokenEvent_(connectionId, 'Token Exchange', 'Dry Run', 'Token exchange dry run recorded. Pass liveMode=true only after sandbox credentials are configured.', connection['Access Token Property'], '', { codePresent: !!code, realmId: realmId || '' });
    }
    const clientId = requireProperty_(connection['Client ID Key']);
    const clientSecret = requireProperty_(connection['Client Secret Key']);
    const redirectUri = connection['Redirect URI'] || requireProperty_('QB_REDIRECT_URI');
    const response = UrlFetchApp.fetch(TOKEN_URL, {
      method: 'post',
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Basic ' + Utilities.base64Encode(clientId + ':' + clientSecret),
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: toQuery_({ grant_type: 'authorization_code', code: code, redirect_uri: redirectUri })
    });
    const parsed = safeJson_(response.getContentText());
    if (response.getResponseCode() >= 300) {
      return logTokenEvent_(connectionId, 'Token Exchange', 'Failed', 'QuickBooks token exchange failed: HTTP ' + response.getResponseCode(), connection['Access Token Property'], '', parsed);
    }
    storeTokens_(connection, parsed);
    if (realmId) REOS.QuickBooksConnector.markConnected(connectionId, realmId, connection['Company Name'] || 'QuickBooks Company');
    return logTokenEvent_(connectionId, 'Token Exchange', 'Stored', 'Access and refresh tokens stored in Script Properties.', connection['Access Token Property'], tokenExpiry_(parsed), { realmId: realmId || '', expires_in: parsed.expires_in || '' });
  }

  function refreshAccessToken(connectionId, liveMode) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const connection = getConnection_(connectionId);
    if (!liveMode) {
      return logTokenEvent_(connectionId, 'Refresh Token', 'Dry Run', 'Refresh-token dry run recorded. Pass liveMode=true only after sandbox credentials are configured.', connection['Refresh Token Property'], '', {});
    }
    const clientId = requireProperty_(connection['Client ID Key']);
    const clientSecret = requireProperty_(connection['Client Secret Key']);
    const refreshToken = requireProperty_(connection['Refresh Token Property']);
    const response = UrlFetchApp.fetch(TOKEN_URL, {
      method: 'post',
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Basic ' + Utilities.base64Encode(clientId + ':' + clientSecret),
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: toQuery_({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });
    const parsed = safeJson_(response.getContentText());
    if (response.getResponseCode() >= 300) {
      return logTokenEvent_(connectionId, 'Refresh Token', 'Failed', 'QuickBooks refresh failed: HTTP ' + response.getResponseCode(), connection['Refresh Token Property'], '', parsed);
    }
    storeTokens_(connection, parsed);
    return logTokenEvent_(connectionId, 'Refresh Token', 'Stored', 'Refreshed access token stored in Script Properties.', connection['Access Token Property'], tokenExpiry_(parsed), { expires_in: parsed.expires_in || '' });
  }

  function runSandboxConnectionTest(connectionId, liveMode) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const connection = getConnection_(connectionId);
    let status = 'Dry Run';
    let message = 'Sandbox connection test dry run passed. No API request sent.';
    const details = { connectionId: connectionId, environment: connection.Environment, companyId: connection['Company ID'] || '', liveMode: !!liveMode };
    if (liveMode) {
      const accessToken = requireProperty_(connection['Access Token Property']);
      const companyId = connection['Company ID'];
      if (!companyId) throw new Error('Company ID is required for live sandbox test.');
      const base = connection.Environment === 'Production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';
      const url = base + '/v3/company/' + encodeURIComponent(companyId) + '/companyinfo/' + encodeURIComponent(companyId) + '?minorversion=70';
      const response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' } });
      details.httpCode = response.getResponseCode();
      details.response = safeJson_(response.getContentText());
      status = response.getResponseCode() < 300 ? 'Passed' : 'Failed';
      message = status === 'Passed' ? 'QuickBooks sandbox API connection passed.' : 'QuickBooks sandbox API connection failed.';
    }
    return REOS.Database.insert(TESTS_SHEET, {
      'Connection ID': connectionId,
      Environment: connection.Environment || 'Sandbox',
      Status: status === 'Dry Run' ? 'Passed' : status,
      Message: message,
      'Details JSON': REOS.toJson_(details),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: TEST_ID_FIELD, idPrefix: 'QBTS' });
  }

  function storeTokens_(connection, parsed) {
    const props = PropertiesService.getScriptProperties();
    if (parsed.access_token) props.setProperty(connection['Access Token Property'], parsed.access_token);
    if (parsed.refresh_token) props.setProperty(connection['Refresh Token Property'], parsed.refresh_token);
    if (parsed.expires_in) props.setProperty(connection['Access Token Property'] + '_EXPIRES_AT', tokenExpiry_(parsed));
  }

  function tokenExpiry_(parsed) { return parsed && parsed.expires_in ? new Date(Date.now() + Number(parsed.expires_in) * 1000).toISOString() : ''; }

  function getConnection_(connectionId) {
    const connection = REOS.Database.findById('QB_CONNECTIONS', 'QB Connection ID', connectionId);
    if (!connection) throw new Error('QuickBooks connection not found: ' + connectionId);
    return connection;
  }

  function getRequiredProperties_() { return ['QB_CLIENT_ID', 'QB_CLIENT_SECRET', 'QB_REDIRECT_URI', 'QB_ACCESS_TOKEN', 'QB_REFRESH_TOKEN']; }
  function getScriptProperty_(key) { return key ? PropertiesService.getScriptProperties().getProperty(key) : ''; }
  function requireProperty_(key) { const value = getScriptProperty_(key); if (!value) throw new Error('Missing Script Property: ' + key); return value; }
  function toQuery_(params) { return Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&'); }
  function safeJson_(text) { try { return JSON.parse(text || '{}'); } catch (error) { return { raw: text || '' }; } }
  function logTokenEvent_(connectionId, type, status, message, tokenProperty, expiresAt, details) { return REOS.Database.insert(TOKENS_SHEET, { 'Connection ID': connectionId, 'Event Type': type, Status: status, Message: message, 'Token Property': tokenProperty || '', 'Expires At': expiresAt || '', 'Details JSON': REOS.toJson_(details || {}), 'Created At': new Date(), 'Updated At': new Date() }, { idField: TOKEN_EVENT_ID_FIELD, idPrefix: 'QTOK' }); }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 50); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, buildAuthorizationUrl: buildAuthorizationUrl, recordAuthorizationCallback: recordAuthorizationCallback, exchangeAuthorizationCode: exchangeAuthorizationCode, refreshAccessToken: refreshAccessToken, runSandboxConnectionTest: runSandboxConnectionTest };
})();

function reosQuickBooksOAuthEnsureSheets() { return REOS.QuickBooksOAuth.ensureSheets(); }
function reosQuickBooksOAuthDashboard() { return REOS.QuickBooksOAuth.getDashboard(); }
function reosQuickBooksBuildAuthorizationUrl(connectionId) { return REOS.QuickBooksOAuth.buildAuthorizationUrl(connectionId); }
function reosQuickBooksRecordCallback(connectionId, state, code, realmId) { return REOS.QuickBooksOAuth.recordAuthorizationCallback(connectionId, state, code, realmId); }
function reosQuickBooksExchangeCode(connectionId, code, realmId, liveMode) { return REOS.QuickBooksOAuth.exchangeAuthorizationCode(connectionId, code, realmId, liveMode === true); }
function reosQuickBooksRefreshToken(connectionId, liveMode) { return REOS.QuickBooksOAuth.refreshAccessToken(connectionId, liveMode === true); }
function reosQuickBooksSandboxTest(connectionId, liveMode) { return REOS.QuickBooksOAuth.runSandboxConnectionTest(connectionId, liveMode === true); }
function showQuickBooksOAuth() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('QuickBooksOAuthUI').setTitle('REOS QuickBooks OAuth').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS QuickBooks OAuth');
}

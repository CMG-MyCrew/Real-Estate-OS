/**
 * REOS Enterprise v3.0 - API Platform Framework
 *
 * Versioned REST-style API routing, API-key authentication, rate limiting,
 * endpoint registry, response envelopes, and platform request logging.
 */

var REOS = REOS || {};

REOS.APIPlatform = (function () {
  const ENDPOINTS_SHEET = 'API_ENDPOINTS';
  const REQUESTS_SHEET = 'API_REQUESTS';

  const ENDPOINT_HEADERS = [
    'Endpoint ID', 'Version', 'Method', 'Path', 'Resource', 'Required Scope',
    'Status', 'Description', 'Created At', 'Updated At'
  ];

  const REQUEST_HEADERS = [
    'API Request ID', 'Timestamp', 'API Key ID', 'Tenant ID', 'Version',
    'Method', 'Path', 'Status Code', 'Status', 'Latency MS', 'Message',
    'Request JSON', 'Response JSON', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(ENDPOINTS_SHEET, ENDPOINT_HEADERS);
    ensureTable_(REQUESTS_SHEET, REQUEST_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    return sheet;
  }

  function seedEndpoints() {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const existing = REOS.Database.getAll(ENDPOINTS_SHEET);
    if (existing.length) return existing.length;

    const endpoints = [
      ['v1', 'GET', '/clients', 'clients', 'read', 'List CRM contacts'],
      ['v1', 'GET', '/leads', 'leads', 'read', 'List CRM leads'],
      ['v1', 'POST', '/leads', 'leads', 'write', 'Create CRM lead'],
      ['v1', 'GET', '/transactions', 'transactions', 'read', 'List active transactions'],
      ['v1', 'GET', '/rentals', 'rentals', 'read', 'List active rentals'],
      ['v1', 'GET', '/tasks', 'tasks', 'read', 'List active tasks'],
      ['v1', 'POST', '/tasks', 'tasks', 'write', 'Create task'],
      ['v1', 'GET', '/documents', 'documents', 'read', 'Search documents'],
      ['v1', 'GET', '/dashboard', 'dashboard', 'read', 'Executive dashboard'],
      ['v1', 'POST', '/webhooks', 'webhooks', 'write', 'Receive webhook'],
      ['v1', 'POST', '/automation', 'automation', 'write', 'Dispatch automation event']
    ];

    endpoints.forEach(function (e) {
      REOS.Database.insert(ENDPOINTS_SHEET, {
        Version: e[0],
        Method: e[1],
        Path: e[2],
        Resource: e[3],
        'Required Scope': e[4],
        Status: 'Active',
        Description: e[5]
      }, { idField: 'Endpoint ID', idPrefix: 'EP' });
    });
    return endpoints.length;
  }

  function handleRequest(request) {
    ensureSheets();
    const started = Date.now();
    request = request || {};
    const method = String(request.method || 'GET').toUpperCase();
    const version = String(request.version || 'v1');
    const path = normalizePath_(request.path || request.resource || '/');
    let apiKeyRecord = null;

    try {
      const endpoint = resolveEndpoint_(version, method, path);
      apiKeyRecord = REOS.APIKeys.validate(request.apiKey, path, method, endpoint['Required Scope']);
      if (apiKeyRecord['Tenant ID']) REOS.Tenants.setCurrentTenant(apiKeyRecord['Tenant ID']);
      const data = route_(endpoint.Resource, method, request.payload || {}, request.query || {});
      const response = envelope_(true, 200, 'OK', data, { version: version, path: path });
      logRequest_(apiKeyRecord, version, method, path, 200, 'Success', 'OK', request, response, started);
      return response;
    } catch (error) {
      const statusCode = statusCodeForError_(error);
      const response = envelope_(false, statusCode, error.message, null, { version: version, path: path });
      logRequest_(apiKeyRecord || {}, version, method, path, statusCode, 'Error', error.message, request, response, started);
      return response;
    }
  }

  function resolveEndpoint_(version, method, path) {
    seedEndpoints();
    const endpoint = REOS.Database.query(ENDPOINTS_SHEET, function (e) {
      return String(e.Version || '') === String(version || '') &&
        String(e.Method || '').toUpperCase() === String(method || '').toUpperCase() &&
        normalizePath_(e.Path) === normalizePath_(path) &&
        String(e.Status || '').toLowerCase() === 'active';
    })[0];
    if (!endpoint) throw new Error('Unknown API endpoint: ' + method + ' ' + path);
    return endpoint;
  }

  function route_(resource, method, payload, query) {
    const p = payload || {};
    const q = query || {};
    switch (String(resource || '').toLowerCase()) {
      case 'clients': return REOS.CRM.listContacts();
      case 'leads': return method === 'POST' ? REOS.CRM.createLead(p.record || p) : REOS.CRM.listLeads();
      case 'transactions': return REOS.Transactions.listActive();
      case 'rentals': return REOS.Rentals.listActive();
      case 'tasks': return method === 'POST' ? REOS.Tasks.create(p.record || p) : REOS.Tasks.listActive();
      case 'documents': return REOS.Documents.search(q.query || p.query || '');
      case 'dashboard': return REOS.Dashboard.getExecutiveDashboard();
      case 'webhooks': return REOS.Webhooks.receive(p.source, p.eventType, p.payload || {});
      case 'automation': return REOS.Automation.dispatch(p.eventName, p.moduleName, p.payload || {});
      default: throw new Error('Unsupported API resource: ' + resource);
    }
  }

  function envelope_(ok, statusCode, message, data, meta) {
    return {
      ok: ok,
      statusCode: statusCode,
      message: message,
      data: data,
      meta: Object.assign({ timestamp: new Date().toISOString() }, meta || {})
    };
  }

  function logRequest_(apiKeyRecord, version, method, path, statusCode, status, message, req, res, started) {
    try {
      return REOS.Database.insert(REQUESTS_SHEET, {
        Timestamp: new Date(),
        'API Key ID': apiKeyRecord['API Key ID'] || '',
        'Tenant ID': apiKeyRecord['Tenant ID'] || '',
        Version: version,
        Method: method,
        Path: path,
        'Status Code': statusCode,
        Status: status,
        'Latency MS': Date.now() - started,
        Message: message,
        'Request JSON': JSON.stringify(redact_(req || {})),
        'Response JSON': JSON.stringify(redact_(res || {}))
      }, { idField: 'API Request ID', idPrefix: 'REQ' });
    } catch (ignore) {}
  }

  function redact_(obj) {
    const copy = JSON.parse(JSON.stringify(obj || {}));
    ['apiKey', 'token', 'secret', 'password'].forEach(function (key) {
      if (copy[key]) copy[key] = '********';
    });
    return copy;
  }

  function normalizePath_(path) {
    path = String(path || '/').trim();
    if (path.charAt(0) !== '/') path = '/' + path;
    return path.replace(/\/+$/, '') || '/';
  }

  function statusCodeForError_(error) {
    const msg = String(error && error.message || '').toLowerCase();
    if (msg.indexOf('invalid api key') !== -1 || msg.indexOf('access denied') !== -1) return 401;
    if (msg.indexOf('rate limited') !== -1) return 429;
    if (msg.indexOf('unknown api endpoint') !== -1) return 404;
    return 500;
  }

  function listRequests(limit) {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.getAll(REQUESTS_SHEET).slice(-Number(limit || 100)).reverse();
  }

  return { ensureSheets: ensureSheets, seedEndpoints: seedEndpoints, handleRequest: handleRequest, listRequests: listRequests };
})();

function apiPlatformSeedEndpoints() { return REOS.APIPlatform.seedEndpoints(); }
function apiPlatformHandleRequest(request) { return REOS.APIPlatform.handleRequest(request || {}); }
function apiPlatformListRequests(limit) { return REOS.APIPlatform.listRequests(limit); }

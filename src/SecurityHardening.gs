/**
 * REOS Enterprise v3.0 - Enterprise Security Hardening Framework
 *
 * Centralized security policy, row-level access checks, API key validation,
 * secret hygiene, session checks, and security event routing.
 */

var REOS = REOS || {};

REOS.SecurityHardening = (function () {
  const POLICY_SHEET = 'SECURITY_POLICIES';
  const EVENTS_SHEET = 'SECURITY_EVENTS';

  const POLICY_HEADERS = [
    'Policy ID', 'Policy Name', 'Category', 'Severity', 'Enabled', 'Config JSON',
    'Description', 'Created At', 'Updated At'
  ];

  const EVENT_HEADERS = [
    'Security Event ID', 'Timestamp', 'Severity', 'Category', 'User Email',
    'Tenant ID', 'Action', 'Resource', 'Record ID', 'Status', 'Message',
    'Details JSON', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(POLICY_SHEET, POLICY_HEADERS);
    ensureTable_(EVENTS_SHEET, EVENT_HEADERS);
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

  function seedPolicies() {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const existing = REOS.Database.getAll(POLICY_SHEET);
    if (existing.length) return existing.length;

    const policies = [
      ['Tenant Isolation Required', 'Tenant Isolation', 'Critical', true, { enforceTenantId: true }],
      ['API Key Required', 'API Security', 'High', true, { requireApiKey: true }],
      ['Audit All Writes', 'Audit', 'High', true, { auditWrites: true }],
      ['Block Public Secrets', 'Secrets', 'Critical', true, { blockPatterns: ['API_KEY=', 'SECRET=', 'TOKEN='] }],
      ['Session Timeout', 'Sessions', 'Medium', true, { timeoutMinutes: 120 }]
    ];

    policies.forEach(function (p) {
      REOS.Database.insert(POLICY_SHEET, {
        'Policy Name': p[0],
        Category: p[1],
        Severity: p[2],
        Enabled: p[3],
        'Config JSON': JSON.stringify(p[4]),
        Description: p[0]
      }, { idField: 'Policy ID', idPrefix: 'POL' });
    });

    return policies.length;
  }

  function requireRowAccess(record, action) {
    ensureSheets();
    record = record || {};
    const tenantId = REOS.Tenants && REOS.Tenants.getCurrentTenantId ? REOS.Tenants.getCurrentTenantId() : '';
    if (record['Tenant ID'] && tenantId && String(record['Tenant ID']) !== String(tenantId)) {
      logEvent('Critical', 'Tenant Isolation', action || 'rowAccess', 'Record', record.ID || record['Record ID'] || '', 'Denied', 'Tenant boundary violation.', { recordTenantId: record['Tenant ID'], currentTenantId: tenantId });
      throw new Error('Access denied: tenant boundary violation.');
    }
    return true;
  }

  function validateApiKey(apiKey, scope) {
    const expected = REOS.getProperty_('REOS_API_KEY');
    if (expected && apiKey !== expected) {
      logEvent('High', 'API Security', 'validateApiKey', scope || 'API', '', 'Denied', 'Invalid API key.', {});
      throw new Error('Invalid API key.');
    }
    return true;
  }

  function validateSession() {
    const email = REOS.Security.getCurrentUserEmail();
    if (!email) {
      logEvent('High', 'Sessions', 'validateSession', 'Session', '', 'Denied', 'Missing user email.', {});
      throw new Error('Session validation failed.');
    }
    return { email: email, tenantId: REOS.Tenants && REOS.Tenants.getCurrentTenantId ? REOS.Tenants.getCurrentTenantId() : '' };
  }

  function scanSecretText(text) {
    text = String(text || '');
    const patterns = [/AIza[0-9A-Za-z\-_]{20,}/, /sk-[A-Za-z0-9_\-]{20,}/, /SECRET\s*=/i, /TOKEN\s*=/i, /PRIVATE_KEY/i];
    const matches = patterns.filter(function (pattern) { return pattern.test(text); }).map(String);
    if (matches.length) {
      logEvent('Critical', 'Secrets', 'scanSecretText', 'Text', '', 'Detected', 'Possible secret detected.', { matches: matches });
    }
    return { ok: matches.length === 0, matches: matches };
  }

  function logEvent(severity, category, action, resource, recordId, status, message, details) {
    ensureSheets();
    const row = REOS.Database.insert(EVENTS_SHEET, {
      Timestamp: new Date(),
      Severity: severity || 'Medium',
      Category: category || 'Security',
      'User Email': safeEmail_(),
      'Tenant ID': REOS.Tenants && REOS.Tenants.getCurrentTenantId ? REOS.Tenants.getCurrentTenantId() : '',
      Action: action || '',
      Resource: resource || '',
      'Record ID': recordId || '',
      Status: status || '',
      Message: message || '',
      'Details JSON': JSON.stringify(details || {})
    }, { idField: 'Security Event ID', idPrefix: 'SEV' });

    if (String(severity || '').toLowerCase() === 'critical') {
      try {
        REOS.Monitoring.openIncident({
          Severity: 'Critical',
          Module: 'Security',
          Title: category + ': ' + action,
          Description: message || 'Critical security event.',
          Owner: safeEmail_()
        });
      } catch (ignore) {}
    }
    return row;
  }

  function listEvents(limit) {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.getAll(EVENTS_SHEET).slice(-Number(limit || 100)).reverse();
  }

  function dashboard() {
    const events = listEvents(100);
    return {
      totalEvents: events.length,
      criticalCount: events.filter(function (e) { return e.Severity === 'Critical'; }).length,
      deniedCount: events.filter(function (e) { return e.Status === 'Denied'; }).length,
      recentEvents: events.slice(0, 25),
      policies: REOS.Database.getAll(POLICY_SHEET)
    };
  }

  function safeEmail_() {
    try { return REOS.Security.getCurrentUserEmail(); } catch (error) { return ''; }
  }

  return {
    ensureSheets: ensureSheets,
    seedPolicies: seedPolicies,
    requireRowAccess: requireRowAccess,
    validateApiKey: validateApiKey,
    validateSession: validateSession,
    scanSecretText: scanSecretText,
    logEvent: logEvent,
    listEvents: listEvents,
    dashboard: dashboard
  };
})();

function securitySeedPolicies() { return REOS.SecurityHardening.seedPolicies(); }
function securityDashboard() { return REOS.SecurityHardening.dashboard(); }
function securityListEvents(limit) { return REOS.SecurityHardening.listEvents(limit); }
function securityScanSecretText(text) { return REOS.SecurityHardening.scanSecretText(text); }

/**
 * REOS Enterprise v3.2.10 - Integration Monitor
 * Sprint 3 Increment 4
 *
 * Tracks integration readiness, credential presence, service availability,
 * last sync metadata, latency, and health status without calling paid/third-party APIs.
 */

var REOS = REOS || {};

REOS.IntegrationMonitor = (function () {
  const STATUS_SHEET = 'INTEGRATION_STATUS';
  const HISTORY_SHEET = 'INTEGRATION_HISTORY';

  const STATUS_HEADERS = ['Integration Key', 'Name', 'Category', 'Enabled', 'Status', 'Auth Status', 'Last Checked At', 'Latency Ms', 'Last Success At', 'Last Failure At', 'Message', 'Details JSON'];
  const HISTORY_HEADERS = ['Integration Check ID', 'Integration Key', 'Name', 'Status', 'Auth Status', 'Latency Ms', 'Message', 'Details JSON', 'Created At'];

  const DEFINITIONS = [
    { key: 'googleDrive', name: 'Google Drive', category: 'Google Workspace', enabled: true, service: 'DriveApp', requiredProperties: [] },
    { key: 'gmail', name: 'Gmail', category: 'Google Workspace', enabled: false, service: 'GmailApp', requiredProperties: [] },
    { key: 'calendar', name: 'Google Calendar', category: 'Google Workspace', enabled: false, service: 'CalendarApp', requiredProperties: [] },
    { key: 'quickBooks', name: 'QuickBooks', category: 'Accounting', enabled: true, service: 'UrlFetchApp', requiredProperties: ['QB_CLIENT_ID', 'QB_CLIENT_SECRET', 'QB_REALM_ID'] },
    { key: 'stripe', name: 'Stripe', category: 'Payments', enabled: false, service: 'UrlFetchApp', requiredProperties: ['STRIPE_SECRET_KEY'] },
    { key: 'docusign', name: 'DocuSign', category: 'E-Signature', enabled: false, service: 'UrlFetchApp', requiredProperties: ['DOCUSIGN_INTEGRATION_KEY'] },
    { key: 'twilio', name: 'Twilio', category: 'Communications', enabled: false, service: 'UrlFetchApp', requiredProperties: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] },
    { key: 'ringCentral', name: 'RingCentral', category: 'Communications', enabled: false, service: 'UrlFetchApp', requiredProperties: ['RINGCENTRAL_CLIENT_ID', 'RINGCENTRAL_CLIENT_SECRET'] },
    { key: 'zapier', name: 'Zapier', category: 'Automation', enabled: false, service: 'UrlFetchApp', requiredProperties: ['ZAPIER_WEBHOOK_URL'] }
  ];

  function ensureSheets() {
    REOS.Database.ensureTable(STATUS_SHEET, STATUS_HEADERS);
    REOS.Database.ensureTable(HISTORY_SHEET, HISTORY_HEADERS);
  }

  function run() {
    ensureSheets();
    const started = Date.now();
    const results = DEFINITIONS.map(checkIntegration_);
    persistStatus_(results);
    persistHistory_(results);
    const failed = results.filter(function (r) { return r.status === 'Fail'; });
    const warnings = results.filter(function (r) { return r.status === 'Warn'; });
    return {
      ok: failed.length === 0,
      version: getVersion_(),
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      total: results.length,
      ready: results.filter(function (r) { return r.status === 'Ready'; }).length,
      warnings: warnings.length,
      failures: failed.length,
      integrations: results
    };
  }

  function checkIntegration_(definition) {
    const started = Date.now();
    const props = PropertiesService.getScriptProperties();
    const missingProperties = (definition.requiredProperties || []).filter(function (key) { return !props.getProperty(key); });
    const serviceAvailable = isServiceAvailable_(definition.service);
    let status = 'Ready';
    let authStatus = 'Available';
    let message = 'Integration checks passed.';

    if (!definition.enabled) {
      status = 'Disabled';
      authStatus = 'Not Required';
      message = 'Integration is disabled by default.';
    } else if (!serviceAvailable) {
      status = 'Fail';
      authStatus = 'Service Unavailable';
      message = definition.service + ' is unavailable or not authorized.';
    } else if (missingProperties.length) {
      status = 'Warn';
      authStatus = 'Missing Credentials';
      message = 'Missing required script properties: ' + missingProperties.join(', ');
    }

    return {
      key: definition.key,
      name: definition.name,
      category: definition.category,
      enabled: definition.enabled,
      status: status,
      authStatus: authStatus,
      latencyMs: Date.now() - started,
      message: message,
      details: {
        service: definition.service,
        serviceAvailable: serviceAvailable,
        requiredProperties: definition.requiredProperties || [],
        missingProperties: missingProperties
      }
    };
  }

  function persistStatus_(results) {
    clearBody_(STATUS_SHEET);
    results.forEach(function (result) {
      REOS.Database.insert(STATUS_SHEET, {
        'Integration Key': result.key,
        Name: result.name,
        Category: result.category,
        Enabled: result.enabled,
        Status: result.status,
        'Auth Status': result.authStatus,
        'Last Checked At': new Date(),
        'Latency Ms': result.latencyMs,
        'Last Success At': result.status === 'Ready' ? new Date() : '',
        'Last Failure At': result.status === 'Fail' ? new Date() : '',
        Message: result.message,
        'Details JSON': REOS.toJson_(result.details)
      }, {});
    });
  }

  function persistHistory_(results) {
    results.forEach(function (result) {
      REOS.Database.insert(HISTORY_SHEET, {
        'Integration Key': result.key,
        Name: result.name,
        Status: result.status,
        'Auth Status': result.authStatus,
        'Latency Ms': result.latencyMs,
        Message: result.message,
        'Details JSON': REOS.toJson_(result.details),
        'Created At': new Date()
      }, { idField: 'Integration Check ID', idPrefix: 'ICHK' });
    });
  }

  function summary() {
    ensureSheets();
    const rows = REOS.Database.getAll(STATUS_SHEET);
    return {
      ok: rows.filter(function (r) { return r.Status === 'Fail'; }).length === 0,
      generatedAt: new Date().toISOString(),
      total: rows.length,
      ready: rows.filter(function (r) { return r.Status === 'Ready'; }).length,
      warnings: rows.filter(function (r) { return r.Status === 'Warn'; }).length,
      disabled: rows.filter(function (r) { return r.Status === 'Disabled'; }).length,
      failures: rows.filter(function (r) { return r.Status === 'Fail'; }).length,
      integrations: rows
    };
  }

  function setEnabled(key, enabled) {
    const def = DEFINITIONS.filter(function (item) { return item.key === key; })[0];
    if (!def) throw new Error('Unknown integration: ' + key);
    def.enabled = !!enabled;
    return checkIntegration_(def);
  }

  function isServiceAvailable_(serviceName) {
    try {
      if (serviceName === 'DriveApp') { DriveApp.getRootFolder().getName(); return true; }
      if (serviceName === 'GmailApp') return typeof GmailApp !== 'undefined';
      if (serviceName === 'CalendarApp') return typeof CalendarApp !== 'undefined';
      if (serviceName === 'UrlFetchApp') return typeof UrlFetchApp !== 'undefined';
      return true;
    } catch (error) {
      return false;
    }
  }

  function clearBody_(sheetName) {
    const sheet = REOS.Database.getSheet(sheetName);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  function getVersion_() {
    return REOS.CONFIG && REOS.CONFIG.APP ? REOS.CONFIG.APP.VERSION : 'unknown';
  }

  return { ensureSheets: ensureSheets, run: run, summary: summary, setEnabled: setEnabled };
})();

function reosRunIntegrationMonitor() {
  const report = REOS.IntegrationMonitor.run();
  SpreadsheetApp.getUi().alert('REOS Integration Monitor', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

function reosIntegrationSummary() {
  const report = REOS.IntegrationMonitor.summary();
  SpreadsheetApp.getUi().alert('REOS Integration Summary', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

/**
 * REOS Enterprise v3.0 - Production Monitoring Framework
 *
 * Runtime health, dependency checks, incident logging, uptime snapshots,
 * and operational status for production hardening.
 */

var REOS = REOS || {};

REOS.Monitoring = (function () {
  const HEALTH_SHEET = 'SYSTEM_HEALTH';
  const INCIDENTS_SHEET = 'INCIDENTS';

  const HEALTH_HEADERS = [
    'Health Check ID', 'Timestamp', 'Overall Status', 'Module', 'Check Name',
    'Status', 'Message', 'Latency MS', 'Details JSON', 'Created At', 'Updated At'
  ];

  const INCIDENT_HEADERS = [
    'Incident ID', 'Opened At', 'Closed At', 'Severity', 'Status', 'Module',
    'Title', 'Description', 'Root Cause', 'Resolution', 'Owner', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(HEALTH_SHEET, HEALTH_HEADERS);
    ensureTable_(INCIDENTS_SHEET, INCIDENT_HEADERS);
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

  function runHealthSuite() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    const checks = [
      check_('Core', 'Spreadsheet Access', function () { return !!SpreadsheetApp.getActiveSpreadsheet().getId(); }),
      check_('Database', 'Database Framework', function () { return !!REOS.Database; }),
      check_('Security', 'Current User', function () { return !!REOS.Security.getCurrentUserEmail(); }),
      check_('CRM', 'CRM Module', function () { return !!REOS.CRM; }),
      check_('Tasks', 'Tasks Module', function () { return !!REOS.Tasks; }),
      check_('Finance', 'Finance Module', function () { return !!REOS.Finance; }),
      check_('Documents', 'Documents Module', function () { return !!REOS.Documents; }),
      check_('Integrations', 'Integration Hub', function () { return !!REOS.Integrations; }),
      check_('SaaS', 'Tenant Framework', function () { return !!REOS.Tenants; })
    ];
    const overall = checks.some(function (c) { return c.Status === 'Fail'; }) ? 'Degraded' : 'Healthy';
    checks.forEach(function (c) { c['Overall Status'] = overall; logHealth_(c); });
    return { overallStatus: overall, checks: checks, generatedAt: new Date() };
  }

  function check_(module, name, fn) {
    const started = new Date().getTime();
    try {
      const ok = fn();
      return {
        Timestamp: new Date(),
        Module: module,
        'Check Name': name,
        Status: ok ? 'Pass' : 'Fail',
        Message: ok ? 'OK' : 'Check returned false.',
        'Latency MS': new Date().getTime() - started,
        'Details JSON': '{}'
      };
    } catch (error) {
      return {
        Timestamp: new Date(),
        Module: module,
        'Check Name': name,
        Status: 'Fail',
        Message: error.message,
        'Latency MS': new Date().getTime() - started,
        'Details JSON': JSON.stringify({ stack: error.stack || '' })
      };
    }
  }

  function logHealth_(record) {
    return REOS.Database.insert(HEALTH_SHEET, record, { idField: 'Health Check ID', idPrefix: 'HC' });
  }

  function openIncident(incident) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    incident = incident || {};
    incident['Opened At'] = incident['Opened At'] || new Date();
    incident.Status = incident.Status || 'Open';
    incident.Severity = incident.Severity || 'Medium';
    const validation = REOS.Validation.validateRecord(incident, { required: ['Module', 'Title'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(INCIDENTS_SHEET, incident, { idField: 'Incident ID', idPrefix: 'INC' });
    REOS.Logger.audit('Incident opened', { incidentId: created['Incident ID'], severity: created.Severity });
    return created;
  }

  function closeIncident(incidentId, resolution, rootCause) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const updated = REOS.Database.update(INCIDENTS_SHEET, 'Incident ID', incidentId, {
      Status: 'Closed',
      'Closed At': new Date(),
      Resolution: resolution || '',
      'Root Cause': rootCause || ''
    });
    REOS.Logger.audit('Incident closed', { incidentId: incidentId });
    return updated;
  }

  function listOpenIncidents() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.query(INCIDENTS_SHEET, function (i) {
      return String(i.Status || '').toLowerCase() !== 'closed';
    });
  }

  function dashboard() {
    const health = runHealthSuite();
    return {
      health: health,
      openIncidents: listOpenIncidents(),
      recentHealth: REOS.Database.getAll(HEALTH_SHEET).slice(-50).reverse()
    };
  }

  return {
    ensureSheets: ensureSheets,
    runHealthSuite: runHealthSuite,
    openIncident: openIncident,
    closeIncident: closeIncident,
    listOpenIncidents: listOpenIncidents,
    dashboard: dashboard
  };
})();

function monitoringRunHealthSuite() { return REOS.Monitoring.runHealthSuite(); }
function monitoringOpenIncident(incident) { return REOS.Monitoring.openIncident(incident || {}); }
function monitoringCloseIncident(incidentId, resolution, rootCause) { return REOS.Monitoring.closeIncident(incidentId, resolution, rootCause); }
function monitoringDashboard() { return REOS.Monitoring.dashboard(); }

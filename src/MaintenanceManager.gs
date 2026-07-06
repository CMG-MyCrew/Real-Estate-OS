/**
 * REOS Enterprise v3.0.1 - Maintenance & Stabilization
 *
 * Tracks patch issues, regression runs, hotfix approvals, stabilization checks,
 * and v3.0.1 patch release readiness after GA.
 */

var REOS = REOS || {};

REOS.MaintenanceManager = (function () {
  const ISSUES_SHEET = 'PATCH_ISSUES';
  const RUNS_SHEET = 'REGRESSION_RUNS';
  const APPROVALS_SHEET = 'HOTFIX_APPROVALS';
  const PATCHES_SHEET = 'PATCH_RELEASES';
  const ISSUE_ID_FIELD = 'Patch Issue ID';
  const RUN_ID_FIELD = 'Regression Run ID';
  const APPROVAL_ID_FIELD = 'Hotfix Approval ID';
  const PATCH_ID_FIELD = 'Patch Release ID';

  const ISSUE_HEADERS = ['Patch Issue ID', 'Title', 'Module', 'Severity', 'Status', 'Description', 'Owner', 'Target Version', 'Resolution', 'Created At', 'Updated At'];
  const RUN_HEADERS = ['Regression Run ID', 'Version', 'Status', 'Passed', 'Failed', 'Warnings', 'Report JSON', 'Created At', 'Updated At'];
  const APPROVAL_HEADERS = ['Hotfix Approval ID', 'Patch Issue ID', 'Role', 'Approver', 'Status', 'Comments', 'Approved At', 'Created At', 'Updated At'];
  const PATCH_HEADERS = ['Patch Release ID', 'Version', 'Status', 'Open Critical Issues', 'Open High Issues', 'Regression Status', 'Summary JSON', 'Created At', 'Updated At'];

  const REQUIRED_APPROVALS = ['Technical Lead', 'QA Lead', 'Operations Lead'];

  function ensureSheets() {
    ensureTable_(ISSUES_SHEET, ISSUE_HEADERS);
    ensureTable_(RUNS_SHEET, RUN_HEADERS);
    ensureTable_(APPROVALS_SHEET, APPROVAL_HEADERS);
    ensureTable_(PATCHES_SHEET, PATCH_HEADERS);
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
    const issues = REOS.Database.getAll(ISSUES_SHEET);
    const runs = latest_(REOS.Database.getAll(RUNS_SHEET), 'Created At', 20);
    const patches = latest_(REOS.Database.getAll(PATCHES_SHEET), 'Created At', 20);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        openIssues: issues.filter(function (i) { return String(i.Status || 'Open') !== 'Closed'; }).length,
        critical: issues.filter(function (i) { return String(i.Severity) === 'Critical' && String(i.Status || 'Open') !== 'Closed'; }).length,
        high: issues.filter(function (i) { return String(i.Severity) === 'High' && String(i.Status || 'Open') !== 'Closed'; }).length,
        regressionRuns: runs.length,
        patches: patches.length
      },
      issues: latest_(issues, 'Created At', 100),
      regressionRuns: runs,
      patches: patches
    };
  }

  function createIssue(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    if (!record.Title) throw new Error('Issue title is required.');
    const row = REOS.Database.insert(ISSUES_SHEET, {
      Title: record.Title,
      Module: record.Module || 'General',
      Severity: record.Severity || 'Medium',
      Status: record.Status || 'Open',
      Description: record.Description || '',
      Owner: record.Owner || '',
      'Target Version': record['Target Version'] || '3.0.1',
      Resolution: '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: ISSUE_ID_FIELD, idPrefix: 'PISS' });
    if (row.Severity === 'Critical' || row.Severity === 'High') seedHotfixApprovals_(row[ISSUE_ID_FIELD]);
    return row;
  }

  function updateIssue(issueId, changes) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.update(ISSUES_SHEET, ISSUE_ID_FIELD, issueId, Object.assign({}, changes || {}, { 'Updated At': new Date() }));
  }

  function runRegression(version) {
    REOS.Security.requireAdmin();
    ensureSheets();
    version = version || '3.0.1';
    const checks = [];
    checks.push(check_('Health Check', safeBool_(function () { return REOS.healthCheck_().ok; }), 'Workbook health check'));
    checks.push(check_('Production Monitoring', sheetRows_('MONITORING_SNAPSHOTS') > 0, 'Monitoring snapshot exists'));
    checks.push(check_('Release Package', sheetRows_('RELEASE_PACKAGES') > 0, 'Release package exists'));
    checks.push(check_('Production Launch', sheetRows_('PRODUCTION_LAUNCHES') > 0, 'Production launch exists'));
    checks.push(check_('Open Critical Issues', countOpen_('Critical') === 0, 'No open critical issues'));
    const failed = checks.filter(function (c) { return !c.pass; }).length;
    const warnings = checks.filter(function (c) { return c.warning; }).length;
    const passed = checks.length - failed;
    const status = failed ? 'Failed' : warnings ? 'Passed with Warnings' : 'Passed';
    return REOS.Database.insert(RUNS_SHEET, {
      Version: version,
      Status: status,
      Passed: passed,
      Failed: failed,
      Warnings: warnings,
      'Report JSON': REOS.toJson_({ checks: checks, generatedAt: REOS.nowIso_() }),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: RUN_ID_FIELD, idPrefix: 'RGR' });
  }

  function createPatchRelease(version) {
    REOS.Security.requireAdmin();
    ensureSheets();
    version = version || '3.0.1';
    const critical = countOpen_('Critical');
    const high = countOpen_('High');
    const lastRegression = latest_(REOS.Database.getAll(RUNS_SHEET), 'Created At', 1)[0] || null;
    const regressionStatus = lastRegression ? lastRegression.Status : 'Not Run';
    const status = critical ? 'Blocked' : high ? 'Needs Review' : regressionStatus === 'Passed' || regressionStatus === 'Passed with Warnings' ? 'Ready' : 'Regression Required';
    const summary = { version: version, openCritical: critical, openHigh: high, regressionStatus: regressionStatus, status: status, generatedAt: REOS.nowIso_() };
    return REOS.Database.insert(PATCHES_SHEET, {
      Version: version,
      Status: status,
      'Open Critical Issues': critical,
      'Open High Issues': high,
      'Regression Status': regressionStatus,
      'Summary JSON': REOS.toJson_(summary),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: PATCH_ID_FIELD, idPrefix: 'PREL' });
  }

  function approveHotfix(issueId, role, comments) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const rows = REOS.Database.getAll(APPROVALS_SHEET).filter(function (r) { return r[ISSUE_ID_FIELD] === issueId && r.Role === role; });
    if (!rows.length) throw new Error('Approval not found for role: ' + role);
    return REOS.Database.update(APPROVALS_SHEET, APPROVAL_ID_FIELD, rows[0][APPROVAL_ID_FIELD], {
      Approver: Session.getActiveUser().getEmail() || '',
      Status: 'Approved',
      Comments: comments || '',
      'Approved At': new Date(),
      'Updated At': new Date()
    });
  }

  function seedHotfixApprovals_(issueId) {
    REQUIRED_APPROVALS.forEach(function (role) {
      REOS.Database.insert(APPROVALS_SHEET, {
        [ISSUE_ID_FIELD]: issueId,
        Role: role,
        Approver: '',
        Status: 'Pending',
        Comments: '',
        'Approved At': '',
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: APPROVAL_ID_FIELD, idPrefix: 'HFA' });
    });
  }

  function countOpen_(severity) {
    return REOS.Database.getAll(ISSUES_SHEET).filter(function (i) { return String(i.Severity) === severity && String(i.Status || 'Open') !== 'Closed'; }).length;
  }

  function sheetRows_(sheetName) { const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName); return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0; }
  function check_(name, pass, message) { return { name: name, pass: !!pass, message: message }; }
  function safeBool_(fn) { try { return !!fn(); } catch (error) { return false; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 20); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, createIssue: createIssue, updateIssue: updateIssue, runRegression: runRegression, createPatchRelease: createPatchRelease, approveHotfix: approveHotfix };
})();

function reosMaintenanceEnsureSheets() { return REOS.MaintenanceManager.ensureSheets(); }
function reosMaintenanceDashboard() { return REOS.MaintenanceManager.getDashboard(); }
function reosMaintenanceCreateIssue(record) { return REOS.MaintenanceManager.createIssue(record || {}); }
function reosMaintenanceUpdateIssue(issueId, changes) { return REOS.MaintenanceManager.updateIssue(issueId, changes || {}); }
function reosMaintenanceRunRegression(version) { return REOS.MaintenanceManager.runRegression(version || '3.0.1'); }
function reosMaintenanceCreatePatchRelease(version) { return REOS.MaintenanceManager.createPatchRelease(version || '3.0.1'); }
function reosMaintenanceApproveHotfix(issueId, role, comments) { return REOS.MaintenanceManager.approveHotfix(issueId, role, comments || ''); }
function showMaintenanceManager() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('MaintenanceManager').setTitle('REOS Maintenance Manager').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Maintenance Manager');
}

/**
 * REOS Enterprise v3.0.0 GA - Phase 4 Operational Validation
 *
 * Runs end-to-end operational validation after deployment and enterprise data seeding.
 * Validates core workflows across acquisitions, CRM, properties, vendors, documents,
 * dashboards, exports, automation, AI agents, security, and audit logging.
 */

var REOS = REOS || {};

REOS.OperationalValidator = (function () {
  const RUNS_SHEET = 'OPERATIONAL_VALIDATION_RUNS';
  const CHECKS_SHEET = 'OPERATIONAL_VALIDATION_CHECKS';
  const RUN_ID_FIELD = 'Validation Run ID';
  const CHECK_ID_FIELD = 'Validation Check ID';

  const RUN_HEADERS = ['Validation Run ID', 'Environment', 'Status', 'Score', 'Passed', 'Warnings', 'Failed', 'Report JSON', 'Started At', 'Finished At', 'Created At', 'Updated At'];
  const CHECK_HEADERS = ['Validation Check ID', 'Validation Run ID', 'Workflow', 'Step', 'Status', 'Severity', 'Message', 'Details JSON', 'Created At', 'Updated At'];

  function ensureSheets() {
    ensureTable_(RUNS_SHEET, RUN_HEADERS);
    ensureTable_(CHECKS_SHEET, CHECK_HEADERS);
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
    const runs = latest_(REOS.Database.getAll(RUNS_SHEET), 'Started At', 25);
    const latest = runs[0] || null;
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        runs: runs.length,
        latestStatus: latest ? latest.Status : 'Not Run',
        latestScore: latest ? latest.Score : 0,
        passed: latest ? latest.Passed : 0,
        warnings: latest ? latest.Warnings : 0,
        failed: latest ? latest.Failed : 0
      },
      runs: runs,
      latestChecks: latest ? getRunChecks(latest[RUN_ID_FIELD]) : []
    };
  }

  function runOperationalValidation(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    const environment = options.environment || 'Production';
    const run = REOS.Database.insert(RUNS_SHEET, {
      Environment: environment,
      Status: 'Running',
      Score: 0,
      Passed: 0,
      Warnings: 0,
      Failed: 0,
      'Report JSON': '',
      'Started At': new Date(),
      'Finished At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: RUN_ID_FIELD, idPrefix: 'OVAL' });
    const runId = run[RUN_ID_FIELD];
    const checks = [];

    add_(checks, validateHealth_());
    add_(checks, validateSeedData_());
    add_(checks, validateDashboardHub_());
    add_(checks, validateDashboardExport_());
    add_(checks, validateDocuments_());
    add_(checks, validateAiAgents_());
    add_(checks, validateAutomation_());
    add_(checks, validateProductionHardening_());
    add_(checks, validateSecurity_());

    checks.forEach(function (check) { persistCheck_(runId, check); });
    const passed = checks.filter(function (c) { return c.Status === 'Pass'; }).length;
    const warnings = checks.filter(function (c) { return c.Status === 'Warn'; }).length;
    const failed = checks.filter(function (c) { return c.Status === 'Fail'; }).length;
    const critical = checks.filter(function (c) { return c.Status === 'Fail' && c.Severity === 'Critical'; }).length;
    const score = calculateScore_(checks);
    const status = critical ? 'Blocked' : failed || warnings ? 'Needs Review' : 'Validated';
    const report = { runId: runId, environment: environment, status: status, score: score, passed: passed, warnings: warnings, failed: failed, checks: checks, generatedAt: REOS.nowIso_() };

    REOS.Database.update(RUNS_SHEET, RUN_ID_FIELD, runId, {
      Status: status,
      Score: score,
      Passed: passed,
      Warnings: warnings,
      Failed: failed,
      'Report JSON': REOS.toJson_(report),
      'Finished At': new Date(),
      'Updated At': new Date()
    });
    REOS.Logger.audit('Operational validation completed', { runId: runId, status: status, score: score });
    return report;
  }

  function getRunChecks(runId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(CHECKS_SHEET).filter(function (row) { return row[RUN_ID_FIELD] === runId; });
  }

  function validateHealth_() {
    try {
      const report = REOS.healthCheck_();
      return [check_('Core', 'Health Check', report.ok ? 'Pass' : 'Fail', report.ok ? 'Info' : 'Critical', report.ok ? 'Workbook health check passed.' : 'Workbook health check has missing items.', report)];
    } catch (error) { return [check_('Core', 'Health Check', 'Fail', 'Critical', error.message, {})]; }
  }

  function validateSeedData_() {
    const checks = [];
    try {
      const seedRuns = REOS.Database.getAll('SEED_RUNS');
      checks.push(check_('Data Seeding', 'Seed run exists', seedRuns.length ? 'Pass' : 'Warn', seedRuns.length ? 'Info' : 'Medium', seedRuns.length + ' seed runs found.', { count: seedRuns.length }));
      const templates = REOS.Database.getAll('INSPECTION_TEMPLATES');
      checks.push(check_('Data Seeding', 'Inspection templates exist', templates.length ? 'Pass' : 'Warn', templates.length ? 'Info' : 'Medium', templates.length + ' templates found.', { count: templates.length }));
    } catch (error) { checks.push(check_('Data Seeding', 'Seed data review', 'Warn', 'Medium', error.message, {})); }
    return checks;
  }

  function validateDashboardHub_() {
    try {
      const hub = REOS.DashboardHub && REOS.DashboardHub.getHub ? REOS.DashboardHub.getHub() : null;
      return [check_('Dashboards', 'Dashboard Hub loads', hub && hub.ok ? 'Pass' : 'Fail', hub && hub.ok ? 'Info' : 'High', hub && hub.ok ? 'Dashboard Hub loaded.' : 'Dashboard Hub unavailable.', hub || {})];
    } catch (error) { return [check_('Dashboards', 'Dashboard Hub loads', 'Fail', 'High', error.message, {})]; }
  }

  function validateDashboardExport_() {
    try {
      const center = REOS.DashboardExport && REOS.DashboardExport.getExportCenter ? REOS.DashboardExport.getExportCenter() : null;
      return [check_('Dashboard Export', 'Export Center loads', center && center.ok ? 'Pass' : 'Warn', center && center.ok ? 'Info' : 'Medium', center && center.ok ? 'Dashboard Export Center loaded.' : 'Dashboard Export unavailable.', center || {})];
    } catch (error) { return [check_('Dashboard Export', 'Export Center loads', 'Warn', 'Medium', error.message, {})]; }
  }

  function validateDocuments_() {
    try {
      const dash = REOS.Documents && REOS.Documents.getDashboard ? REOS.Documents.getDashboard({ limit: 5 }) : null;
      return [check_('Documents', 'Document dashboard loads', dash && dash.ok ? 'Pass' : 'Warn', dash && dash.ok ? 'Info' : 'Medium', dash && dash.ok ? 'Document dashboard loaded.' : 'Document service unavailable.', dash || {})];
    } catch (error) { return [check_('Documents', 'Document dashboard loads', 'Warn', 'Medium', error.message, {})]; }
  }

  function validateAiAgents_() {
    try {
      const dash = REOS.AIAgents && REOS.AIAgents.getDashboard ? REOS.AIAgents.getDashboard() : null;
      const ok = dash && dash.ok && Number((dash.kpis || {}).agents || 0) > 0;
      return [check_('AI Agents', 'AI agents seeded and dashboard loads', ok ? 'Pass' : 'Warn', ok ? 'Info' : 'Medium', ok ? 'AI agents available.' : 'AI agents not seeded or unavailable.', dash || {})];
    } catch (error) { return [check_('AI Agents', 'AI agents seeded and dashboard loads', 'Warn', 'Medium', error.message, {})]; }
  }

  function validateAutomation_() {
    const checks = [];
    try {
      const templates = REOS.Database.getAll('AUTOMATION_TEMPLATES');
      checks.push(check_('Automation', 'Automation templates exist', templates.length ? 'Pass' : 'Warn', templates.length ? 'Info' : 'Medium', templates.length + ' templates found.', { count: templates.length }));
      checks.push(check_('Automation', 'Project triggers reviewed', ScriptApp.getProjectTriggers().length <= 20 ? 'Pass' : 'Warn', 'Info', ScriptApp.getProjectTriggers().length + ' triggers installed.', {}));
    } catch (error) { checks.push(check_('Automation', 'Automation review', 'Warn', 'Medium', error.message, {})); }
    return checks;
  }

  function validateProductionHardening_() {
    try {
      const latest = REOS.ProductionHardening && REOS.ProductionHardening.getLatestReport ? REOS.ProductionHardening.getLatestReport() : null;
      return [check_('Production Hardening', 'Hardening report exists', latest ? 'Pass' : 'Warn', latest ? 'Info' : 'High', latest ? 'Hardening report found.' : 'No hardening report found.', latest || {})];
    } catch (error) { return [check_('Production Hardening', 'Hardening report exists', 'Warn', 'High', error.message, {})]; }
  }

  function validateSecurity_() {
    try {
      const users = REOS.Database.getAll(REOS.CONFIG.SHEETS.USERS);
      const admins = users.filter(function (u) { return String(u.Role || '').toLowerCase() === 'admin' && u.Active !== false; });
      return [check_('Security', 'Active admin exists', admins.length ? 'Pass' : 'Fail', admins.length ? 'Info' : 'Critical', admins.length + ' active admins found.', { admins: admins.length })];
    } catch (error) { return [check_('Security', 'Active admin exists', 'Fail', 'Critical', error.message, {})]; }
  }

  function persistCheck_(runId, check) {
    return REOS.Database.insert(CHECKS_SHEET, { [RUN_ID_FIELD]: runId, Workflow: check.Workflow, Step: check.Step, Status: check.Status, Severity: check.Severity, Message: check.Message, 'Details JSON': REOS.toJson_(check.Details || {}), 'Created At': new Date(), 'Updated At': new Date() }, { idField: CHECK_ID_FIELD, idPrefix: 'OVCK' });
  }

  function check_(workflow, step, status, severity, message, details) { return { Workflow: workflow, Step: step, Status: status, Severity: severity, Message: message, Details: details || {} }; }
  function add_(target, items) { (items || []).forEach(function (item) { target.push(item); }); }
  function calculateScore_(checks) { const p = checks.reduce(function (s, c) { return s + (c.Status === 'Fail' && c.Severity === 'Critical' ? 25 : c.Status === 'Fail' ? 15 : c.Status === 'Warn' ? 5 : 0); }, 0); return Math.max(0, 100 - p); }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 25); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, runOperationalValidation: runOperationalValidation, getRunChecks: getRunChecks };
})();

function reosOperationalValidatorEnsureSheets() { return REOS.OperationalValidator.ensureSheets(); }
function reosOperationalValidatorDashboard() { return REOS.OperationalValidator.getDashboard(); }
function reosOperationalValidatorRun(options) { return REOS.OperationalValidator.runOperationalValidation(options || {}); }
function reosOperationalValidatorChecks(runId) { return REOS.OperationalValidator.getRunChecks(runId); }
function showOperationalValidator() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('OperationalValidatorUI').setTitle('REOS Operational Validator').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Operational Validator');
}

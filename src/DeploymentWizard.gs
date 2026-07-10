/**
 * REOS Enterprise v3.0.0 GA - Phase 2 Production Deployment Wizard
 *
 * Provisions and validates a production workbook after code freeze.
 * This module coordinates initialization, required sheets, Drive folders,
 * script property checks, automation seeders, AI agent seeding, and deployment reports.
 */

var REOS = REOS || {};

REOS.DeploymentWizard = (function () {
  const DEPLOYMENTS_SHEET = 'DEPLOYMENT_RUNS';
  const CHECKS_SHEET = 'DEPLOYMENT_CHECKS';
  const RUN_ID_FIELD = 'Deployment Run ID';
  const CHECK_ID_FIELD = 'Deployment Check ID';

  const DEPLOYMENT_HEADERS = [
    'Deployment Run ID', 'Environment', 'Status', 'Score', 'Critical Issues', 'Warnings',
    'Steps Completed', 'Steps Failed', 'Report JSON', 'Started At', 'Finished At', 'Created At', 'Updated At'
  ];

  const CHECK_HEADERS = [
    'Deployment Check ID', 'Deployment Run ID', 'Step', 'Area', 'Status', 'Severity',
    'Message', 'Details JSON', 'Created At', 'Updated At'
  ];

  const REQUIRED_SCRIPT_PROPERTIES = [
    'REOS_VERSION',
    'REOS_ENVIRONMENT',
    'REOS_DEPLOYMENT_MODE'
  ];

  function ensureSheets() {
    ensureTable_(DEPLOYMENTS_SHEET, DEPLOYMENT_HEADERS);
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
    const runs = latest_(REOS.Database.getAll(DEPLOYMENTS_SHEET), 'Started At', 25);
    const latest = runs[0] || null;
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        runs: runs.length,
        latestScore: latest ? latest.Score : 0,
        latestStatus: latest ? latest.Status : 'Not Run',
        criticalIssues: latest ? latest['Critical Issues'] : 0,
        warnings: latest ? latest.Warnings : 0
      },
      runs: runs,
      latestChecks: latest ? getRunChecks(latest[RUN_ID_FIELD]) : []
    };
  }

  function runProductionDeployment(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    const environment = options.environment || 'Production';
    const started = new Date();
    const checks = [];
    let run;

    run = REOS.Database.insert(DEPLOYMENTS_SHEET, {
      Environment: environment,
      Status: 'Running',
      Score: 0,
      'Critical Issues': 0,
      Warnings: 0,
      'Steps Completed': 0,
      'Steps Failed': 0,
      'Report JSON': '',
      'Started At': started,
      'Finished At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: RUN_ID_FIELD, idPrefix: 'DPLY' });

    const runId = run[RUN_ID_FIELD];

    add_(checks, stepInitializeWorkbook_(runId));
    add_(checks, stepSeedSystems_(runId));
    add_(checks, stepScriptProperties_(runId, environment));
    add_(checks, stepDriveFolders_(runId));
    add_(checks, stepAutomation_(runId));
    add_(checks, stepAiAgents_(runId));
    add_(checks, stepHealthChecks_(runId));
    add_(checks, stepHardening_(runId));

    checks.forEach(function (check) { persistCheck_(runId, check); });

    const failed = checks.filter(function (c) { return c.Status === 'Fail'; });
    const warnings = checks.filter(function (c) { return c.Status === 'Warn'; });
    const critical = failed.filter(function (c) { return c.Severity === 'Critical'; });
    const score = calculateScore_(checks);
    const status = critical.length ? 'Blocked' : failed.length || warnings.length ? 'Needs Review' : 'Ready';
    const report = {
      runId: runId,
      environment: environment,
      status: status,
      score: score,
      criticalIssues: critical.length,
      warnings: warnings.length,
      stepsCompleted: checks.filter(function (c) { return c.Status === 'Pass'; }).length,
      stepsFailed: failed.length,
      checks: checks,
      generatedAt: REOS.nowIso_()
    };

    REOS.Database.update(DEPLOYMENTS_SHEET, RUN_ID_FIELD, runId, {
      Status: status,
      Score: score,
      'Critical Issues': critical.length,
      Warnings: warnings.length,
      'Steps Completed': report.stepsCompleted,
      'Steps Failed': report.stepsFailed,
      'Report JSON': REOS.toJson_(report),
      'Finished At': new Date(),
      'Updated At': new Date()
    });

    REOS.Logger.audit('Production deployment wizard completed', { runId: runId, status: status, score: score });
    return report;
  }

  function getRunChecks(runId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(CHECKS_SHEET).filter(function (row) { return row[RUN_ID_FIELD] === runId; });
  }

  function stepInitializeWorkbook_(runId) {
    const checks = [];
    try {
      REOS.createRequiredSheets_();
      checks.push(check_('Initialize Workbook', 'Core', 'Pass', 'Info', 'Required CONFIG sheets created.', {}));
    } catch (error) {
      checks.push(check_('Initialize Workbook', 'Core', 'Fail', 'Critical', error.message, {}));
    }
    return checks;
  }

  function stepSeedSystems_(runId) {
    const checks = [];
    const seeders = [
      ['Settings', function () { return REOS.seedSettings_(); }],
      ['Lookups', function () { return REOS.seedLookups_(); }],
      ['Initial Admin', function () { return REOS.seedInitialAdmin_(); }],
      ['External Integrations', function () { return REOS.ExternalIntegrations && REOS.ExternalIntegrations.ensureSheets(); }],
      ['Automation Templates', function () { return REOS.AutomationTemplates && REOS.AutomationTemplates.ensureSheets(); }],
      ['Documents', function () { return REOS.Documents && REOS.Documents.ensureSheets(); }],
      ['Dashboard Export', function () { return REOS.DashboardExport && REOS.DashboardExport.ensureSheets(); }],
      ['Production Hardening', function () { return REOS.ProductionHardening && REOS.ProductionHardening.ensureSheets(); }],
      ['AI Agents', function () { return REOS.AIAgents && REOS.AIAgents.ensureSheets(); }]
    ];
    seeders.forEach(function (item) {
      try { item[1](); checks.push(check_('Seed Systems', item[0], 'Pass', 'Info', item[0] + ' ready.', {})); }
      catch (error) { checks.push(check_('Seed Systems', item[0], 'Fail', 'High', error.message, {})); }
    });
    return checks;
  }

  function stepScriptProperties_(runId, environment) {
    const checks = [];
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('REOS_VERSION')) props.setProperty('REOS_VERSION', REOS.CONFIG.APP.VERSION);
    if (!props.getProperty('REOS_ENVIRONMENT')) props.setProperty('REOS_ENVIRONMENT', environment);
    if (!props.getProperty('REOS_DEPLOYMENT_MODE')) props.setProperty('REOS_DEPLOYMENT_MODE', 'production');
    const all = props.getProperties();
    REQUIRED_SCRIPT_PROPERTIES.forEach(function (key) {
      checks.push(check_('Script Properties', key, all[key] ? 'Pass' : 'Fail', all[key] ? 'Info' : 'Critical', all[key] ? 'Property configured.' : 'Missing required property.', { key: key }));
    });
    return checks;
  }

  function stepDriveFolders_(runId) {
    const checks = [];
    try {
      const folder = DriveApp.createFolder('REOS Enterprise v3.0 Production - ' + Utilities.formatDate(new Date(), REOS.CONFIG.APP.TIME_ZONE, 'yyyyMMdd-HHmm'));
      PropertiesService.getScriptProperties().setProperty('REOS_PRODUCTION_FOLDER_ID', folder.getId());
      checks.push(check_('Drive Folders', 'Production root folder', 'Pass', 'Info', 'Production folder created.', { folderId: folder.getId(), folderUrl: folder.getUrl() }));
    } catch (error) {
      checks.push(check_('Drive Folders', 'Production root folder', 'Warn', 'Medium', error.message, {}));
    }
    return checks;
  }

  function stepAutomation_(runId) {
    const checks = [];
    try {
      if (REOS.AutomationTemplates && typeof REOS.AutomationTemplates.seedTemplates === 'function') REOS.AutomationTemplates.seedTemplates();
      checks.push(check_('Automation', 'Templates seeded', 'Pass', 'Info', 'Automation templates ready.', {}));
    } catch (error) {
      checks.push(check_('Automation', 'Templates seeded', 'Warn', 'Medium', error.message, {}));
    }
    try {
      const triggers = ScriptApp.getProjectTriggers();
      checks.push(check_('Automation', 'Trigger review', triggers.length <= 20 ? 'Pass' : 'Warn', triggers.length <= 20 ? 'Info' : 'Medium', triggers.length + ' triggers installed.', { count: triggers.length }));
    } catch (error) {
      checks.push(check_('Automation', 'Trigger review', 'Warn', 'Medium', error.message, {}));
    }
    return checks;
  }

  function stepAiAgents_(runId) {
    const checks = [];
    try {
      if (REOS.AIAgents && typeof REOS.AIAgents.seedAgents === 'function') REOS.AIAgents.seedAgents();
      checks.push(check_('AI Agents', 'Agents seeded', 'Pass', 'Info', 'AI agents ready.', {}));
    } catch (error) {
      checks.push(check_('AI Agents', 'Agents seeded', 'Warn', 'Medium', error.message, {}));
    }
    return checks;
  }

  function stepHealthChecks_(runId) {
    const checks = [];
    try {
      const report = REOS.healthCheck_();
      checks.push(check_('Health Check', 'Workbook health', report.ok ? 'Pass' : 'Fail', report.ok ? 'Info' : 'Critical', report.ok ? 'Health check passed.' : 'Health check has missing items.', report));
    } catch (error) {
      checks.push(check_('Health Check', 'Workbook health', 'Fail', 'Critical', error.message, {}));
    }
    return checks;
  }

  function stepHardening_(runId) {
    const checks = [];
    try {
      if (REOS.ProductionHardening && typeof REOS.ProductionHardening.runReadinessAudit === 'function') {
        const audit = REOS.ProductionHardening.runReadinessAudit({ source: 'DeploymentWizard' });
        checks.push(check_('Production Hardening', 'Readiness audit', audit.criticalIssues ? 'Fail' : audit.warnings ? 'Warn' : 'Pass', audit.criticalIssues ? 'Critical' : audit.warnings ? 'Medium' : 'Info', 'Hardening status: ' + audit.status, audit));
      } else {
        checks.push(check_('Production Hardening', 'Readiness audit', 'Warn', 'Medium', 'ProductionHardening service unavailable.', {}));
      }
    } catch (error) {
      checks.push(check_('Production Hardening', 'Readiness audit', 'Warn', 'High', error.message, {}));
    }
    return checks;
  }

  function persistCheck_(runId, check) {
    return REOS.Database.insert(CHECKS_SHEET, {
      [RUN_ID_FIELD]: runId,
      Step: check.Step,
      Area: check.Area,
      Status: check.Status,
      Severity: check.Severity,
      Message: check.Message,
      'Details JSON': REOS.toJson_(check.Details || {}),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: CHECK_ID_FIELD, idPrefix: 'DCHK' });
  }

  function check_(step, area, status, severity, message, details) {
    return { Step: step, Area: area, Status: status, Severity: severity, Message: message, Details: details || {} };
  }

  function calculateScore_(checks) {
    const penalties = checks.reduce(function (sum, check) {
      if (check.Status === 'Fail' && check.Severity === 'Critical') return sum + 25;
      if (check.Status === 'Fail') return sum + 15;
      if (check.Status === 'Warn') return sum + 5;
      return sum;
    }, 0);
    return Math.max(0, 100 - penalties);
  }

  function add_(target, items) { (items || []).forEach(function (item) { target.push(item); }); }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 25); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, runProductionDeployment: runProductionDeployment, getRunChecks: getRunChecks };
})();

function reosDeploymentWizardEnsureSheets() { return REOS.DeploymentWizard.ensureSheets(); }
function reosDeploymentWizardDashboard() { return REOS.DeploymentWizard.getDashboard(); }
function reosDeploymentWizardRun(options) { return REOS.DeploymentWizard.runProductionDeployment(options || {}); }
function reosDeploymentWizardChecks(runId) { return REOS.DeploymentWizard.getRunChecks(runId); }
function showDeploymentWizard() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('DeploymentWizardUI').setTitle('REOS Deployment Wizard').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Deployment Wizard');
}

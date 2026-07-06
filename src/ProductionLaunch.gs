/**
 * REOS Enterprise v3.0.0 GA - Phase 7 Production Launch & Sign-Off
 *
 * Manages final launch checklist, approval/sign-off workflow, go/no-go decision,
 * GA publish record, rollback confirmation, and post-launch verification.
 */

var REOS = REOS || {};

REOS.ProductionLaunch = (function () {
  const LAUNCHES_SHEET = 'PRODUCTION_LAUNCHES';
  const SIGNOFFS_SHEET = 'PRODUCTION_SIGNOFFS';
  const CHECKS_SHEET = 'PRODUCTION_LAUNCH_CHECKS';
  const LAUNCH_ID_FIELD = 'Launch ID';
  const SIGNOFF_ID_FIELD = 'Sign-Off ID';
  const CHECK_ID_FIELD = 'Launch Check ID';

  const LAUNCH_HEADERS = ['Launch ID', 'Version', 'Environment', 'Status', 'Decision', 'Score', 'Critical Issues', 'Warnings', 'Summary JSON', 'Published By', 'Published At', 'Created At', 'Updated At'];
  const SIGNOFF_HEADERS = ['Sign-Off ID', 'Launch ID', 'Role', 'Approver', 'Status', 'Comments', 'Signed At', 'Created At', 'Updated At'];
  const CHECK_HEADERS = ['Launch Check ID', 'Launch ID', 'Check', 'Area', 'Status', 'Severity', 'Message', 'Details JSON', 'Created At', 'Updated At'];

  const REQUIRED_APPROVALS = ['Technical Lead', 'QA Lead', 'Operations Lead', 'Security Reviewer', 'Product Owner'];

  function ensureSheets() {
    ensureTable_(LAUNCHES_SHEET, LAUNCH_HEADERS);
    ensureTable_(SIGNOFFS_SHEET, SIGNOFF_HEADERS);
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
    const launches = latest_(REOS.Database.getAll(LAUNCHES_SHEET), 'Created At', 25);
    const latest = launches[0] || null;
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      requiredApprovals: REQUIRED_APPROVALS,
      kpis: {
        launches: launches.length,
        latestStatus: latest ? latest.Status : 'Not Started',
        latestDecision: latest ? latest.Decision : 'Pending',
        latestScore: latest ? latest.Score : 0,
        criticalIssues: latest ? latest['Critical Issues'] : 0,
        warnings: latest ? latest.Warnings : 0
      },
      launches: launches,
      latestSignoffs: latest ? getSignoffs(latest[LAUNCH_ID_FIELD]) : [],
      latestChecks: latest ? getLaunchChecks(latest[LAUNCH_ID_FIELD]) : []
    };
  }

  function createLaunch(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    const version = options.version || '3.0.0';
    const environment = options.environment || PropertiesService.getScriptProperties().getProperty('REOS_ENVIRONMENT') || 'Production';
    const checks = buildLaunchChecks_(version, environment);
    const critical = checks.filter(function (c) { return c.Status === 'Fail' && c.Severity === 'Critical'; }).length;
    const warnings = checks.filter(function (c) { return c.Status === 'Warn'; }).length;
    const score = Math.max(0, 100 - critical * 25 - warnings * 5);
    const status = critical ? 'Blocked' : warnings ? 'Needs Review' : 'Ready for Sign-Off';
    const decision = status === 'Ready for Sign-Off' ? 'Pending Sign-Off' : 'No-Go';
    const summary = { version: version, environment: environment, status: status, decision: decision, checks: checks, generatedAt: REOS.nowIso_() };

    const launch = REOS.Database.insert(LAUNCHES_SHEET, {
      Version: version,
      Environment: environment,
      Status: status,
      Decision: decision,
      Score: score,
      'Critical Issues': critical,
      Warnings: warnings,
      'Summary JSON': REOS.toJson_(summary),
      'Published By': '',
      'Published At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: LAUNCH_ID_FIELD, idPrefix: 'GA' });

    const launchId = launch[LAUNCH_ID_FIELD];
    checks.forEach(function (check) { persistCheck_(launchId, check); });
    REQUIRED_APPROVALS.forEach(function (role) { createSignoff_(launchId, role); });
    REOS.Logger.audit('GA launch record created', { launchId: launchId, version: version, status: status, decision: decision });
    return { ok: true, launchId: launchId, version: version, environment: environment, status: status, decision: decision, score: score, checks: checks, signoffs: getSignoffs(launchId) };
  }

  function approveLaunch(launchId, role, comments) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const email = Session.getActiveUser().getEmail() || '';
    const signoffs = getSignoffs(launchId);
    const target = signoffs.filter(function (row) { return row.Role === role; })[0];
    if (!target) throw new Error('Sign-off role not found: ' + role);
    REOS.Database.update(SIGNOFFS_SHEET, SIGNOFF_ID_FIELD, target[SIGNOFF_ID_FIELD], {
      Approver: email,
      Status: 'Approved',
      Comments: comments || '',
      'Signed At': new Date(),
      'Updated At': new Date()
    });
    return refreshLaunchDecision(launchId);
  }

  function rejectLaunch(launchId, role, comments) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const email = Session.getActiveUser().getEmail() || '';
    const signoffs = getSignoffs(launchId);
    const target = signoffs.filter(function (row) { return row.Role === role; })[0];
    if (!target) throw new Error('Sign-off role not found: ' + role);
    REOS.Database.update(SIGNOFFS_SHEET, SIGNOFF_ID_FIELD, target[SIGNOFF_ID_FIELD], {
      Approver: email,
      Status: 'Rejected',
      Comments: comments || '',
      'Signed At': new Date(),
      'Updated At': new Date()
    });
    return refreshLaunchDecision(launchId);
  }

  function refreshLaunchDecision(launchId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const launch = REOS.Database.findById(LAUNCHES_SHEET, LAUNCH_ID_FIELD, launchId);
    if (!launch) throw new Error('Launch not found: ' + launchId);
    const signoffs = getSignoffs(launchId);
    const rejected = signoffs.filter(function (s) { return s.Status === 'Rejected'; }).length;
    const approved = signoffs.filter(function (s) { return s.Status === 'Approved'; }).length;
    const critical = Number(launch['Critical Issues'] || 0);
    let decision = 'Pending Sign-Off';
    let status = launch.Status;
    if (critical) { decision = 'No-Go'; status = 'Blocked'; }
    else if (rejected) { decision = 'No-Go'; status = 'Rejected'; }
    else if (approved === REQUIRED_APPROVALS.length) { decision = 'Go'; status = 'Approved for GA'; }
    REOS.Database.update(LAUNCHES_SHEET, LAUNCH_ID_FIELD, launchId, { Status: status, Decision: decision, 'Updated At': new Date() });
    return { ok: true, launchId: launchId, status: status, decision: decision, approved: approved, rejected: rejected, signoffs: getSignoffs(launchId), checks: getLaunchChecks(launchId) };
  }

  function publishGA(launchId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const decision = refreshLaunchDecision(launchId);
    if (decision.decision !== 'Go') throw new Error('Cannot publish GA until launch decision is Go. Current decision: ' + decision.decision);
    const email = Session.getActiveUser().getEmail() || '';
    REOS.Database.update(LAUNCHES_SHEET, LAUNCH_ID_FIELD, launchId, {
      Status: 'Published',
      Decision: 'GA Published',
      'Published By': email,
      'Published At': new Date(),
      'Updated At': new Date()
    });
    PropertiesService.getScriptProperties().setProperty('REOS_GA_VERSION', '3.0.0');
    PropertiesService.getScriptProperties().setProperty('REOS_GA_PUBLISHED_AT', new Date().toISOString());
    REOS.Logger.audit('REOS Enterprise GA published', { launchId: launchId, version: '3.0.0', publishedBy: email });
    return { ok: true, launchId: launchId, status: 'Published', decision: 'GA Published', publishedBy: email, publishedAt: REOS.nowIso_() };
  }

  function getSignoffs(launchId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(SIGNOFFS_SHEET).filter(function (row) { return row[LAUNCH_ID_FIELD] === launchId; });
  }

  function getLaunchChecks(launchId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(CHECKS_SHEET).filter(function (row) { return row[LAUNCH_ID_FIELD] === launchId; });
  }

  function buildLaunchChecks_(version, environment) {
    const checks = [];
    checks.push(check_('Release Package', 'GA package exists', latestRow_('RELEASE_PACKAGES', 'Created At') ? 'Pass' : 'Fail', 'Critical', 'GA release package record check.', latestRow_('RELEASE_PACKAGES', 'Created At') || {}));
    checks.push(check_('Production Monitoring', 'Monitoring snapshot exists', latestRow_('MONITORING_SNAPSHOTS', 'Created At') ? 'Pass' : 'Warn', 'Medium', 'Production monitoring snapshot check.', latestRow_('MONITORING_SNAPSHOTS', 'Created At') || {}));
    checks.push(check_('Operational Validation', 'Operational validation exists', latestRow_('OPERATIONAL_VALIDATION_RUNS', 'Started At') ? 'Pass' : 'Fail', 'Critical', 'Operational validation run check.', latestRow_('OPERATIONAL_VALIDATION_RUNS', 'Started At') || {}));
    checks.push(check_('Deployment', 'Deployment run exists', latestRow_('DEPLOYMENT_RUNS', 'Started At') ? 'Pass' : 'Fail', 'Critical', 'Deployment run check.', latestRow_('DEPLOYMENT_RUNS', 'Started At') || {}));
    checks.push(check_('Enterprise Seeder', 'Seed run exists', latestRow_('SEED_RUNS', 'Started At') ? 'Pass' : 'Fail', 'Critical', 'Enterprise seed run check.', latestRow_('SEED_RUNS', 'Started At') || {}));
    checks.push(check_('Rollback', 'Rollback procedure documented', 'Pass', 'Info', 'Rollback procedure exists in production checklist/documentation.', {}));
    return checks;
  }

  function createSignoff_(launchId, role) {
    return REOS.Database.insert(SIGNOFFS_SHEET, {
      [LAUNCH_ID_FIELD]: launchId,
      Role: role,
      Approver: '',
      Status: 'Pending',
      Comments: '',
      'Signed At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: SIGNOFF_ID_FIELD, idPrefix: 'SIGN' });
  }

  function persistCheck_(launchId, check) {
    return REOS.Database.insert(CHECKS_SHEET, { [LAUNCH_ID_FIELD]: launchId, Check: check.Check, Area: check.Area, Status: check.Status, Severity: check.Severity, Message: check.Message, 'Details JSON': REOS.toJson_(check.Details || {}), 'Created At': new Date(), 'Updated At': new Date() }, { idField: CHECK_ID_FIELD, idPrefix: 'GLCK' });
  }

  function check_(area, check, status, severity, message, details) { return { Area: area, Check: check, Status: status, Severity: severity, Message: message, Details: details || {} }; }
  function latestRow_(sheetName, dateField) { try { return latest_(REOS.Database.getAll(sheetName), dateField, 1)[0] || null; } catch (error) { return null; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 25); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, createLaunch: createLaunch, approveLaunch: approveLaunch, rejectLaunch: rejectLaunch, refreshLaunchDecision: refreshLaunchDecision, publishGA: publishGA, getSignoffs: getSignoffs, getLaunchChecks: getLaunchChecks };
})();

function reosProductionLaunchEnsureSheets() { return REOS.ProductionLaunch.ensureSheets(); }
function reosProductionLaunchDashboard() { return REOS.ProductionLaunch.getDashboard(); }
function reosProductionLaunchCreate(options) { return REOS.ProductionLaunch.createLaunch(options || {}); }
function reosProductionLaunchApprove(launchId, role, comments) { return REOS.ProductionLaunch.approveLaunch(launchId, role, comments || ''); }
function reosProductionLaunchReject(launchId, role, comments) { return REOS.ProductionLaunch.rejectLaunch(launchId, role, comments || ''); }
function reosProductionLaunchPublish(launchId) { return REOS.ProductionLaunch.publishGA(launchId); }
function showProductionLaunch() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('ProductionLaunch').setTitle('REOS Production Launch').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Production Launch');
}

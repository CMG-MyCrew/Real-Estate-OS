/**
 * REOS Enterprise v3.0.0 GA - Phase 6 Release Package
 *
 * Generates a release manifest, release package checklist, package records,
 * and final GA readiness summary for REOS Enterprise v3.0.0.
 */

var REOS = REOS || {};

REOS.ReleasePackage = (function () {
  const PACKAGES_SHEET = 'RELEASE_PACKAGES';
  const ARTIFACTS_SHEET = 'RELEASE_ARTIFACTS';
  const PACKAGE_ID_FIELD = 'Release Package ID';
  const ARTIFACT_ID_FIELD = 'Release Artifact ID';

  const PACKAGE_HEADERS = ['Release Package ID', 'Version', 'Environment', 'Status', 'Score', 'Critical Issues', 'Warnings', 'Manifest JSON', 'Created By', 'Created At', 'Updated At'];
  const ARTIFACT_HEADERS = ['Release Artifact ID', 'Release Package ID', 'Artifact', 'Category', 'Status', 'Location', 'Notes', 'Created At', 'Updated At'];

  const REQUIRED_ARTIFACTS = [
    ['Apps Script Source', 'Source', 'src/'],
    ['HTML UI Source', 'Source', 'src/*.html'],
    ['Deployment Guide', 'Documentation', 'docs/DEPLOYMENT.md'],
    ['Production Release Checklist', 'Documentation', 'docs/PRODUCTION_RELEASE_CHECKLIST.md'],
    ['RC QA Checklist', 'Documentation', 'docs/RELEASE_CANDIDATE_QA.md'],
    ['Production Hardening Guide', 'Documentation', 'docs/PRODUCTION_HARDENING.md'],
    ['GA Phase 2 Deployment Guide', 'Documentation', 'docs/GA_PHASE_2_PRODUCTION_DEPLOYMENT.md'],
    ['GA Phase 3 Data Seeding Guide', 'Documentation', 'docs/GA_PHASE_3_ENTERPRISE_DATA_SEEDING.md'],
    ['GA Phase 4 Operational Validation Guide', 'Documentation', 'docs/GA_PHASE_4_OPERATIONAL_VALIDATION.md'],
    ['GA Phase 5 Monitoring Guide', 'Documentation', 'docs/GA_PHASE_5_PRODUCTION_MONITORING.md'],
    ['GA Phase 6 Release Package Guide', 'Documentation', 'docs/GA_PHASE_6_RELEASE_PACKAGE.md'],
    ['Project Plan', 'Documentation', 'docs/PROJECT_PLAN.md'],
    ['Apps Script Sync Guide', 'Documentation', 'docs/APPS_SCRIPT_SYNC.md'],
    ['AI Automation Agents Guide', 'Documentation', 'docs/AI_AUTOMATION_AGENTS.md']
  ];

  function ensureSheets() {
    ensureTable_(PACKAGES_SHEET, PACKAGE_HEADERS);
    ensureTable_(ARTIFACTS_SHEET, ARTIFACT_HEADERS);
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
    const packages = latest_(REOS.Database.getAll(PACKAGES_SHEET), 'Created At', 25);
    const latest = packages[0] || null;
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        packages: packages.length,
        latestStatus: latest ? latest.Status : 'Not Generated',
        latestScore: latest ? latest.Score : 0,
        criticalIssues: latest ? latest['Critical Issues'] : 0,
        warnings: latest ? latest.Warnings : 0
      },
      packages: packages,
      latestArtifacts: latest ? getArtifacts(latest[PACKAGE_ID_FIELD]) : []
    };
  }

  function generatePackage(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    const version = options.version || '3.0.0';
    const environment = options.environment || PropertiesService.getScriptProperties().getProperty('REOS_ENVIRONMENT') || 'Production';
    const manifest = buildManifest_(version, environment);
    const issues = evaluateReadiness_(manifest);
    const score = Math.max(0, 100 - issues.critical.length * 25 - issues.warnings.length * 5);
    const status = issues.critical.length ? 'Blocked' : issues.warnings.length ? 'Needs Review' : 'Ready for GA';

    const pkg = REOS.Database.insert(PACKAGES_SHEET, {
      Version: version,
      Environment: environment,
      Status: status,
      Score: score,
      'Critical Issues': issues.critical.length,
      Warnings: issues.warnings.length,
      'Manifest JSON': REOS.toJson_(manifest),
      'Created By': Session.getActiveUser().getEmail() || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: PACKAGE_ID_FIELD, idPrefix: 'RPKG' });

    REQUIRED_ARTIFACTS.forEach(function (artifact) {
      REOS.Database.insert(ARTIFACTS_SHEET, {
        [PACKAGE_ID_FIELD]: pkg[PACKAGE_ID_FIELD],
        Artifact: artifact[0],
        Category: artifact[1],
        Status: 'Included',
        Location: artifact[2],
        Notes: '',
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: ARTIFACT_ID_FIELD, idPrefix: 'RART' });
    });

    issues.critical.concat(issues.warnings).forEach(function (issue) {
      REOS.Database.insert(ARTIFACTS_SHEET, {
        [PACKAGE_ID_FIELD]: pkg[PACKAGE_ID_FIELD],
        Artifact: issue.area,
        Category: 'Readiness Issue',
        Status: issue.severity,
        Location: '',
        Notes: issue.message,
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: ARTIFACT_ID_FIELD, idPrefix: 'RART' });
    });

    REOS.Logger.audit('GA release package generated', { packageId: pkg[PACKAGE_ID_FIELD], version: version, status: status, score: score });
    return { ok: true, packageId: pkg[PACKAGE_ID_FIELD], version: version, environment: environment, status: status, score: score, criticalIssues: issues.critical.length, warnings: issues.warnings.length, manifest: manifest, issues: issues, artifacts: getArtifacts(pkg[PACKAGE_ID_FIELD]) };
  }

  function getArtifacts(packageId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(ARTIFACTS_SHEET).filter(function (row) { return row[PACKAGE_ID_FIELD] === packageId; });
  }

  function buildManifest_(version, environment) {
    const props = PropertiesService.getScriptProperties().getProperties();
    return {
      application: 'REOS Enterprise',
      version: version,
      releaseType: 'GA',
      environment: environment,
      generatedAt: REOS.nowIso_(),
      scriptVersion: props.REOS_VERSION || (REOS.CONFIG && REOS.CONFIG.APP ? REOS.CONFIG.APP.VERSION : ''),
      deploymentMode: props.REOS_DEPLOYMENT_MODE || '',
      productionFolderId: props.REOS_PRODUCTION_FOLDER_ID || '',
      latestDeployment: latestRow_('DEPLOYMENT_RUNS', 'Started At'),
      latestSeedRun: latestRow_('SEED_RUNS', 'Started At'),
      latestValidation: latestRow_('OPERATIONAL_VALIDATION_RUNS', 'Started At'),
      latestMonitoring: latestRow_('MONITORING_SNAPSHOTS', 'Created At'),
      latestHardening: latestRow_('HARDENING_REPORTS', 'Created At'),
      packageArtifacts: REQUIRED_ARTIFACTS.map(function (a) { return { artifact: a[0], category: a[1], location: a[2] }; })
    };
  }

  function evaluateReadiness_(manifest) {
    const critical = [];
    const warnings = [];
    if (!manifest.latestDeployment) critical.push(issue_('Deployment', 'Critical', 'No deployment run found.'));
    if (!manifest.latestSeedRun) critical.push(issue_('Enterprise Seeder', 'Critical', 'No enterprise seed run found.'));
    if (!manifest.latestValidation) critical.push(issue_('Operational Validation', 'Critical', 'No operational validation run found.'));
    if (!manifest.latestMonitoring) warnings.push(issue_('Production Monitoring', 'Warning', 'No monitoring snapshot found.'));
    if (!manifest.latestHardening) warnings.push(issue_('Production Hardening', 'Warning', 'No production hardening report found.'));
    if (!manifest.productionFolderId) warnings.push(issue_('Drive Folder', 'Warning', 'Production folder property is not configured.'));
    return { critical: critical, warnings: warnings };
  }

  function issue_(area, severity, message) { return { area: area, severity: severity, message: message }; }

  function latestRow_(sheetName, dateField) {
    try { return latest_(REOS.Database.getAll(sheetName), dateField, 1)[0] || null; } catch (error) { return null; }
  }

  function latest_(records, dateField, limit) {
    return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 25);
  }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, generatePackage: generatePackage, getArtifacts: getArtifacts };
})();

function reosReleasePackageEnsureSheets() { return REOS.ReleasePackage.ensureSheets(); }
function reosReleasePackageDashboard() { return REOS.ReleasePackage.getDashboard(); }
function reosReleasePackageGenerate(options) { return REOS.ReleasePackage.generatePackage(options || {}); }
function reosReleasePackageArtifacts(packageId) { return REOS.ReleasePackage.getArtifacts(packageId); }
function showReleasePackage() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('ReleasePackage').setTitle('REOS Release Package').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Release Package');
}

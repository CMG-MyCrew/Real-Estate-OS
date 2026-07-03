/**
 * REOS Enterprise v3.0 - Deployment & Release Management Framework
 *
 * Release tracking, migration execution, environment readiness, and production
 * deployment controls for Apps Script / Sheets deployments.
 */

var REOS = REOS || {};

REOS.Deployment = (function () {
  const RELEASES_SHEET = 'RELEASES';
  const MIGRATIONS_SHEET = 'MIGRATIONS';

  const RELEASE_HEADERS = [
    'Release ID', 'Version', 'Environment', 'Status', 'Released At', 'Released By',
    'Git Commit', 'Summary', 'Rollback Plan', 'Notes', 'Created At', 'Updated At'
  ];

  const MIGRATION_HEADERS = [
    'Migration ID', 'Version', 'Name', 'Status', 'Started At', 'Finished At',
    'Message', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(RELEASES_SHEET, RELEASE_HEADERS);
    ensureTable_(MIGRATIONS_SHEET, MIGRATION_HEADERS);
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

  function createRelease(release) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    release = release || {};
    release.Environment = release.Environment || 'Production';
    release.Status = release.Status || 'Planned';
    release['Released By'] = release['Released By'] || REOS.Security.getCurrentUserEmail();
    const validation = REOS.Validation.validateRecord(release, { required: ['Version', 'Summary'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    return REOS.Database.insert(RELEASES_SHEET, release, { idField: 'Release ID', idPrefix: 'REL' });
  }

  function markReleased(releaseId, gitCommit) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const health = REOS.Monitoring.runHealthSuite();
    if (health.overallStatus !== 'Healthy') throw new Error('Cannot release while health status is ' + health.overallStatus);
    return REOS.Database.update(RELEASES_SHEET, 'Release ID', releaseId, {
      Status: 'Released',
      'Released At': new Date(),
      'Git Commit': gitCommit || ''
    });
  }

  function runMigration(version, name, fnName) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const started = new Date();
    let row = REOS.Database.insert(MIGRATIONS_SHEET, {
      Version: version,
      Name: name,
      Status: 'Started',
      'Started At': started
    }, { idField: 'Migration ID', idPrefix: 'MIG' });

    try {
      if (fnName && typeof this[fnName] === 'function') this[fnName]();
      row = REOS.Database.update(MIGRATIONS_SHEET, 'Migration ID', row['Migration ID'], {
        Status: 'Completed',
        'Finished At': new Date(),
        Message: 'Migration completed.'
      });
      return row;
    } catch (error) {
      REOS.Database.update(MIGRATIONS_SHEET, 'Migration ID', row['Migration ID'], {
        Status: 'Error',
        'Finished At': new Date(),
        Message: error.message
      });
      throw error;
    }
  }

  function readinessReport() {
    return {
      health: REOS.Monitoring.runHealthSuite(),
      latestBackup: REOS.Backup.listBackups(1)[0] || null,
      releases: REOS.Database.getAll(RELEASES_SHEET).slice(-10).reverse(),
      migrations: REOS.Database.getAll(MIGRATIONS_SHEET).slice(-10).reverse(),
      generatedAt: new Date()
    };
  }

  return {
    ensureSheets: ensureSheets,
    createRelease: createRelease,
    markReleased: markReleased,
    runMigration: runMigration,
    readinessReport: readinessReport
  };
})();

function deploymentCreateRelease(release) { return REOS.Deployment.createRelease(release || {}); }
function deploymentMarkReleased(releaseId, gitCommit) { return REOS.Deployment.markReleased(releaseId, gitCommit); }
function deploymentReadinessReport() { return REOS.Deployment.readinessReport(); }

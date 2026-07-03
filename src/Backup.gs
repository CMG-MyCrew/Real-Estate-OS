/**
 * REOS Enterprise v3.0 - Backup & Recovery Framework
 *
 * Spreadsheet snapshots, Drive backups, restore checklist, retention tracking,
 * and production recovery controls.
 */

var REOS = REOS || {};

REOS.Backup = (function () {
  const BACKUP_SHEET = 'BACKUPS';
  const ID_FIELD = 'Backup ID';

  const HEADERS = [
    'Backup ID', 'Backup Date', 'Backup Type', 'Source Spreadsheet ID',
    'Backup Spreadsheet ID', 'Backup URL', 'Folder ID', 'Status', 'Retention Days',
    'Size Note', 'Notes', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(BACKUP_SHEET);
    if (!sheet) sheet = ss.insertSheet(BACKUP_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function createSpreadsheetBackup(notes) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const folder = getBackupFolder_();
    const sourceFile = DriveApp.getFileById(ss.getId());
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm-ss');
    const copy = sourceFile.makeCopy('REOS Backup - ' + stamp, folder);
    const row = REOS.Database.insert(BACKUP_SHEET, {
      'Backup Date': new Date(),
      'Backup Type': 'Spreadsheet Copy',
      'Source Spreadsheet ID': ss.getId(),
      'Backup Spreadsheet ID': copy.getId(),
      'Backup URL': copy.getUrl(),
      'Folder ID': folder.getId(),
      Status: 'Completed',
      'Retention Days': 90,
      'Size Note': 'Google Drive copy',
      Notes: notes || ''
    }, { idField: ID_FIELD, idPrefix: 'BAK' });
    REOS.Logger.audit('Spreadsheet backup created', { backupId: row[ID_FIELD] });
    return row;
  }

  function listBackups(limit) {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    return REOS.Database.getAll(BACKUP_SHEET).slice(-Number(limit || 50)).reverse();
  }

  function markRestoreTested(backupId, notes) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    return REOS.Database.update(BACKUP_SHEET, ID_FIELD, backupId, {
      Status: 'Restore Tested',
      Notes: notes || 'Restore test completed.'
    });
  }

  function cleanupExpiredBackups() {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    const backups = REOS.Database.getAll(BACKUP_SHEET);
    const now = new Date().getTime();
    let archived = 0;
    backups.forEach(function (backup) {
      const date = toDate_(backup['Backup Date']);
      const retention = Number(backup['Retention Days'] || 90);
      if (date && now - date.getTime() > retention * 86400000 && String(backup.Status || '') === 'Completed') {
        REOS.Database.update(BACKUP_SHEET, ID_FIELD, backup[ID_FIELD], { Status: 'Expired' });
        archived++;
      }
    });
    return { expiredMarked: archived };
  }

  function getBackupFolder_() {
    const id = REOS.getProperty_('REOS_BACKUP_FOLDER_ID');
    if (id) return DriveApp.getFolderById(id);
    const root = REOS.GoogleDrive && REOS.GoogleDrive.getRootFolder ? REOS.GoogleDrive.getRootFolder() : DriveApp.getRootFolder();
    const folder = root.createFolder('REOS Backups');
    REOS.setProperty_('REOS_BACKUP_FOLDER_ID', folder.getId());
    return folder;
  }

  function toDate_(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return {
    ensureSheet: ensureSheet,
    createSpreadsheetBackup: createSpreadsheetBackup,
    listBackups: listBackups,
    markRestoreTested: markRestoreTested,
    cleanupExpiredBackups: cleanupExpiredBackups
  };
})();

function backupCreateSpreadsheet(notes) { return REOS.Backup.createSpreadsheetBackup(notes); }
function backupList(limit) { return REOS.Backup.listBackups(limit); }
function backupMarkRestoreTested(backupId, notes) { return REOS.Backup.markRestoreTested(backupId, notes); }
function backupCleanupExpired() { return REOS.Backup.cleanupExpiredBackups(); }

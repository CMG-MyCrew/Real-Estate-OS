/**
 * REOS Enterprise v3.0 - Google Drive Document Framework
 *
 * Creates organized Drive folders for clients, properties, transactions,
 * rentals, and generated documents.
 */

var REOS = REOS || {};

REOS.GoogleDrive = (function () {
  const SHEET = 'DRIVE_FOLDERS';
  const ID_FIELD = 'Folder Record ID';

  const HEADERS = [
    'Folder Record ID', 'Record ID', 'Record Type', 'Folder Name', 'Folder ID',
    'Folder URL', 'Parent Folder ID', 'Status', 'Notes', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function getRootFolder() {
    const rootId = REOS.getProperty_('REOS_ROOT_DRIVE_FOLDER_ID');
    if (rootId) return DriveApp.getFolderById(rootId);
    const folder = DriveApp.createFolder('REOS Enterprise');
    REOS.setProperty_('REOS_ROOT_DRIVE_FOLDER_ID', folder.getId());
    return folder;
  }

  function createFolder(recordId, recordType, folderName, parentFolderId) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();

    const parent = parentFolderId ? DriveApp.getFolderById(parentFolderId) : getRootFolder();
    const folder = parent.createFolder(safeName_(folderName || (recordType + ' - ' + recordId)));

    const created = REOS.Database.insert(SHEET, {
      'Record ID': recordId,
      'Record Type': recordType,
      'Folder Name': folder.getName(),
      'Folder ID': folder.getId(),
      'Folder URL': folder.getUrl(),
      'Parent Folder ID': parent.getId(),
      Status: 'Active'
    }, { idField: ID_FIELD, idPrefix: 'DF' });

    REOS.Logger.audit('Drive folder created', { folderRecordId: created[ID_FIELD], recordId: recordId });
    return created;
  }

  function createRecordFolder(recordId, recordType, displayName) {
    const folderName = recordType + ' - ' + (displayName || recordId);
    return createFolder(recordId, recordType, folderName, null);
  }

  function findFolder(recordId, recordType) {
    ensureSheet();
    const matches = REOS.Database.query(SHEET, function (row) {
      return String(row['Record ID'] || '') === String(recordId || '') &&
        String(row['Record Type'] || '') === String(recordType || '') &&
        String(row.Status || '') === 'Active';
    });
    return matches.length ? matches[0] : null;
  }

  function getOrCreateFolder(recordId, recordType, displayName) {
    const existing = findFolder(recordId, recordType);
    return existing || createRecordFolder(recordId, recordType, displayName);
  }

  function copyTemplateToFolder(templateFileId, folderId, newName) {
    REOS.Security.requirePermission('documents:write');
    const template = DriveApp.getFileById(templateFileId);
    const folder = DriveApp.getFolderById(folderId);
    const copy = template.makeCopy(safeName_(newName || template.getName()), folder);
    return {
      fileId: copy.getId(),
      fileName: copy.getName(),
      fileUrl: copy.getUrl(),
      folderId: folderId
    };
  }

  function exportGoogleDocAsPdf(fileId, folderId, pdfName) {
    REOS.Security.requirePermission('documents:write');
    const file = DriveApp.getFileById(fileId);
    const blob = file.getAs(MimeType.PDF).setName(safeName_(pdfName || file.getName()) + '.pdf');
    const folder = folderId ? DriveApp.getFolderById(folderId) : getRootFolder();
    const pdf = folder.createFile(blob);
    return {
      fileId: pdf.getId(),
      fileName: pdf.getName(),
      fileUrl: pdf.getUrl(),
      folderId: folder.getId()
    };
  }

  function safeName_(name) {
    return String(name || 'Untitled').replace(/[\\/:*?"<>|]/g, '-').trim();
  }

  return {
    ensureSheet: ensureSheet,
    getRootFolder: getRootFolder,
    createFolder: createFolder,
    createRecordFolder: createRecordFolder,
    findFolder: findFolder,
    getOrCreateFolder: getOrCreateFolder,
    copyTemplateToFolder: copyTemplateToFolder,
    exportGoogleDocAsPdf: exportGoogleDocAsPdf
  };
})();

function driveCreateRecordFolder(recordId, recordType, displayName) {
  return REOS.GoogleDrive.createRecordFolder(recordId, recordType, displayName);
}

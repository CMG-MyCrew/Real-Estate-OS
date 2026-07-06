/**
 * REOS Enterprise v3.0 - Sprint 15 Document/Photo Management Foundation
 *
 * Drive-backed document registry for leads, properties, vendors, work orders,
 * inspections, maintenance requests, CRM records, and general records.
 */

var REOS = REOS || {};

REOS.Documents = (function () {
  const DOCUMENTS_SHEET = 'DOCUMENTS';
  const FOLDERS_SHEET = 'DOCUMENT_FOLDERS';
  const EVENTS_SHEET = 'DOCUMENT_EVENTS';
  const DOCUMENT_ID_FIELD = 'Document ID';
  const FOLDER_ID_FIELD = 'Folder Record ID';
  const EVENT_ID_FIELD = 'Document Event ID';

  const DOCUMENT_HEADERS = [
    'Document ID', 'Record Type', 'Record ID', 'Category', 'Document Type', 'Title',
    'Description', 'File Name', 'File ID', 'File URL', 'Folder ID', 'Mime Type',
    'Size Bytes', 'Status', 'Tags', 'Uploaded By', 'Created At', 'Updated At'
  ];
  const FOLDER_HEADERS = ['Folder Record ID', 'Record Type', 'Record ID', 'Folder Name', 'Folder ID', 'Folder URL', 'Status', 'Created By', 'Created At', 'Updated At'];
  const EVENT_HEADERS = ['Document Event ID', 'Document ID', 'Event Type', 'Message', 'User', 'Details JSON', 'Created At', 'Updated At'];
  const CATEGORIES = ['Acquisitions', 'Properties', 'Vendors', 'Work Orders', 'Inspections', 'Maintenance', 'CRM', 'Admin', 'General'];
  const TYPES = ['Photo', 'Contract', 'Invoice', 'Estimate', 'Inspection Report', 'Scope of Work', 'Permit', 'Proof of Completion', 'Owner Document', 'ID', 'Other'];

  function ensureSheets() {
    ensureTable_(DOCUMENTS_SHEET, DOCUMENT_HEADERS);
    ensureTable_(FOLDERS_SHEET, FOLDER_HEADERS);
    ensureTable_(EVENTS_SHEET, EVENT_HEADERS);
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

  function getDashboard(options) {
    REOS.Security.requirePermission('dashboard:view');
    ensureSheets();
    options = options || {};
    let documents = REOS.Database.getAll(DOCUMENTS_SHEET);
    if (options.recordType) documents = documents.filter(function (doc) { return String(doc['Record Type']) === String(options.recordType); });
    if (options.recordId) documents = documents.filter(function (doc) { return String(doc['Record ID']) === String(options.recordId); });
    const folders = REOS.Database.getAll(FOLDERS_SHEET);
    const events = REOS.Database.getAll(EVENTS_SHEET);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      categories: CATEGORIES,
      types: TYPES,
      kpis: {
        documents: documents.length,
        photos: documents.filter(function (d) { return String(d['Document Type']) === 'Photo'; }).length,
        active: documents.filter(function (d) { return String(d.Status || 'Active') === 'Active'; }).length,
        folders: folders.length,
        events: events.length
      },
      documents: latest_(documents, 'Created At', Number(options.limit || 100)),
      folders: latest_(folders, 'Created At', 50),
      events: latest_(events, 'Created At', 50)
    };
  }

  function createFolder(recordType, recordId, folderName) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();
    recordType = String(recordType || 'General');
    recordId = String(recordId || 'GENERAL');
    folderName = folderName || 'REOS - ' + recordType + ' - ' + recordId;
    const existing = REOS.Database.getAll(FOLDERS_SHEET).filter(function (row) {
      return String(row['Record Type']) === recordType && String(row['Record ID']) === recordId && String(row.Status || 'Active') === 'Active';
    })[0];
    if (existing) return existing;
    const folder = DriveApp.createFolder(folderName);
    return REOS.Database.insert(FOLDERS_SHEET, {
      'Record Type': recordType,
      'Record ID': recordId,
      'Folder Name': folderName,
      'Folder ID': folder.getId(),
      'Folder URL': folder.getUrl(),
      Status: 'Active',
      'Created By': Session.getActiveUser().getEmail() || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: FOLDER_ID_FIELD, idPrefix: 'DFLD' });
  }

  function linkFile(record) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();
    record = record || {};
    if (!record['Record Type']) throw new Error('Record Type is required.');
    if (!record['Record ID']) throw new Error('Record ID is required.');
    if (!record['File URL'] && !record['File ID']) throw new Error('File URL or File ID is required.');
    const fileId = record['File ID'] || extractDriveFileId_(record['File URL']);
    const fileMeta = fileId ? getDriveFileMeta_(fileId) : {};
    const folder = record['Folder ID'] ? null : createFolder(record['Record Type'], record['Record ID']);
    const row = REOS.Database.insert(DOCUMENTS_SHEET, {
      'Record Type': record['Record Type'],
      'Record ID': record['Record ID'],
      Category: record.Category || inferCategory_(record['Record Type']),
      'Document Type': record['Document Type'] || 'Other',
      Title: record.Title || fileMeta.name || record['File Name'] || 'Untitled Document',
      Description: record.Description || '',
      'File Name': record['File Name'] || fileMeta.name || '',
      'File ID': fileId || '',
      'File URL': record['File URL'] || fileMeta.url || '',
      'Folder ID': record['Folder ID'] || (folder ? folder['Folder ID'] : ''),
      'Mime Type': record['Mime Type'] || fileMeta.mimeType || '',
      'Size Bytes': record['Size Bytes'] || fileMeta.size || '',
      Status: record.Status || 'Active',
      Tags: record.Tags || '',
      'Uploaded By': Session.getActiveUser().getEmail() || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: DOCUMENT_ID_FIELD, idPrefix: 'DOC' });
    logEvent_(row[DOCUMENT_ID_FIELD], 'Linked', 'Document linked to record.', { recordType: row['Record Type'], recordId: row['Record ID'], fileId: fileId });
    return row;
  }

  function listDocuments(options) {
    REOS.Security.requirePermission('dashboard:view');
    ensureSheets();
    options = options || {};
    let rows = REOS.Database.getAll(DOCUMENTS_SHEET);
    ['recordType', 'recordId', 'documentType', 'category'].forEach(function (key) {
      const fieldMap = { recordType: 'Record Type', recordId: 'Record ID', documentType: 'Document Type', category: 'Category' };
      if (options[key]) rows = rows.filter(function (row) { return String(row[fieldMap[key]]) === String(options[key]); });
    });
    return latest_(rows, 'Created At', Number(options.limit || 100));
  }

  function updateDocument(documentId, changes) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();
    const updated = REOS.Database.update(DOCUMENTS_SHEET, DOCUMENT_ID_FIELD, documentId, Object.assign({}, changes || {}, { 'Updated At': new Date() }));
    logEvent_(documentId, 'Updated', 'Document metadata updated.', changes || {});
    return updated;
  }

  function archiveDocument(documentId) { return updateDocument(documentId, { Status: 'Archived' }); }

  function getDocumentEvents(documentId) {
    REOS.Security.requirePermission('dashboard:view');
    ensureSheets();
    return latest_(REOS.Database.getAll(EVENTS_SHEET).filter(function (row) { return String(row['Document ID']) === String(documentId); }), 'Created At', 100);
  }

  function logEvent_(documentId, eventType, message, details) {
    return REOS.Database.insert(EVENTS_SHEET, {
      'Document ID': documentId,
      'Event Type': eventType,
      Message: message,
      User: Session.getActiveUser().getEmail() || '',
      'Details JSON': REOS.toJson_(details || {}),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: EVENT_ID_FIELD, idPrefix: 'DEVT' });
  }

  function extractDriveFileId_(url) {
    url = String(url || '');
    const patterns = [/\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /folders\/([a-zA-Z0-9_-]+)/];
    for (let i = 0; i < patterns.length; i++) {
      const match = url.match(patterns[i]);
      if (match && match[1]) return match[1];
    }
    return '';
  }

  function getDriveFileMeta_(fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      return { name: file.getName(), url: file.getUrl(), mimeType: file.getMimeType(), size: file.getSize() };
    } catch (error) {
      return { name: '', url: '', mimeType: '', size: '', error: error.message };
    }
  }

  function inferCategory_(recordType) {
    const value = String(recordType || '').toLowerCase();
    if (value.indexOf('lead') !== -1 || value.indexOf('acquisition') !== -1) return 'Acquisitions';
    if (value.indexOf('property') !== -1 || value.indexOf('unit') !== -1) return 'Properties';
    if (value.indexOf('vendor') !== -1) return 'Vendors';
    if (value.indexOf('work') !== -1) return 'Work Orders';
    if (value.indexOf('inspection') !== -1) return 'Inspections';
    if (value.indexOf('maintenance') !== -1) return 'Maintenance';
    if (value.indexOf('crm') !== -1 || value.indexOf('client') !== -1) return 'CRM';
    return 'General';
  }

  function latest_(records, dateField, limit) {
    return (records || []).slice().sort(function (a, b) {
      return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0);
    }).slice(0, limit || 100);
  }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, createFolder: createFolder, linkFile: linkFile, listDocuments: listDocuments, updateDocument: updateDocument, archiveDocument: archiveDocument, getDocumentEvents: getDocumentEvents };
})();

function reosDocumentsEnsureSheets() { return REOS.Documents.ensureSheets(); }
function reosDocumentsDashboard(options) { return REOS.Documents.getDashboard(options || {}); }
function reosDocumentsCreateFolder(recordType, recordId, folderName) { return REOS.Documents.createFolder(recordType, recordId, folderName); }
function reosDocumentsLinkFile(record) { return REOS.Documents.linkFile(record || {}); }
function reosDocumentsList(options) { return REOS.Documents.listDocuments(options || {}); }
function reosDocumentsUpdate(documentId, changes) { return REOS.Documents.updateDocument(documentId, changes || {}); }
function reosDocumentsArchive(documentId) { return REOS.Documents.archiveDocument(documentId); }
function reosDocumentsEvents(documentId) { return REOS.Documents.getDocumentEvents(documentId); }
function showDocuments() {
  REOS.Security.requirePermission('dashboard:view');
  const html = HtmlService.createHtmlOutputFromFile('Documents').setTitle('REOS Documents').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Documents');
}

/**
 * REOS Enterprise v3.0 - Document Management Framework
 *
 * Central document library for clients, transactions, rentals, properties,
 * templates, versions, Drive links, verification, and eSignature tracking.
 */

var REOS = REOS || {};

REOS.Documents = (function () {
  const SHEET = 'DOCUMENTS';
  const ID_FIELD = 'Document ID';

  const HEADERS = [
    'Document ID', 'Record ID', 'Record Type', 'Document Type', 'Document Name',
    'Required', 'Uploaded', 'Upload Date', 'Drive File ID', 'Drive URL',
    'Folder ID', 'Version', 'Status', 'Verified', 'Verified By', 'Signature Status',
    'Expiration Date', 'Tags', 'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const CHECKLISTS = {
    Transaction: [
      'Purchase Agreement', 'Seller Disclosure', 'Inspection Report', 'Appraisal',
      'Loan Approval', 'Title Commitment', 'Closing Disclosure', 'Settlement Statement'
    ],
    Rental: [
      'Lease Agreement', 'Move-In Inspection', 'Security Deposit Receipt',
      'Tenant ID', 'Renters Insurance', 'Renewal Agreement'
    ],
    Client: [
      'Agency Agreement', 'Disclosure Forms', 'ID Verification', 'Pre-Approval Letter'
    ],
    Investment: [
      'Deal Analysis', 'Scope of Work', 'Contractor Estimate', 'Before Photos', 'After Photos'
    ]
  };

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

  function createChecklist(recordId, recordType, folderId) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();
    const types = CHECKLISTS[recordType] || [];
    return types.map(function (type) {
      return createMetadata({
        'Record ID': recordId,
        'Record Type': recordType,
        'Document Type': type,
        'Document Name': type,
        Required: true,
        Uploaded: false,
        Verified: false,
        Version: 1,
        Status: 'Missing',
        'Signature Status': 'Not Required',
        'Folder ID': folderId || '',
        Active: true
      });
    });
  }

  function createMetadata(documentRecord) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();
    documentRecord = documentRecord || {};
    documentRecord.Version = Number(documentRecord.Version || 1);
    documentRecord.Status = documentRecord.Status || (documentRecord.Uploaded ? 'Uploaded' : 'Missing');
    documentRecord.Active = documentRecord.Active === false ? false : true;
    const validation = REOS.Validation.validateRecord(documentRecord, {
      required: ['Record ID', 'Record Type', 'Document Type']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(SHEET, documentRecord, { idField: ID_FIELD, idPrefix: 'D' });
    REOS.Logger.audit('Document metadata created', { documentId: created[ID_FIELD], recordId: created['Record ID'] });
    return created;
  }

  function upload(documentId, driveUrl, notes) {
    return updateDocument(documentId, {
      Uploaded: true,
      'Upload Date': new Date(),
      'Drive URL': driveUrl,
      Status: 'Uploaded',
      Notes: notes || ''
    });
  }

  function attachDriveFile(documentId, fileId, folderId, notes) {
    const file = DriveApp.getFileById(fileId);
    return updateDocument(documentId, {
      Uploaded: true,
      'Upload Date': new Date(),
      'Drive File ID': fileId,
      'Drive URL': file.getUrl(),
      'Folder ID': folderId || '',
      Status: 'Uploaded',
      Notes: notes || ''
    });
  }

  function createNewVersion(documentId, fileId, notes) {
    REOS.Security.requirePermission('documents:write');
    const current = get(documentId);
    if (!current) throw new Error('Document not found: ' + documentId);
    const file = fileId ? DriveApp.getFileById(fileId) : null;
    const updated = updateDocument(documentId, {
      Version: Number(current.Version || 1) + 1,
      Uploaded: !!fileId || current.Uploaded,
      'Upload Date': fileId ? new Date() : current['Upload Date'],
      'Drive File ID': fileId || current['Drive File ID'],
      'Drive URL': file ? file.getUrl() : current['Drive URL'],
      Status: fileId ? 'Uploaded' : current.Status,
      Verified: false,
      'Verified By': '',
      Notes: notes || current.Notes || ''
    });
    REOS.Logger.audit('Document version created', { documentId: documentId, version: updated.Version });
    return updated;
  }

  function verify(documentId) {
    const updated = updateDocument(documentId, {
      Verified: true,
      'Verified By': REOS.Security.getCurrentUserEmail(),
      Status: 'Verified'
    });
    REOS.Logger.audit('Document verified', { documentId: documentId });
    return updated;
  }

  function updateSignatureStatus(documentId, signatureStatus) {
    return updateDocument(documentId, {
      'Signature Status': signatureStatus,
      Status: signatureStatus === 'Completed' ? 'Signed' : 'Signature Pending'
    });
  }

  function updateDocument(documentId, changes) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();
    return REOS.Database.update(SHEET, ID_FIELD, documentId, changes || {});
  }

  function get(documentId) {
    REOS.Security.requirePermission('documents:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, documentId);
  }

  function listForRecord(recordId) {
    REOS.Security.requirePermission('documents:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (doc) {
      return String(doc['Record ID'] || '') === String(recordId || '');
    });
  }

  function search(query) {
    REOS.Security.requirePermission('documents:read');
    ensureSheet();
    const q = String(query || '').trim().toLowerCase();
    return REOS.Database.query(SHEET, function (doc) {
      if (!q) return doc.Active !== false;
      return [doc['Document Name'], doc['Document Type'], doc['Record Type'], doc['Record ID'], doc.Tags, doc.Notes]
        .join(' ').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 100);
  }

  function missingForRecord(recordId) {
    return listForRecord(recordId).filter(function (doc) {
      return doc.Required === true && doc.Uploaded !== true;
    });
  }

  return {
    ensureSheet: ensureSheet,
    createChecklist: createChecklist,
    createMetadata: createMetadata,
    upload: upload,
    attachDriveFile: attachDriveFile,
    createNewVersion: createNewVersion,
    verify: verify,
    updateSignatureStatus: updateSignatureStatus,
    updateDocument: updateDocument,
    get: get,
    listForRecord: listForRecord,
    search: search,
    missingForRecord: missingForRecord
  };
})();

function documentsForRecord(recordId) { return REOS.Documents.listForRecord(recordId); }
function documentsSearch(query) { return REOS.Documents.search(query); }
function documentsCreateChecklist(recordId, recordType, folderId) { return REOS.Documents.createChecklist(recordId, recordType, folderId); }

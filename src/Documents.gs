/**
 * REOS Enterprise v3.0 - Documents Framework
 *
 * Tracks required transaction documents, Drive links, verification, and missing items.
 */

var REOS = REOS || {};

REOS.Documents = (function () {
  const SHEET = 'DOCUMENTS';
  const ID_FIELD = 'Document ID';

  const HEADERS = [
    'Document ID', 'Record ID', 'Record Type', 'Document Type', 'Required',
    'Uploaded', 'Upload Date', 'Drive URL', 'Version', 'Verified',
    'Verified By', 'Notes', 'Created At', 'Updated At'
  ];

  const TRANSACTION_DOCUMENTS = [
    'Purchase Agreement',
    'Seller Disclosure',
    'Inspection Report',
    'Appraisal',
    'Loan Approval',
    'Title Commitment',
    'Closing Disclosure',
    'Settlement Statement'
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

  function createChecklist(recordId, recordType) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();

    const types = recordType === 'Transaction' ? TRANSACTION_DOCUMENTS : [];
    return types.map(function (type) {
      return REOS.Database.insert(SHEET, {
        'Record ID': recordId,
        'Record Type': recordType,
        'Document Type': type,
        Required: true,
        Uploaded: false,
        Verified: false,
        Version: 1
      }, {
        idField: ID_FIELD,
        idPrefix: 'D'
      });
    });
  }

  function upload(documentId, driveUrl, notes) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();
    const updated = REOS.Database.update(SHEET, ID_FIELD, documentId, {
      Uploaded: true,
      'Upload Date': new Date(),
      'Drive URL': driveUrl,
      Notes: notes || ''
    });
    REOS.Logger.audit('Document uploaded', { documentId: documentId });
    return updated;
  }

  function verify(documentId) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();
    const updated = REOS.Database.update(SHEET, ID_FIELD, documentId, {
      Verified: true,
      'Verified By': REOS.Security.getCurrentUserEmail()
    });
    REOS.Logger.audit('Document verified', { documentId: documentId });
    return updated;
  }

  function listForRecord(recordId) {
    REOS.Security.requirePermission('documents:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (doc) {
      return String(doc['Record ID'] || '') === String(recordId || '');
    });
  }

  function missingForRecord(recordId) {
    return listForRecord(recordId).filter(function (doc) {
      return doc.Required === true && doc.Uploaded !== true;
    });
  }

  return {
    ensureSheet: ensureSheet,
    createChecklist: createChecklist,
    upload: upload,
    verify: verify,
    listForRecord: listForRecord,
    missingForRecord: missingForRecord
  };
})();

function documentsForRecord(recordId) {
  return REOS.Documents.listForRecord(recordId);
}

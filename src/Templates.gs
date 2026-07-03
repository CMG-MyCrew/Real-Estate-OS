/**
 * REOS Enterprise v3.0 - Document Templates Framework
 *
 * Registers templates, merges record data, generates Google Docs/PDFs,
 * and stores generated document metadata.
 */

var REOS = REOS || {};

REOS.Templates = (function () {
  const SHEET = 'DOCUMENT_TEMPLATES';
  const ID_FIELD = 'Template ID';

  const HEADERS = [
    'Template ID', 'Template Name', 'Template Type', 'Drive File ID', 'Description',
    'Active', 'Created At', 'Updated At'
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

  function registerTemplate(template) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();
    template = template || {};
    template.Active = template.Active === false ? false : true;
    const validation = REOS.Validation.validateRecord(template, {
      required: ['Template Name', 'Template Type', 'Drive File ID']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(SHEET, template, { idField: ID_FIELD, idPrefix: 'TPL' });
    REOS.Logger.audit('Template registered', { templateId: created[ID_FIELD], type: created['Template Type'] });
    return created;
  }

  function listActive() {
    REOS.Security.requirePermission('documents:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (tpl) { return tpl.Active !== false; });
  }

  function get(templateId) {
    REOS.Security.requirePermission('documents:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, templateId);
  }

  function generateDocument(templateId, recordType, recordId, data) {
    REOS.Security.requirePermission('documents:write');
    const template = get(templateId);
    if (!template) throw new Error('Template not found: ' + templateId);

    data = data || {};
    data['Record ID'] = recordId;
    data['Record Type'] = recordType;

    const folder = REOS.GoogleDrive.getOrCreateFolder(recordId, recordType, data.Name || data.Address || recordId);
    const generatedName = template['Template Name'] + ' - ' + (data.Name || data.Address || recordId);
    const copied = REOS.GoogleDrive.copyTemplateToFolder(template['Drive File ID'], folder['Folder ID'], generatedName);

    mergeGoogleDoc_(copied.fileId, data);

    const docRecord = REOS.Documents.createMetadata({
      'Record ID': recordId,
      'Record Type': recordType,
      'Document Type': template['Template Type'],
      'Document Name': generatedName,
      Required: false,
      Uploaded: true,
      'Upload Date': new Date(),
      'Drive File ID': copied.fileId,
      'Drive URL': copied.fileUrl,
      'Folder ID': folder['Folder ID'],
      Version: 1,
      Status: 'Generated',
      Verified: false,
      'Signature Status': 'Not Required',
      Active: true
    });

    REOS.Logger.audit('Document generated from template', { templateId: templateId, documentId: docRecord['Document ID'] });
    return docRecord;
  }

  function generatePdf(documentId) {
    const doc = REOS.Documents.get(documentId);
    if (!doc || !doc['Drive File ID']) throw new Error('Document file not found: ' + documentId);
    const pdf = REOS.GoogleDrive.exportGoogleDocAsPdf(doc['Drive File ID'], doc['Folder ID'], doc['Document Name']);
    return REOS.Documents.createMetadata({
      'Record ID': doc['Record ID'],
      'Record Type': doc['Record Type'],
      'Document Type': doc['Document Type'] + ' PDF',
      'Document Name': pdf.fileName,
      Required: false,
      Uploaded: true,
      'Upload Date': new Date(),
      'Drive File ID': pdf.fileId,
      'Drive URL': pdf.fileUrl,
      'Folder ID': pdf.folderId,
      Version: 1,
      Status: 'Generated PDF',
      Verified: false,
      'Signature Status': 'Not Required',
      Active: true
    });
  }

  function mergeGoogleDoc_(fileId, data) {
    const doc = DocumentApp.openById(fileId);
    const body = doc.getBody();
    Object.keys(data || {}).forEach(function (key) {
      body.replaceText('{{\\s*' + escapeRegExp_(key) + '\\s*}}', String(data[key] || ''));
    });
    doc.saveAndClose();
  }

  function escapeRegExp_(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return {
    ensureSheet: ensureSheet,
    registerTemplate: registerTemplate,
    listActive: listActive,
    get: get,
    generateDocument: generateDocument,
    generatePdf: generatePdf
  };
})();

function templatesRegister(template) { return REOS.Templates.registerTemplate(template); }
function templatesListActive() { return REOS.Templates.listActive(); }
function templatesGenerateDocument(templateId, recordType, recordId, data) {
  return REOS.Templates.generateDocument(templateId, recordType, recordId, data || {});
}

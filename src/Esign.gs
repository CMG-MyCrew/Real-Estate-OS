/**
 * REOS Enterprise v3.0 - eSignature Framework
 *
 * Provider-neutral eSignature request tracking. This is designed so DocuSign,
 * Dropbox Sign, PandaDoc, or another provider can be added behind this layer.
 */

var REOS = REOS || {};

REOS.Esign = (function () {
  const SHEET = 'ESIGN_REQUESTS';
  const ID_FIELD = 'Signature Request ID';

  const HEADERS = [
    'Signature Request ID', 'Document ID', 'Provider', 'Provider Request ID',
    'Recipient Name', 'Recipient Email', 'Subject', 'Message', 'Status',
    'Sent At', 'Completed At', 'Signed Document URL', 'Webhook Payload',
    'Notes', 'Created At', 'Updated At'
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

  function createRequest(request) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();

    request = request || {};
    request.Provider = request.Provider || 'Manual';
    request.Status = request.Status || 'Draft';
    request['Recipient Email'] = REOS.normalizeEmail_(request['Recipient Email']);

    const validation = REOS.Validation.validateRecord(request, {
      required: ['Document ID', 'Recipient Name', 'Recipient Email', 'Subject'],
      emailField: 'Recipient Email'
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, request, { idField: ID_FIELD, idPrefix: 'ES' });
    REOS.Documents.updateSignatureStatus(created['Document ID'], 'Draft');
    REOS.Logger.audit('eSignature request created', { requestId: created[ID_FIELD], documentId: created['Document ID'] });
    return created;
  }

  function markSent(requestId, providerRequestId) {
    const updated = update(requestId, {
      'Provider Request ID': providerRequestId || '',
      Status: 'Sent',
      'Sent At': new Date()
    });
    REOS.Documents.updateSignatureStatus(updated['Document ID'], 'Sent');
    return updated;
  }

  function markCompleted(requestId, signedDocumentUrl, payload) {
    const updated = update(requestId, {
      Status: 'Completed',
      'Completed At': new Date(),
      'Signed Document URL': signedDocumentUrl || '',
      'Webhook Payload': payload ? JSON.stringify(payload) : ''
    });
    REOS.Documents.updateSignatureStatus(updated['Document ID'], 'Completed');
    return updated;
  }

  function update(requestId, changes) {
    REOS.Security.requirePermission('documents:write');
    ensureSheet();
    return REOS.Database.update(SHEET, ID_FIELD, requestId, changes || {});
  }

  function get(requestId) {
    REOS.Security.requirePermission('documents:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, requestId);
  }

  function listOpen() {
    REOS.Security.requirePermission('documents:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (request) {
      return ['draft', 'sent', 'viewed'].indexOf(String(request.Status || '').toLowerCase()) !== -1;
    });
  }

  function handleWebhook(provider, payload) {
    REOS.Security.requirePermission('documents:write');
    payload = payload || {};
    const providerRequestId = payload.providerRequestId || payload.id || payload.request_id || '';
    const matches = REOS.Database.query(SHEET, function (request) {
      return String(request.Provider || '') === String(provider || '') &&
        String(request['Provider Request ID'] || '') === String(providerRequestId || '');
    });
    if (!matches.length) throw new Error('Signature request not found for provider request ID: ' + providerRequestId);
    const request = matches[0];
    const status = String(payload.status || '').toLowerCase();
    if (status === 'completed' || status === 'signed') {
      return markCompleted(request[ID_FIELD], payload.signedDocumentUrl || payload.signed_url || '', payload);
    }
    return update(request[ID_FIELD], { Status: payload.status || 'Updated', 'Webhook Payload': JSON.stringify(payload) });
  }

  return {
    ensureSheet: ensureSheet,
    createRequest: createRequest,
    markSent: markSent,
    markCompleted: markCompleted,
    update: update,
    get: get,
    listOpen: listOpen,
    handleWebhook: handleWebhook
  };
})();

function esignCreateRequest(request) { return REOS.Esign.createRequest(request); }
function esignListOpen() { return REOS.Esign.listOpen(); }
function esignMarkSent(requestId, providerRequestId) { return REOS.Esign.markSent(requestId, providerRequestId); }
function esignMarkCompleted(requestId, signedDocumentUrl) { return REOS.Esign.markCompleted(requestId, signedDocumentUrl); }

/**
 * REOS Enterprise v3.0 - Webhooks Framework
 *
 * Inbound/outbound webhook registry and dispatcher for Zapier, Make,
 * lead sources, eSignature callbacks, accounting callbacks, and API events.
 */

var REOS = REOS || {};

REOS.Webhooks = (function () {
  const SHEET = 'WEBHOOK_EVENTS';
  const ID_FIELD = 'Webhook Event ID';

  const HEADERS = [
    'Webhook Event ID', 'Received At', 'Source', 'Event Type', 'Record ID',
    'Status', 'Payload JSON', 'Response JSON', 'Error', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headersLength_()).setFontWeight('bold');
    }
    return sheet;
  }

  function headersLength_() { return HEADERS.length; }

  function receive(source, eventType, payload) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    payload = payload || {};
    const row = REOS.Database.insert(SHEET, {
      'Received At': new Date(),
      Source: source || '',
      'Event Type': eventType || '',
      'Record ID': payload.recordId || payload.id || '',
      Status: 'Received',
      'Payload JSON': JSON.stringify(payload)
    }, { idField: ID_FIELD, idPrefix: 'WH' });

    try {
      const response = route_(source, eventType, payload);
      return REOS.Database.update(SHEET, ID_FIELD, row[ID_FIELD], {
        Status: 'Processed',
        'Response JSON': JSON.stringify(response || {})
      });
    } catch (error) {
      REOS.Database.update(SHEET, ID_FIELD, row[ID_FIELD], { Status: 'Error', Error: error.message });
      throw error;
    }
  }

  function route_(source, eventType, payload) {
    const sourceKey = String(source || '').toLowerCase();
    if (sourceKey === 'docusign') return REOS.Esign.handleWebhook('DocuSign', payload);
    if (sourceKey === 'stripe') return REOS.Stripe.handleWebhook(eventType, payload);
    if (sourceKey === 'quickbooks') return REOS.QuickBooks.handleWebhook(eventType, payload);
    if (sourceKey === 'lead') return createLead_(payload);
    return REOS.Automation.dispatch('webhook.received', 'Integrations', { source: source, eventType: eventType, payload: payload });
  }

  function createLead_(payload) {
    return REOS.CRM.createLead({
      'Client ID': payload.clientId || '',
      'Lead Type': payload.leadType || 'Buyer',
      'Lead Source': payload.source || 'Webhook',
      Status: 'New',
      Notes: JSON.stringify(payload)
    });
  }

  function send(url, payload, headers) {
    REOS.Security.requirePermission('finance:write');
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: headers || {},
      payload: JSON.stringify(payload || {}),
      muteHttpExceptions: true
    });
    return { statusCode: res.getResponseCode(), body: res.getContentText() };
  }

  return { ensureSheet: ensureSheet, receive: receive, send: send };
})();

function webhooksReceive(source, eventType, payload) { return REOS.Webhooks.receive(source, eventType, payload || {}); }
function webhooksSend(url, payload, headers) { return REOS.Webhooks.send(url, payload || {}, headers || {}); }
